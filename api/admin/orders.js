// Read-only admin order list. Protected by a single shared secret (ADMIN_TOKEN),
// sent as a header — never as a URL query param, which would land the secret in
// browser history and any proxy/CDN access log. Timing-safe compare against a
// timing side-channel; rate-limited so a leaked/guessed token can't be hammered.
//
// This endpoint returns customer email + full submitted strategy text for every
// order — treat ADMIN_TOKEN with the same care as STRIPE_SECRET_KEY. admin.html
// must never be linked from the public site and stays noindex.

const crypto = require('crypto');
const { rateLimit } = require('../../lib/ratelimit');
const { listRecentOrders } = require('../../lib/orders');

function timingSafeTokenMatch(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  if (a.length !== b.length) return false; // lengths differ -> definitely not a match, and this branch is length-only (no secret byte compared)
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!(await rateLimit(req, res, { name: 'admin', max: 20, windowSec: 60 }))) return;

  if (!process.env.ADMIN_TOKEN) {
    // Fail CLOSED, unlike rate limiting — this is an access-control gate, not a
    // best-effort defense, so "not configured" must never mean "wide open".
    return res.status(503).json({ error: 'Admin access not configured.' });
  }
  const token = req.headers['x-admin-token'];
  if (!timingSafeTokenMatch(token, process.env.ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const orders = await listRecentOrders(50);
  res.json({ orders });
};
