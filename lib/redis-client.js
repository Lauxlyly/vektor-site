// Resolves an Upstash Redis REST connection from whichever env var naming
// convention is actually present, and shares ONE client instance across
// lib/ratelimit.js and lib/orders.js.
//
// Why this exists: connecting Upstash to a Vercel project via the Vercel
// Marketplace integration (Storage tab -> Browse Marketplace -> Upstash) commonly
// injects KV_REST_API_URL / KV_REST_API_TOKEN — the old "Vercel KV" naming,
// which was always Upstash Redis under the hood — rather than the plain
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN that @upstash/redis's
// Redis.fromEnv() looks for by default. Without this, "Upstash is connected"
// in the Vercel dashboard can still mean configured() reports false here and
// nothing gets rate-limited or persisted, with no error — just silent no-ops.
// Checking both names means either integration path (manual env vars, or the
// Marketplace connector) works without the user renaming anything.

function credentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

function configured() {
  return !!credentials();
}

let _client = null;
function client() {
  const creds = credentials();
  if (!creds) return null;
  if (!_client) {
    const { Redis } = require('@upstash/redis');
    _client = new Redis(creds);
  }
  return _client;
}

module.exports = { configured, client, credentials };
