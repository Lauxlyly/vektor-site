// Poll a Supadata transcription job started by /api/extract — ONE status check per call.
// The client (index.html's fetchFromUrl) calls this every ~3s until it returns
// 'completed' or 'failed'. This is what lets a cold AI speech-to-text job run as long as
// it actually needs, instead of racing a single serverless function's duration limit —
// see lib/extract-helpers.js for why that used to silently degrade to a short caption.

const { rateLimit } = require('../lib/ratelimit');
const {
  MAX_TEXT, PLATFORM_LABEL, detectPlatform, isSafePublicUrl, checkSupadataStatus, runFallback,
} = require('../lib/extract-helpers');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  // A single in-progress extraction polls this every ~3s for up to ~110s (~35 calls),
  // so this needs a much higher per-minute budget than the one-shot endpoints.
  if (!(await rateLimit(req, res, { name: 'extract-status', max: 60, windowSec: 60 }))) return;

  const { jobId, url } = req.body || {};
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200) {
    return res.status(400).json({ error: 'Missing job id.' });
  }
  if (typeof url !== 'string' || !isSafePublicUrl(url)) {
    return res.status(400).json({ error: 'Missing or invalid source url.' });
  }
  if (!process.env.SUPADATA_API_KEY) {
    return res.status(503).json({ error: 'Transcription service not configured.' });
  }

  const platform = detectPlatform(url);
  const platformLabel = PLATFORM_LABEL[platform];

  try {
    const result = await checkSupadataStatus(jobId, process.env.SUPADATA_API_KEY);

    if (result.status === 'completed') {
      return res.json({
        status: 'completed',
        text: result.text.slice(0, MAX_TEXT),
        platform,
        source: 'transcript',
        note: `Pulled the spoken transcript from ${platformLabel}.`,
      });
    }

    if (result.status === 'failed') {
      // The job itself failed at Supadata (not a timeout) — same fallback chain
      // api/extract.js uses when it has nothing to kick off in the first place.
      const fb = await runFallback(platform, url, platformLabel);
      if (!fb) {
        return res.status(422).json({
          error: platform === 'youtube'
            ? 'This video has no available transcript or caption. Please paste the strategy text manually.'
            : `${platformLabel} didn't return readable strategy text (it may be private or require login). Please paste the caption or strategy manually.`,
        });
      }
      return res.json({ status: 'completed', ...fb, platform });
    }

    return res.json({ status: 'processing' });
  } catch (err) {
    console.error('extract-status error:', err.message);
    // Treat as transient rather than fatal — the client's own overall timeout is what
    // eventually stops polling, so a single flaky check shouldn't end the attempt.
    return res.json({ status: 'processing' });
  }
};
