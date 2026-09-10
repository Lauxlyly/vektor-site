// Rule-based falsification engine — a productionized port of crypto-bot's
// backtesting/engine.py methodology (pre-registered rules, no-lookahead replay,
// dual-null comparison) into the VEKTOR report pipeline.
//
// A "ruleset" is the mechanized proxy of a user's STATED rules (see
// docs/concierge-proxy-kit.md). It is never fit to the data here — it is
// replayed as given, long-only, one open position at a time per symbol.
//
// No-lookahead discipline: a signal observed at bar i's close is filled at
// bar i+1's OPEN (never the same bar's close/high/low), and every indicator
// value at bar i is a causal function of bars [0..i] only (see indicators.js).

const { sma, ema, rsi } = require('./indicators');

/**
 * @typedef {Object} Candle
 * @property {number} time  epoch ms, ascending
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 */

/**
 * @typedef {Object} Ruleset
 * @property {Array<Condition>} entry   ANDed — all must hold to signal entry
 * @property {Array<Condition>} [exit]  ORed — any true closes the position early
 * @property {number} stop_pct          e.g. 0.02 = 2% stop-loss
 * @property {number} take_profit_pct   e.g. 0.04 = 4% take-profit
 * @property {number} [max_hold_bars]   time-box exit (optional)
 * @property {number} [seed]            PRNG seed for the random-entry null (default 42)
 */

function _buildIndicatorCache(closes) {
  const cache = { sma: {}, ema: {}, rsi: {} };
  return {
    sma(period) {
      if (!cache.sma[period]) cache.sma[period] = sma(closes, period);
      return cache.sma[period];
    },
    ema(period) {
      if (!cache.ema[period]) cache.ema[period] = ema(closes, period);
      return cache.ema[period];
    },
    rsi(period) {
      if (!cache.rsi[period]) cache.rsi[period] = rsi(closes, period);
      return cache.rsi[period];
    },
  };
}

// Evaluate one condition at bar index i. Returns null (not yet decidable —
// warmup) or boolean.
function _evalCondition(cond, i, candles, ind) {
  switch (cond.type) {
    case 'always':
      return true;
    case 'price_above_sma': {
      const s = ind.sma(cond.period)[i];
      return s == null ? null : candles[i].close > s;
    }
    case 'price_below_sma': {
      const s = ind.sma(cond.period)[i];
      return s == null ? null : candles[i].close < s;
    }
    case 'sma_cross_above': {
      const f = ind.sma(cond.fast), s = ind.sma(cond.slow);
      if (i === 0 || f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return null;
      return f[i - 1] <= s[i - 1] && f[i] > s[i];
    }
    case 'sma_cross_below': {
      const f = ind.sma(cond.fast), s = ind.sma(cond.slow);
      if (i === 0 || f[i] == null || s[i] == null || f[i - 1] == null || s[i - 1] == null) return null;
      return f[i - 1] >= s[i - 1] && f[i] < s[i];
    }
    case 'rsi_below': {
      const r = ind.rsi(cond.period)[i];
      return r == null ? null : r < cond.value;
    }
    case 'rsi_above': {
      const r = ind.rsi(cond.period)[i];
      return r == null ? null : r > cond.value;
    }
    case 'weekday_in': {
      const d = new Date(candles[i].time).getUTCDay(); // 0=Sun..6=Sat
      return cond.days.includes(d);
    }
    case 'hour_in': {
      const h = new Date(candles[i].time).getUTCHours();
      return cond.hours.includes(h);
    }
    default:
      throw new Error(`Unknown condition type: ${cond.type}`);
  }
}

function _allTrue(conds, i, candles, ind) {
  if (!conds || conds.length === 0) return false;
  let any_null = false;
  for (const c of conds) {
    const v = _evalCondition(c, i, candles, ind);
    if (v === null) any_null = true;
    else if (v === false) return false;
  }
  return any_null ? null : true;
}

function _anyTrue(conds, i, candles, ind) {
  if (!conds || conds.length === 0) return false;
  for (const c of conds) {
    if (_evalCondition(c, i, candles, ind) === true) return true;
  }
  return false;
}

// mulberry32 — small deterministic PRNG so a "random-entry null" is
// reproducible run-to-run for the ledger (see docs/concierge-proxy-kit.md).
function _mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _MIN_WARMUP = 55; // mirrors crypto-bot's engine.py _MIN_CANDLES

/**
 * Close an open position against bar `i`'s OHLC. SL takes priority over TP if
 * both are touched in the same bar (conservative — mirrors crypto-bot).
 * Returns a trade object or null if still open.
 */
function _checkExit(position, i, candles, ruleset, ind) {
  const c = candles[i];
  const dirSign = position.direction === 'short' ? -1 : 1;
  const stopPrice = position.entryPrice * (1 - dirSign * ruleset.stop_pct);
  const tpPrice = position.entryPrice * (1 + dirSign * ruleset.take_profit_pct);

  const hitStop = position.direction === 'short' ? c.high >= stopPrice : c.low <= stopPrice;
  const hitTp = position.direction === 'short' ? c.low <= tpPrice : c.high >= tpPrice;

  if (hitStop) return _closeTrade(position, i, stopPrice, 'STOP', candles);
  if (hitTp) return _closeTrade(position, i, tpPrice, 'TP', candles);

  if (ruleset.max_hold_bars && i - position.entryIndex >= ruleset.max_hold_bars) {
    return _closeTrade(position, i, c.close, 'MAX_HOLD', candles);
  }
  if (_anyTrue(ruleset.exit, i, candles, ind)) {
    return _closeTrade(position, i, c.close, 'SIGNAL_EXIT', candles);
  }
  return null;
}

function _closeTrade(position, exitIndex, exitPrice, reason, candles) {
  const dirSign = position.direction === 'short' ? -1 : 1;
  const grossPnlPct = dirSign * (exitPrice - position.entryPrice) / position.entryPrice * 100;
  return {
    entryIndex: position.entryIndex,
    exitIndex,
    entryTime: candles[position.entryIndex].time,
    exitTime: candles[exitIndex].time,
    entryPrice: position.entryPrice,
    exitPrice,
    direction: position.direction,
    grossPnlPct,
    exitReason: reason,
    barsHeld: exitIndex - position.entryIndex,
  };
}

/**
 * Replay `ruleset` over one symbol's candles. Long-only signal generation;
 * `direction` on the returned trades is 'long' unless flipped by a null model.
 */
function runRuleset(candles, ruleset) {
  if (candles.length < _MIN_WARMUP + 2) {
    return { trades: [], eligibleEntryBars: [] };
  }
  const closes = candles.map((c) => c.close);
  const ind = _buildIndicatorCache(closes);

  // Pass 1 — decidability pool: every bar where the entry rule COULD be
  // evaluated (true or false), independent of the real strategy's own
  // position state. This is what the random-entry null samples from, so it
  // isn't fragmented down to only the gaps between the real strategy's own
  // trades (which would starve the null of room to place same-length trades).
  const eligibleEntryBars = [];
  for (let i = _MIN_WARMUP; i < candles.length - 1; i++) {
    if (_allTrue(ruleset.entry, i, candles, ind) !== null) eligibleEntryBars.push(i);
  }

  // Pass 2 — actual replay, respecting one-open-position-at-a-time.
  const trades = [];
  let position = null;

  for (let i = _MIN_WARMUP; i < candles.length - 1; i++) {
    if (position) {
      const trade = _checkExit(position, i, candles, ruleset, ind);
      if (trade) {
        trades.push(trade);
        position = null;
      }
      continue; // don't open a new position the same bar a position closed
    }

    const signal = _allTrue(ruleset.entry, i, candles, ind);
    if (signal === true) {
      // Fill at the NEXT bar's open — signal decided on bar i's close data,
      // executed one bar later. This is what keeps the Look-ahead & Leakage
      // Scan honest: decision and fill are never the same price.
      position = {
        entryIndex: i + 1,
        entryPrice: candles[i + 1].open,
        direction: 'long',
      };
    }
  }
  // Any position still open at the end of data is dropped (unrealized, not a
  // completed trade) rather than force-closed — avoids inventing a fill price.

  return { trades, eligibleEntryBars };
}

/**
 * Random-entry null: same trade COUNT as the real strategy, entries placed at
 * uniformly-random eligible bars, same stop/TP/max-hold exit rules (no
 * signal-based exit — a random entry has no signal to exit on). Deterministic
 * given ruleset.seed so re-runs for the ledger reproduce identically.
 */
function runRandomNull(candles, ruleset, nTrades, eligibleEntryBars, seed) {
  if (nTrades === 0 || eligibleEntryBars.length === 0) return [];
  const rng = _mulberry32(seed == null ? 42 : seed);
  const nullRuleset = { stop_pct: ruleset.stop_pct, take_profit_pct: ruleset.take_profit_pct, max_hold_bars: ruleset.max_hold_bars };
  const ind = _buildIndicatorCache(candles.map((c) => c.close)); // unused by nullRuleset but _checkExit expects it

  // Greedy random packing: repeatedly draw a random remaining candidate bar,
  // simulate its trade, and — whether it succeeds or fails — remove it (and,
  // on success, every bar its holding period overlaps) from the pool. This
  // packs non-overlapping "one position at a time" trades far more densely
  // than a single shuffle-and-walk pass, which strands candidates behind an
  // earlier pick even when they no longer conflict with anything placed.
  let remaining = eligibleEntryBars.filter((i) => i + 1 < candles.length - 1);
  const trades = [];
  while (trades.length < nTrades && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    const startBar = remaining[idx];
    remaining.splice(idx, 1);

    const entryIndex = startBar + 1;
    const position = { entryIndex, entryPrice: candles[entryIndex].open, direction: 'long' };
    let exitTrade = null;
    for (let i = entryIndex; i < candles.length - 1; i++) {
      exitTrade = _checkExit(position, i, candles, nullRuleset, ind);
      if (exitTrade) break;
    }
    if (!exitTrade) continue; // never closed before end of data — discard, don't count

    remaining = remaining.filter((b) => b < startBar || b > exitTrade.exitIndex);
    trades.push(exitTrade);
  }

  trades.sort((a, b) => a.entryIndex - b.entryIndex);
  return trades;
}

/**
 * Wrong-sign null: the SAME entries as the real strategy, mirrored to the
 * opposite direction (if the rule says buy, this null sells). If a real
 * strategy's entries can't beat taking the opposite side of its own signal,
 * the signal carries no directional information.
 */
function runWrongSignNull(realTrades) {
  return realTrades.map((t) => ({ ...t, direction: 'short', grossPnlPct: -t.grossPnlPct }));
}

module.exports = { runRuleset, runRandomNull, runWrongSignNull, _MIN_WARMUP };
