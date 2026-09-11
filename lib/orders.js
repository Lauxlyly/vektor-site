// Order persistence via Upstash Redis — tracks every paid order so a failed
// generation can be found and recovered instead of vanishing without a trace.
// (See GO-LIVE.md — this is the same Upstash DB used for rate limiting.)
//
// FAILS SOFT: if Upstash isn't configured, or a read/write errors, every function
// here resolves to a no-op / empty result rather than throwing. A Redis outage must
// never break the customer-facing report flow. Callers that need to react to a
// failure (e.g. still email the owner) check the boolean saveOrder() returns.
//
// One JSON document per order at vektor:order:<session_id> (the Stripe session id
// is already a natural, globally-unique key). A sorted set vektor:orders:index
// (score = purchase unix ms, member = session_id) lets the admin list "most recent
// N" without a slow key SCAN.
//
// TTL: matches the "strategy text and generated report" retention promised in
// legal/PRIVACY.md §5. If that policy changes, update ORDER_TTL_SECONDS to match —
// they must stay in sync.

const { configured, client: redis } = require('./redis-client');

const INDEX_KEY = 'vektor:orders:index';
const ORDER_TTL_SECONDS = 60 * 60 * 24 * 400; // ~13 months of slack over a "12 months" retention promise

function orderKey(sessionId) {
  return `vektor:order:${sessionId}`;
}

// Get-merge-set: NEVER blindly overwrite. The webhook and generate-report.js can
// both write the same session_id at different times (and in either order), so a
// late write must merge into whatever's already there instead of clobbering it.
async function saveOrder(sessionId, patch) {
  const r = redis();
  if (!r || !sessionId) return false;
  try {
    const key = orderKey(sessionId);
    const existing = (await r.get(key)) || {};
    const now = new Date().toISOString();
    const merged = { ...existing, ...patch, session_id: sessionId, updated_at: now };
    if (!merged.created_at) merged.created_at = now;
    await r.set(key, merged, { ex: ORDER_TTL_SECONDS });
    await r.zadd(INDEX_KEY, { score: Date.parse(merged.created_at) || Date.now(), member: sessionId });
    return true;
  } catch (e) {
    console.error('orders.saveOrder error (non-fatal):', e.message);
    return false;
  }
}

async function getOrder(sessionId) {
  const r = redis();
  if (!r || !sessionId) return null;
  try {
    return (await r.get(orderKey(sessionId))) || null;
  } catch (e) {
    console.error('orders.getOrder error:', e.message);
    return null;
  }
}

// Most recent first. Returns [] (never throws) if Upstash isn't configured or errors.
async function listRecentOrders(limit = 50) {
  const r = redis();
  if (!r) return [];
  try {
    const ids = await r.zrange(INDEX_KEY, 0, limit - 1, { rev: true });
    if (!ids || !ids.length) return [];
    const pipeline = r.pipeline();
    ids.forEach((id) => pipeline.get(orderKey(id)));
    const results = await pipeline.exec();
    return results.filter(Boolean);
  } catch (e) {
    console.error('orders.listRecentOrders error:', e.message);
    return [];
  }
}

module.exports = { saveOrder, getOrder, listRecentOrders, configured };
