// Empirical falsification endpoint — the automated form of the concierge
// proxy tier's "Step 3 — Run + record" (docs/concierge-proxy-kit.md).
//
// Human-gated by design (guardrail #6 in that doc: "No automated
// mechanizability detection in v1"): the owner still judges whether a
// submission's rules are stateable, hand-writes the ruleset JSON, and calls
// this endpoint to run it — this just replaces "run crypto-bot locally by
// hand" with one authenticated request against the same methodology
// (pre-registered rules, no-lookahead replay, dual-null, triple-cost).
//
// Auth: requires header `x-vektor-admin-key` matching VEKTOR_ADMIN_KEY. Not a
// public endpoint — never expose it to the report-generation flow untrusted.

const { rateLimit } = require('../lib/ratelimit');
const { fetchUniverse } = require('../lib/census/market-data');
const { runCensus } = require('../lib/census/run');
const { buildReportBlock } = require('../lib/census/report-block');

const MAX_CANDLES_PER_RUN = 20000; // guards against an accidentally huge window burning function time/memory

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vektor-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.VEKTOR_ADMIN_KEY) {
    return res.status(503).json({ error: 'Backtest endpoint not configured (VEKTOR_ADMIN_KEY unset).' });
  }
  const key = req.headers['x-vektor-admin-key'];
  if (key !== process.env.VEKTOR_ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!(await rateLimit(req, res, { name: 'backtest', max: 20, windowSec: 60 }))) return;

  const { ruleset, universe, interval, start, end, cost_label } = req.body || {};

  if (!ruleset || typeof ruleset !== 'object' || !Array.isArray(ruleset.entry) || ruleset.entry.length === 0) {
    return res.status(400).json({ error: 'ruleset.entry (non-empty array) is required.' });
  }
  if (typeof ruleset.stop_pct !== 'number' || typeof ruleset.take_profit_pct !== 'number') {
    return res.status(400).json({ error: 'ruleset.stop_pct and ruleset.take_profit_pct (numbers, e.g. 0.02) are required.' });
  }
  if (!Array.isArray(universe) || universe.length === 0 || universe.length > 10) {
    return res.status(400).json({ error: 'universe must be a non-empty array of up to 10 symbols.' });
  }
  if (!interval || typeof interval !== 'string') {
    return res.status(400).json({ error: 'interval is required, e.g. "1h" or "1d".' });
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return res.status(400).json({ error: 'start/end must be valid dates with end after start.' });
  }
  if (['1x', '2x', '3x'].indexOf(cost_label) === -1 && cost_label !== undefined) {
    return res.status(400).json({ error: 'cost_label must be one of "1x", "2x", "3x".' });
  }

  let candlesBySymbol;
  try {
    candlesBySymbol = await fetchUniverse(universe, interval, startMs, endMs);
  } catch (err) {
    console.error('backtest: market data fetch failed:', err.message);
    return res.status(502).json({ error: `Market data fetch failed: ${err.message}` });
  }

  const totalCandles = Object.values(candlesBySymbol).reduce((a, c) => a + c.length, 0);
  if (totalCandles === 0) {
    return res.status(422).json({ error: 'No candles returned for the requested universe/window — check symbols and dates.' });
  }
  if (totalCandles > MAX_CANDLES_PER_RUN) {
    return res.status(413).json({ error: `Window too large (${totalCandles} candles > ${MAX_CANDLES_PER_RUN} cap). Narrow the universe or date range.` });
  }

  let result;
  try {
    result = runCensus(ruleset, candlesBySymbol);
  } catch (err) {
    console.error('backtest: census run failed:', err.message);
    return res.status(400).json({ error: `Ruleset error: ${err.message}` });
  }

  const window = { universe, interval, startMs, endMs };
  const block = buildReportBlock(ruleset, window, result, cost_label || '3x');

  res.json({
    block,
    metrics: {
      real: result.real.metrics,
      random_entry_null: result.randomEntryNull.metrics,
      wrong_sign_null: result.wrongSignNull.metrics,
    },
    per_symbol: result.perSymbol,
    n_trades: result.real.trades.length,
  });
};
