// Pull strategy text from a social/media link so the user doesn't have to type it.
//  - PRIMARY: Supadata universal transcript API (real speech-to-text) for
//    YouTube / Instagram / TikTok / X — handles reels where the strategy is SPOKEN,
//    and works around YouTube blocking Vercel datacenter IPs. Needs SUPADATA_API_KEY.
//  - This endpoint only KICKS OFF extraction. A cold AI speech-to-text job (often
//    20-45s, sometimes longer) used to be polled to completion right here, racing this
//    function's own duration limit — a job that ran a bit long silently fell back to a
//    short caption instead of the real transcript. Now: if Supadata hands back an async
//    job, this returns { status: 'processing', jobId } immediately, and the client polls
//    /api/extract-status (lib/extract-helpers.js has the shared logic) until it's done —
//    unbounded by any single request's timeout.
//  - FALLBACK (no key / quota / Supadata gave nothing at all): youtube-transcript lib +
//    Open Graph caption, same as before. Degrades gracefully; if nothing is readable,
//    tells the user to paste manually.

const { rateLimit } = require('../lib/ratelimit');
const {
  MAX_TEXT, PLATFORM_LABEL, detectPlatform, isSafePublicUrl, kickOffSupadata, runFallback,
} = require('../lib/extract-helpers');

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
  const platformLabel = PLATFORM_LABEL[platform];

  try {
    // PRIMARY: real transcript (spoken words) via Supadata — works for reels/videos
    // on all platforms, including cases our OG/caption path can't reach.
    const supa = await kickOffSupadata(clean, process.env.SUPADATA_API_KEY);
    if (supa.type === 'sync') {
      return res.json({
        text: supa.text.slice(0, MAX_TEXT),
        platform,
        source: 'transcript',
        note: `Pulled the spoken transcript from ${platformLabel}.`,
      });
    }
    if (supa.type === 'async') {
      // Hand off to client-side polling instead of waiting it out here.
      return res.json({ status: 'processing', jobId: supa.jobId, platform });
    }

    // FALLBACK below (no Supadata key, quota reached, private video, or unsupported)
    const fb = await runFallback(platform, clean, platformLabel);
    if (!fb) {
      return res.status(422).json({
        error: platform === 'youtube'
          ? 'This video has no available transcript or caption. Please paste the strategy text manually.'
          : `${platformLabel} didn't return readable strategy text (it may be private or require login). Please paste the caption or strategy manually.`,
      });
    }
    return res.json({ ...fb, platform });
  } catch (err) {
    console.error('extract error:', err.message);
    return res.status(500).json({ error: 'Could not read that link. Please paste the strategy text manually.' });
  }
};
