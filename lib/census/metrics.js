// Metrics for a list of trades produced by engine.js. Mirrors the shape of
// crypto-bot's backtesting/metrics.py, expressed in per-trade % terms (not
// dollar balances) so a symbol/universe mix doesn't need a shared account.

/**
 * @param {Array<{grossPnlPct:number, entryTime:number, exitTime:number}>} trades
 * @param {number} costPctRoundTrip  e.g. 0.002 = 0.2% round-trip cost at 1x
 */
function computeMetrics(trades, costPctRoundTrip) {
  const n = trades.length;
  if (n === 0) {
    return {
      n: 0, hitRate: null, netExpectancyPct: null, grossExpectancyPct: null,
      avgWinPct: null, avgLossPct: null, profitFactor: null,
      maxDrawdownPct: null, sharpe: null,
    };
  }

  const net = trades.map((t) => t.grossPnlPct - costPctRoundTrip * 100);
  const wins = net.filter((p) => p > 0);
  const losses = net.filter((p) => p <= 0);

  const hitRate = wins.length / n;
  const grossExpectancyPct = trades.reduce((a, t) => a + t.grossPnlPct, 0) / n;
  const netExpectancyPct = net.reduce((a, p) => a + p, 0) / n;
  const avgWinPct = wins.length ? wins.reduce((a, p) => a + p, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((a, p) => a + p, 0) / losses.length : 0;
  const grossProfit = wins.reduce((a, p) => a + p, 0);
  const grossLoss = Math.abs(losses.reduce((a, p) => a + p, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  // Additive cumulative-% curve drawdown (simple, order-preserving approximation —
  // not compounded balance; adequate for a proxy falsification, not a live P&L model).
  let cum = 0, peak = 0, maxDd = 0;
  for (const p of net) {
    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDd) maxDd = dd;
  }

  // Sharpe on per-trade net returns, annualised by observed trade frequency.
  let sharpe = 0;
  if (n > 1) {
    const mean = netExpectancyPct;
    const variance = net.reduce((a, p) => a + (p - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const spanMs = trades[n - 1].exitTime - trades[0].entryTime;
    const spanYears = Math.max(spanMs / (365.25 * 24 * 3600 * 1000), 1 / 365.25);
    const tradesPerYear = n / spanYears;
    sharpe = std > 0 ? (mean / std) * Math.sqrt(tradesPerYear) : 0;
  }

  return {
    n,
    hitRate,
    netExpectancyPct,
    grossExpectancyPct,
    avgWinPct,
    avgLossPct,
    profitFactor,
    maxDrawdownPct: maxDd,
    sharpe,
  };
}

module.exports = { computeMetrics };
