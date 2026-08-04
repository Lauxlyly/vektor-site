// Pull strategy text from a social/media link so the user doesn't have to type it.
//  - YouTube (incl. Shorts): full spoken transcript via youtube-transcript, + title/description
//  - Instagram / TikTok / X / generic: Open Graph caption (og:title + og:description)
// Degrades gracefully: if a transcript isn't available, falls back to OG caption;
// if nothing is readable, returns a clear message telling the user to paste manually.

const { YoutubeTranscript } = require('youtube-transcript');

const MAX_TEXT = 6000;

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
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const og = parseOG(html);
      if (og.title || og.desc) return og; // got something usable — stop
      if (!best.title && !best.desc) best = og;
    } catch (e) { /* try next UA */ }
  }
  return best;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({ error: 'Please paste a valid link starting with http.' });
  }

  const clean = url.trim();
  const platform = detectPlatform(clean);
  const platformLabel = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', web: 'the page' }[platform];

  try {
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
