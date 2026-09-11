// Shared logic for api/extract.js (kick off) and api/extract-status.js (poll once).
//
// This used to all live in one function that polled Supadata internally until a job
// completed or ~40s passed, racing the whole thing against the serverless function's own
// duration limit — a cold AI speech-to-text job that took a bit longer than that window
// silently fell back to a short caption instead of the real transcript, and a repeat call
// a few minutes later (hitting Supadata's now-warm/cached result) would return completely
// different text for the "same" submission. Splitting kick-off from status-check removes
// that race: each status check is a single fast round trip, so the job can run as long as
// it actually needs — the client polls at its own pace instead of one request racing it.

const { YoutubeTranscript } = require('youtube-transcript');

// A spoken-word YouTube transcript runs roughly 130-170 wpm for energetic explainer
// content, at ~5.5-6 chars/word incl. spaces -> ~715-1020 chars/minute. The old 6000-char
// cap covered only ~5.9-8.4 minutes of speech, silently cutting off anything longer
// mid-sentence (confirmed root cause of a report where an 8m40s "3 step formula" video's
// imported transcript stopped mid-step-2, before step 3). 12000 chars covers ~11.8-16.8
// minutes — comfortably past typical explainer/tutorial length — while leaving headroom
// under the site's 20000-char hard submission ceiling (api/analyze.js, api/generate-report.js)
// for combining a second fetched source or manual edits on top.
const MAX_TEXT = 12000;

const PLATFORM_LABEL = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', web: 'the page' };

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x';
  return 'web';
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ── SSRF guard ────────────────────────────────────────────────────
// We fetch user-supplied URLs server-side, so block anything that points at
// localhost, private/reserved ranges, or cloud metadata endpoints.
function isSafePublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === 'metadata.google.internal') return false;
  // Literal IPv4 in private / loopback / link-local / reserved ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // link-local incl. 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // multicast/reserved
  }
  // IPv6 loopback / unique-local / link-local
  if (host === '::1' || host === '[::1]' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false;
  return true;
}

// Generic placeholder captions that platforms serve for deleted/blocked/login-walled
// content. Importing these into the strategy box is worse than nothing.
const JUNK_PATTERNS = [
  /visit tiktok to discover/i,
  /watch, follow, and discover/i,
  /log ?in( •|\.\.\.| to)? instagram/i,
  /login • instagram/i,
  /see posts, photos and more/i,
  /you must log in to continue/i,
  /this account is private/i,
  /page not found/i,
  /^instagram$/i,
  /^tiktok$/i,
  /^x$/i,
];

// Strip the "Title:/Caption:/Description:" labels, then judge if the remaining
// text is real content. Returns cleaned text, or '' if it's junk/too short.
function meaningful(text) {
  if (!text) return '';
  const stripped = text.replace(/^(Title|Caption|Description|Transcript):/gim, '').trim();
  if (stripped.length < 20) return '';
  if (JUNK_PATTERNS.some((re) => re.test(stripped))) return '';
  return text;
}

// Meta's crawler UA unlocks rich OG on IG/FB; a real browser UA works for sites
// that block bots (Wikipedia, many CMSs). Try both and keep the first that yields OG.
const USER_AGENTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
];

function parseOG(html) {
  const get = (prop) => {
    const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
    const m1 = html.match(re1);
    if (m1) return decodeEntities(m1[1]);
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i');
    const m2 = html.match(re2);
    return m2 ? decodeEntities(m2[1]) : '';
  };
  return {
    title: get('og:title') || get('twitter:title'),
    desc: get('og:description') || get('twitter:description') || get('description'),
  };
}

async function fetchOG(url) {
  let best = { title: '', desc: '' };
  for (const ua of USER_AGENTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000); // bound each hop so total stays < function limit
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: ctrl.signal,
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const og = parseOG(html);
      if (og.title || og.desc) return og; // got something usable — stop
      if (!best.title && !best.desc) best = og;
    } catch (e) { /* timeout or error — try next UA */ }
    finally { clearTimeout(timer); }
  }
  return best;
}

function normalizeSupadataContent(content) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map((c) => (c && c.text ? c.text : '')).join(' ');
  text = (text || '').replace(/\s+/g, ' ').trim();
  return text.length > 20 ? text : null;
}

// Kick off a Supadata transcript request (ONE call, no internal retry loop). Returns:
//   { type: 'sync', text }   — Supadata already had/returned the content in this call
//   { type: 'async', jobId } — AI speech-to-text queued; poll checkSupadataStatus for it
//   { type: 'none' }         — no key, or Supadata gave nothing usable synchronously
async function kickOffSupadata(url, key) {
  if (!key) return { type: 'none' };
  const endpoint = 'https://api.supadata.ai/v1/transcript?text=true&mode=auto&url=' + encodeURIComponent(url);
  // Supadata sometimes answers a cold AI transcription SYNCHRONOUSLY (the GET itself
  // blocks 20-45s) and sometimes hands back a 202 job near-instantly. 40s leaves headroom
  // in the ~55-60s function budget for the OG-fallback chain afterward if this times out
  // or comes back empty — the truly slow case (an async job) doesn't wait here at all;
  // it's handed off to client-side polling instead (see the 'async' branch below).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const resp = await fetch(endpoint, { headers: { 'x-api-key': key }, signal: ctrl.signal });
    if (resp.status === 202) {
      const { jobId } = await resp.json();
      return jobId ? { type: 'async', jobId } : { type: 'none' };
    }
    if (!resp.ok) return { type: 'none' };
    const data = await resp.json();
    const text = normalizeSupadataContent(data.content);
    return text ? { type: 'sync', text } : { type: 'none' };
  } catch (e) {
    return { type: 'none' };
  } finally {
    clearTimeout(timer);
  }
}

// ONE status check against an existing Supadata job — no internal loop. The caller
// (api/extract-status.js) is what's polled repeatedly by the client, so no single call
// here ever races the job's real duration against a function timeout.
async function checkSupadataStatus(jobId, key) {
  const url = 'https://api.supadata.ai/v1/transcript/' + encodeURIComponent(jobId);
  try {
    const resp = await fetch(url, { headers: { 'x-api-key': key } });
    if (!resp.ok) return { status: 'processing' }; // transient — client will retry
    const d = await resp.json();
    if (d.status === 'completed') {
      const text = normalizeSupadataContent(d.content);
      return text ? { status: 'completed', text } : { status: 'failed' };
    }
    if (d.status === 'failed') return { status: 'failed' };
    return { status: 'processing' };
  } catch (e) {
    return { status: 'processing' }; // transient network hiccup — client will retry
  }
}

// Non-Supadata fallback chain: YouTube gets its transcript library + Open Graph;
// everyone else gets Open Graph (caption) only. Used both when Supadata has no key /
// gave nothing synchronously (api/extract.js), and when a job ultimately fails
// (api/extract-status.js). Returns { text, source, note } or null if nothing readable.
async function runFallback(platform, url, platformLabel) {
  if (platform === 'youtube') {
    const id = extractYouTubeId(url);
    if (!id) return null;
    let transcript = '';
    try {
      const parts = await YoutubeTranscript.fetchTranscript(id);
      transcript = parts.map((p) => decodeEntities(p.text)).join(' ').replace(/\s+/g, ' ').trim();
    } catch (e) {
      transcript = ''; // captions disabled / none — fall back to OG below
    }
    const og = await fetchOG(url);
    if (transcript) {
      return {
        text: ((og.title ? `Title: ${og.title}\n\n` : '') + `Transcript:\n${transcript}`).slice(0, MAX_TEXT),
        source: 'transcript',
        note: `Pulled the full spoken transcript from ${platformLabel}.`,
      };
    }
    const cap = [og.title && `Title: ${og.title}`, og.desc && `Description: ${og.desc}`].filter(Boolean).join('\n\n');
    if (!meaningful(cap)) return null;
    return {
      text: cap.slice(0, MAX_TEXT),
      source: 'caption',
      note: `Pulled the ${platformLabel} title & description. Add any spoken details from the video yourself.`,
    };
  }
  const og = await fetchOG(url);
  const raw = [og.title && `Caption: ${og.title}`, og.desc && og.desc].filter(Boolean).join('\n\n').trim();
  const text = meaningful(raw);
  if (!text) return null;
  return {
    text: text.slice(0, MAX_TEXT),
    source: 'caption',
    note: `Pulled the caption from ${platformLabel}. Video speech isn't captured — add any spoken details yourself.`,
  };
}

module.exports = {
  MAX_TEXT,
  PLATFORM_LABEL,
  detectPlatform,
  isSafePublicUrl,
  kickOffSupadata,
  checkSupadataStatus,
  runFallback,
};
