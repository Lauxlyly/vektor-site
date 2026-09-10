// Orchestrates one census run: replay the ruleset + both nulls across a
// universe of symbols, then score everything at 1x/2x/3x cost. This is the
// automated form of concierge-proxy-kit.md's "Step 3 — Run + record".

const { runRuleset, runRandomNull, runWrongSignNull } = require('./engine');
const { computeMetrics } = require('./metrics');

const DEFAULT_COST_PCT_ROUND_TRIP = 0.002; // 0.2% = 0.1%/side, matches crypto-bot's commission assumption

/**
 * @param {Ruleset} ruleset
 * @param {Record<string, Array>} candlesBySymbol  symbol -> ascending candle array
 * @param {number} [costPctRoundTrip]  base (1x) round-trip cost; default 0.2%
 */
function runCensus(ruleset, candlesBySymbol, costPctRoundTrip = DEFAULT_COST_PCT_ROUND_TRIP) {
  const realTrades = [];
  const randomTrades = [];
  const wrongSignTrades = [];
  const perSymbol = {};

  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    const { trades, eligibleEntryBars } = runRuleset(candles, ruleset);
    const random = runRandomNull(candles, ruleset, trades.length, eligibleEntryBars, ruleset.seed);
    const wrongSign = runWrongSignNull(trades);

    perSymbol[symbol] = { nCandles: candles.length, nTrades: trades.length };
    realTrades.push(...trades);
    randomTrades.push(...random);
    wrongSignTrades.push(...wrongSign);
  }

  // Sort pooled trades chronologically — required for the Sharpe annualisation
  // window and for an honest, reproducible ledger record.
  const byEntry = (a, b) => a.entryTime - b.entryTime;
  realTrades.sort(byEntry);
  randomTrades.sort(byEntry);
  wrongSignTrades.sort(byEntry);

  const costMultiples = [1, 2, 3];
  const atCost = (trades) => Object.fromEntries(
    costMultiples.map((m) => [`${m}x`, computeMetrics(trades, costPctRoundTrip * m)])
  );

  return {
    perSymbol,
    costPctRoundTrip1x: costPctRoundTrip,
    real: { trades: realTrades, metrics: atCost(realTrades) },
    randomEntryNull: { trades: randomTrades, metrics: atCost(randomTrades) },
    wrongSignNull: { trades: wrongSignTrades, metrics: atCost(wrongSignTrades) },
  };
}

module.exports = { runCensus, DEFAULT_COST_PCT_ROUND_TRIP };
