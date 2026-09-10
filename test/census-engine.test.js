// Deterministic, offline tests for the falsification engine (lib/census/*).
// Uses synthetic OHLCV fixtures only — no network access, so this runs
// identically in any sandbox, CI, or production.
// Run: node test/census-engine.test.js

const { sma, ema, rsi } = require('../lib/census/indicators');
const { runRuleset, runRandomNull, runWrongSignNull } = require('../lib/census/engine');
const { computeMetrics } = require('../lib/census/metrics');
const { runCensus } = require('../lib/census/run');
const { buildReportBlock } = require('../lib/census/report-block');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} — ${detail !== undefined ? detail : 'failed'}`); }
}

// ── Fixture: a repeating sawtooth so RSI/SMA crosses are hand-verifiable ──
const DAY = 86400000;
function makeCandles(n, priceFn, startTime = Date.UTC(2022, 0, 1)) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = priceFn(i);
    // Deliberate small gap between a bar's open and the PRIOR bar's close —
    // without this, next-bar-open and signal-bar-close are numerically
    // identical and a lookahead bug would be invisible to the test below.
    const open = i === 0 ? close : priceFn(i - 1) + 0.5;
    out.push({
      time: startTime + i * DAY,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
    });
  }
  return out;
}

(async () => {
  // ---- indicators: causality (no lookahead) ----
  {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const s = sma(closes, 10);
    const truncated = sma(closes.slice(0, 40), 10);
    let identicalPrefix = true;
    for (let i = 0; i < 40; i++) {
      if (s[i] !== truncated[i]) identicalPrefix = false;
    }
    check('sma: value at i is unaffected by future data (no lookahead)', identicalPrefix);

    const r = rsi(closes, 14);
    const rTrunc = rsi(closes.slice(0, 40), 14);
    let rIdentical = true;
    for (let i = 0; i < 40; i++) {
      if (r[i] !== rTrunc[i]) rIdentical = false;
    }
    check('rsi: value at i is unaffected by future data (no lookahead)', rIdentical);

    const e = ema(closes, 10);
    check('ema: warms up then produces numbers', e[9] !== null && typeof e[9] === 'number' && e[8] === null);
  }

  // ---- rsi: known extreme cases ----
  {
    const monotoneUp = Array.from({ length: 30 }, (_, i) => 100 + i); // strictly rising
    const r = rsi(monotoneUp, 14);
    check('rsi: strictly rising series -> RSI = 100 (no losses)', r[29] === 100, r[29]);

    const monotoneDown = Array.from({ length: 30 }, (_, i) => 100 - i);
    const rDown = rsi(monotoneDown, 14);
    check('rsi: strictly falling series -> RSI = 0 (no gains)', rDown[29] === 0, rDown[29]);
  }

  // ---- engine: fill happens at NEXT bar's open, never same-bar close ----
  {
    // Price ramps up steadily so RSI(14) < 30 never fires on the way up —
    // instead build a deliberate dip-then-recover so the entry condition
    // (rsi_below 30) fires at a known bar, and confirm the fill price is the
    // following bar's open, not the signal bar's close.
    const prices = [];
    for (let i = 0; i < 60; i++) prices.push(100); // flat warmup
    for (let i = 0; i < 20; i++) prices.push(100 - i * 2); // sharp drop -> RSI crashes
    for (let i = 0; i < 20; i++) prices.push(60 + i); // recovery
    const candles = makeCandles(prices.length, (i) => prices[i]);

    const ruleset = {
      entry: [{ type: 'rsi_below', period: 14, value: 30 }],
      exit: [],
      stop_pct: 0.5,        // wide — we want the trade to close on take-profit or hold, not stop
      take_profit_pct: 0.5, // wide — isolate the fill-price check from exit timing
      max_hold_bars: 5,
    };
    const { trades } = runRuleset(candles, ruleset);
    check('engine: at least one entry fires on the RSI dip', trades.length > 0, trades.length);
    if (trades.length > 0) {
      const t = trades[0];
      const signalBarIndex = t.entryIndex - 1; // engine fills at entryIndex = signalBar + 1
      const signalBarClose = candles[signalBarIndex].close;
      const fillBarOpen = candles[t.entryIndex].open;
      check('engine: fill price equals the NEXT bar\'s open, not the signal bar\'s close',
        t.entryPrice === fillBarOpen && t.entryPrice !== signalBarClose,
        `entryPrice=${t.entryPrice} fillBarOpen=${fillBarOpen} signalBarClose=${signalBarClose}`);
    }
  }

  // ---- engine: stop-loss takes priority over take-profit in the same bar ----
  {
    const candles = makeCandles(70, () => 100);
    // After warmup, force one huge-range bar that touches both SL and TP.
    candles[65] = { time: candles[65].time, open: 100, high: 110, low: 90, close: 100 };
    const ruleset = {
      entry: [{ type: 'always' }],
      exit: [],
      stop_pct: 0.05,
      take_profit_pct: 0.05,
    };
    const { trades } = runRuleset(candles, ruleset);
    check('engine: entries fire on an always-true condition', trades.length > 0, trades.length);
    const wideBarTrade = trades.find((t) => t.entryIndex <= 65 && t.exitIndex >= 65);
    if (wideBarTrade) {
      check('engine: SL wins over TP when both are touched in one bar (conservative)',
        wideBarTrade.exitReason === 'STOP', wideBarTrade.exitReason);
    }
  }

  // ---- engine: one position at a time, no overlapping trades ----
  {
    const candles = makeCandles(120, (i) => 100 + Math.sin(i / 3) * 5);
    const ruleset = {
      entry: [{ type: 'always' }],
      exit: [],
      stop_pct: 0.5, take_profit_pct: 0.5, max_hold_bars: 3,
    };
    const { trades } = runRuleset(candles, ruleset);
    let overlap = false;
    for (let i = 1; i < trades.length; i++) {
      if (trades[i].entryIndex <= trades[i - 1].exitIndex) overlap = true;
    }
    check('engine: no two trades overlap (one open position at a time)', !overlap && trades.length > 1, `n=${trades.length}`);
  }

  // ---- wrong-sign null: exact mirror of the real trades' pnl ----
  {
    const real = [
      { grossPnlPct: 2.5, entryTime: 0, exitTime: 1 },
      { grossPnlPct: -1.2, entryTime: 1, exitTime: 2 },
    ];
    const ws = runWrongSignNull(real);
    check('wrongSignNull: flips pnl sign, preserves count', ws.length === 2 && ws[0].grossPnlPct === -2.5 && ws[1].grossPnlPct === 1.2);
  }

  // ---- random null: reproducible given the same seed ----
  {
    const candles = makeCandles(200, (i) => 100 + Math.sin(i / 4) * 8 + (i % 17));
    const ruleset = { entry: [{ type: 'rsi_below', period: 14, value: 40 }], exit: [], stop_pct: 0.03, take_profit_pct: 0.03, max_hold_bars: 8, seed: 7 };
    const { trades, eligibleEntryBars } = runRuleset(candles, ruleset);
    const r1 = runRandomNull(candles, ruleset, trades.length, eligibleEntryBars, 7);
    const r2 = runRandomNull(candles, ruleset, trades.length, eligibleEntryBars, 7);
    check('randomNull: same seed -> identical trade sequence (reproducible for the ledger)',
      JSON.stringify(r1) === JSON.stringify(r2));
    const r3 = runRandomNull(candles, ruleset, trades.length, eligibleEntryBars, 99);
    check('randomNull: different seed -> can produce a different sequence',
      r1.length === 0 || JSON.stringify(r1) !== JSON.stringify(r3) || r1.length <= 1);
  }

  // ---- metrics: hand-computed sanity check ----
  {
    const trades = [
      { grossPnlPct: 4, entryTime: 0, exitTime: DAY },
      { grossPnlPct: -2, entryTime: DAY, exitTime: 2 * DAY },
      { grossPnlPct: 6, entryTime: 2 * DAY, exitTime: 3 * DAY },
      { grossPnlPct: -3, entryTime: 3 * DAY, exitTime: 4 * DAY },
    ];
    const m = computeMetrics(trades, 0); // zero cost -> net == gross, hand-checkable
    check('metrics: n', m.n === 4, m.n);
    check('metrics: hit rate = 2/4', m.hitRate === 0.5, m.hitRate);
    check('metrics: gross expectancy = mean(4,-2,6,-3) = 1.25', Math.abs(m.grossExpectancyPct - 1.25) < 1e-9, m.grossExpectancyPct);
    check('metrics: profit factor = (4+6)/(2+3) = 2', Math.abs(m.profitFactor - 2) < 1e-9, m.profitFactor);

    const mCosted = computeMetrics(trades, 0.01); // 1% round-trip cost -> net = gross - 1
    check('metrics: cost is subtracted per trade (net expectancy = gross - cost)',
      Math.abs(mCosted.netExpectancyPct - (1.25 - 1)) < 1e-9, mCosted.netExpectancyPct);

    const mEmpty = computeMetrics([], 0.002);
    check('metrics: empty trade list returns nulls, not NaN/throw', mEmpty.n === 0 && mEmpty.netExpectancyPct === null);
  }

  // ---- run.js + report-block.js: end-to-end on a losing-after-cost strategy ----
  {
    // A strategy with a real, small, cost-fragile edge: buy every time RSI dips,
    // wide enough stops that most trades hit take-profit, but the edge is thin
    // enough that 3x realistic costs should plausibly erase it.
    const candles = makeCandles(400, (i) => 100 + Math.sin(i / 6) * 6 + Math.sin(i / 37) * 3);
    const ruleset = {
      entry: [{ type: 'rsi_below', period: 14, value: 35 }],
      exit: [],
      stop_pct: 0.02,
      take_profit_pct: 0.02,
      max_hold_bars: 10,
      seed: 42,
    };
    const candlesBySymbol = { SYN1USDT: candles };
    const result = runCensus(ruleset, candlesBySymbol, 0.002);

    check('run: real strategy produced trades', result.real.trades.length > 0, result.real.trades.length);
    check('run: random null has the same trade count as the real strategy (fair comparison)',
      result.randomEntryNull.trades.length === result.real.trades.length,
      `${result.randomEntryNull.trades.length} vs ${result.real.trades.length}`);
    check('run: wrong-sign null has exactly the real strategy\'s trade count',
      result.wrongSignNull.trades.length === result.real.trades.length);
    check('run: cost stress is monotonically worse at higher multiples',
      result.real.metrics['1x'].netExpectancyPct >= result.real.metrics['2x'].netExpectancyPct &&
      result.real.metrics['2x'].netExpectancyPct >= result.real.metrics['3x'].netExpectancyPct,
      JSON.stringify({ '1x': result.real.metrics['1x'].netExpectancyPct, '2x': result.real.metrics['2x'].netExpectancyPct, '3x': result.real.metrics['3x'].netExpectancyPct }));

    const block = buildReportBlock(ruleset, { universe: ['SYN1USDT'], interval: '1d', startMs: candles[0].time, endMs: candles[candles.length - 1].time }, result, '3x');
    check('report-block: contains the required section header', block.includes('Empirical falsification'));
    check('report-block: states the actual n (never invents a round number)',
      block.includes(`over **${result.real.metrics['3x'].n}**`), result.real.metrics['3x'].n);
    check('report-block: names both nulls by required label', block.includes('random-entry null') && block.includes('wrong-sign null'));
  }

  // ---- engine: unknown condition type fails loudly, never silently ignored ----
  {
    const candles = makeCandles(70, () => 100);
    let threw = false;
    try {
      runRuleset(candles, { entry: [{ type: 'not_a_real_condition' }], stop_pct: 0.02, take_profit_pct: 0.02 });
    } catch (e) {
      threw = true;
    }
    check('engine: unknown condition type throws rather than silently no-op', threw);
  }

  console.log(`\n──────── ${pass} passed · ${fail} failed ────────`);
  process.exit(fail > 0 ? 1 : 0);
})();
