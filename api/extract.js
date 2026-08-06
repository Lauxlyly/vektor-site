// Pull strategy text from a social/media link so the user doesn't have to type it.
//  - PRIMARY: Supadata universal transcript API (real speech-to-text) for
//    YouTube / Instagram / TikTok / X — handles reels where the strategy is SPOKEN,
//    and works around YouTube blocking Vercel datacenter IPs. Needs SUPADATA_API_KEY.
//  - FALLBACK (no key / quota / failure): youtube-transcript lib + Open Graph caption.
// Degrades gracefully; if nothing is readable, tells the user to paste manually.

const { YoutubeTranscript } = require('youtube-transcript');
const { rateLimit } = require('../lib/ratelimit');

const MAX_TEXT = 6000;

// ── Supadata universal transcript API ─────────────────────────────
// GET https://api.supadata.ai/v1/transcript?url=...&text=true  (header x-api-key)
// mode=auto → native caption first, then AI speech-to-text. 100 free req/month.
async function fetchSupadataTranscript(url) {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) return null;
  const endpoint = 'https://api.supadata.ai/v1/transcript?text=true&mode=auto&url=' + encodeURIComponent(url);
  // Abort a slow transcription before the function's hard timeout so we can
  // still fall back to the caption instead of returning a raw 504.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const resp = await fetch(endpoint, { headers: { 'x-api-key': key }, signal: ctrl.signal });
    if (resp.status === 202) {
      const { jobId } = await resp.json();
      return jobId ? await pollSupadataJob(jobId, key) : null;
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    return normalizeSupadataContent(data.content);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pollSupadataJob(jobId, key, tries = 6) {
  const url = 'https://api.supadata.ai/v1/transcript/' + encodeURIComponent(jobId);
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const resp = await fetch(url, { headers: { 'x-api-key': key } });
      if (!resp.ok) continue;
      const d = await resp.json();
      if (d.status === 'completed') return normalizeSupadataContent(d.content);
      if (d.status === 'failed') return null;
    } catch (e) { /* keep polling */ }
  }
  return null;
}

function normalizeSupadataContent(content) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.map(c => c && c.text ? c.text : '').join(' ');
  text = (text || '').replace(/\s+/g, ' ').trim();
  return text.length > 20 ? text : null;
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
  if (JUNK_PATTERNS.some(re => re.test(stripped))) return '';
  return text;
}

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await rateLimit(req, res, { name: 'extract', max: 6, windowSec: 60 }))) return;

  const { url } = req.body || {};
  if (typeof url !== 'string' || url.length > 2000 || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'Please paste a valid link starting with http.' });
  }

  const clean = url.trim();
  if (!isSafePublicUrl(clean)) {
    return res.status(400).json({ error: 'That link points to a private or unsupported address.' });
  }
  const platform = detectPlatform(clean);
  const platformLabel = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', web: 'the page' }[platform];

  try {
    // PRIMARY: real transcript (spoken words) via Supadata — works for reels/videos
    // on all platforms, including cases our OG/caption path can't reach.
    const supa = await fetchSupadataTranscript(clean);
    if (supa) {
      return res.json({
        text: supa.slice(0, MAX_TEXT),
        platform,
        source: 'transcript',
        note: `Pulled the spoken transcript from ${platformLabel}.`,
      });
    }

    // FALLBACK below (no Supadata key, quota reached, private video, or unsupported)
    if (platform === 'youtube') {
      const id = extractYouTubeId(clean);
      if (!id) {
        return res.status(400).json({ error: 'Could not read the YouTube video ID from that link.' });
      }

      // Try full spoken transcript first
      let transcript = '';
      try {
        const parts = await YoutubeTranscript.fetchTranscript(id);
        transcript = parts.map(p => decodeEntities(p.text)).join(' ').replace(/\s+/g, ' ').trim();
      } catch (e) {
        transcript = ''; // captions disabled / none — fall back to OG below
      }

      const og = await fetchOG(clean);
      let text = '';
      let source = '';
      if (transcript) {
        text = (og.title ? `Title: ${og.title}\n\n` : '') + `Transcript:\n${transcript}`;
        source = 'transcript';
      } else {
        const cap = [og.title && `Title: ${og.title}`, og.desc && `Description: ${og.desc}`].filter(Boolean).join('\n\n');
        if (meaningful(cap)) { text = cap; source = 'caption'; }
      }

      if (!text) {
        return res.status(422).json({ error: 'This video has no available transcript or caption. Please paste the strategy text manually.' });
      }
      return res.json({
        text: text.slice(0, MAX_TEXT),
        platform,
        source,
        note: source === 'transcript'
          ? `Pulled the full spoken transcript from ${platformLabel}.`
          : `Pulled the ${platformLabel} title & description. Add any spoken details from the video yourself.`,
      });
    }

    // Instagram / TikTok / X / generic — Open Graph caption only
    const og = await fetchOG(clean);
    const raw = [og.title && `Caption: ${og.title}`, og.desc && og.desc]
      .filter(Boolean).join('\n\n').trim();
    const text = meaningful(raw);

    if (!text) {
      return res.status(422).json({
        error: `${platformLabel} didn't return readable strategy text (it may be private or require login). Please paste the caption or strategy manually.`,
      });
    }
    return res.json({
      text: text.slice(0, MAX_TEXT),
      platform,
      source: 'caption',
      note: `Pulled the caption from ${platformLabel}. Video speech isn't captured — add any spoken details yourself.`,
    });
  } catch (err) {
    console.error('extract error:', err.message);
    return res.status(500).json({ error: 'Could not read that link. Please paste the strategy text manually.' });
  }
};
