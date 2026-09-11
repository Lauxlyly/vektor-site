// Per-IP rate limiting via Upstash Redis (sliding window).
//
// FAIL-OPEN: if Redis isn't configured (see lib/redis-client.js — checks both
// UPSTASH_REDIS_REST_URL/_TOKEN and the Vercel-Marketplace KV_REST_API_URL/_TOKEN
// naming), or the limiter errors, requests are allowed. So the site works without
// Upstash, and a limiter outage never takes the site down — it just temporarily
// removes the protection.

const { configured, client: redisClient } = require('./redis-client');

const limiters = {};

function clientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.headers && req.headers['x-real-ip']) || 'unknown';
}

// Returns true if the request may proceed. If rate-limited, sends 429 and returns false.
async function rateLimit(req, res, { name, max, windowSec }) {
  if (!configured()) {
    return true; // not configured → allow
  }
  try {
    if (!limiters[name]) {
      const { Ratelimit } = require('@upstash/ratelimit');
      limiters[name] = new Ratelimit({
        redis: redisClient(),
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
