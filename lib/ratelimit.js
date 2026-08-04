// Per-IP rate limiting via Upstash Redis (sliding window).
//
// FAIL-OPEN: if UPSTASH_REDIS_REST_URL / _TOKEN are not configured, or the limiter
// errors, requests are allowed. So the site works without Upstash, and a limiter
// outage never takes the site down — it just temporarily removes the protection.
//
// To activate: create a free Upstash Redis DB (upstash.com), then add
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to the Vercel env.

const limiters = {};

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.headers && req.headers['x-real-ip']) || 'unknown';
}

// Returns true if the request may proceed. If rate-limited, sends 429 and returns false.
async function rateLimit(req, res, { name, max, windowSec }) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return true; // not configured → allow
  }
  try {
    if (!limiters[name]) {
      const { Ratelimit } = require('@upstash/ratelimit');
      const { Redis } = require('@upstash/redis');
      limiters[name] = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
        prefix: `vektor:${name}`,
        analytics: false,
      });
    }
    const { success } = await limiters[name].limit(clientIp(req));
    if (!success) {
      res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
      return false;
    }
    return true;
  } catch (e) {
    console.error('ratelimit error (fail-open):', e.message);
    return true; // never block on limiter failure
  }
}

module.exports = { rateLimit };
