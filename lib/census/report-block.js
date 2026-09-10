// Renders the "Empirical falsification" block exactly per
// docs/concierge-proxy-kit.md Step 4, from a runCensus() result.

function fmtPct(x, digits = 3) {
  if (x == null || Number.isNaN(x)) return 'n/a';
  const sign = x > 0 ? '+' : '';
  return `${sign}${x.toFixed(digits)}%`;
}

function verdictVsNull(realExpectancy, nullExpectancy) {
  if (realExpectancy == null || nullExpectancy == null) return 'n/a';
  if (realExpectancy > nullExpectancy) return 'better';
  if (realExpectancy < nullExpectancy) return 'worse';
  return 'tied';
}

function describeRuleset(ruleset) {
  const c = (list) => (list && list.length ? JSON.stringify(list) : 'n/a');
  return [
    `ENTRY:  ${c(ruleset.entry)}`,
    `STOP:   ${(ruleset.stop_pct * 100).toFixed(2)}%`,
    `EXIT:   take-profit ${(ruleset.take_profit_pct * 100).toFixed(2)}%${ruleset.max_hold_bars ? `, max hold ${ruleset.max_hold_bars} bars` : ''}${ruleset.exit && ruleset.exit.length ? `, signal exit ${c(ruleset.exit)}` : ''}`,
  ].join('\n');
}

/**
 * @param {Ruleset} ruleset
 * @param {{universe: string[], interval: string, startMs: number, endMs: number}} window
 * @param {ReturnType<import('./run').runCensus>} result
 * @param {'1x'|'2x'|'3x'} [costLabel] which cost multiple headlines the block (default '3x', the stress case)
 */
function buildReportBlock(ruleset, window, result, costLabel = '3x') {
  const real = result.real.metrics[costLabel];
  const randomNull = result.randomEntryNull.metrics[costLabel];
  const wrongSignNull = result.wrongSignNull.metrics[costLabel];

  const startStr = new Date(window.startMs).toISOString().slice(0, 10);
  const endStr = new Date(window.endMs).toISOString().slice(0, 10);

  return `### Empirical falsification (bonus — generous proxy of your stated rules)

We were able to mechanize your stated rules, so instead of stopping at a qualitative read we ran a
real test. **We tested a generous proxy of your *stated* rules — not your personal discretion.**
Here is the exact ruleset we ran:

\`\`\`
${describeRuleset(ruleset)}
UNIVERSE / WINDOW: ${window.universe.join(', ')} · ${window.interval} · ${startStr} to ${endStr}
COSTS:  triple-cost (fees + slippage + spread) — showing ${costLabel} of base ${(result.costPctRoundTrip1x * 100).toFixed(2)}% round-trip
NULLS:  random-time entry; wrong-sign entry (must beat both)
SPLIT:  sealed — entire window scored as out-of-sample (rules were stated, not fit to this data)
\`\`\`

**Result (out-of-sample, sealed):** net expectancy **${fmtPct(real.netExpectancyPct)}/trade** over **${real.n}**
setups; vs random-entry null: **${verdictVsNull(real.netExpectancyPct, randomNull.netExpectancyPct)}**
(random: ${fmtPct(randomNull.netExpectancyPct)}/trade, n=${randomNull.n}); vs wrong-sign null:
**${verdictVsNull(real.netExpectancyPct, wrongSignNull.netExpectancyPct)}** (wrong-sign: ${fmtPct(wrongSignNull.netExpectancyPct)}/trade).
Hit rate ${real.hitRate == null ? 'n/a' : (real.hitRate * 100).toFixed(1) + '%'}, profit factor ${real.profitFactor == null ? 'n/a' : real.profitFactor.toFixed(2)}, max drawdown ${fmtPct(real.maxDrawdownPct)}.

**What this means — and does not.** This is a falsification of *this mechanical proxy of your stated
rules*, over this universe and window. It is **not** a claim that your strategy will lose, **not** a
claim about your live discretion or risk management, and **not** a prediction. If your actual rules
differ from the proxy above, tell us where — **we will re-run once, free.**`;
}

module.exports = { buildReportBlock, fmtPct, verdictVsNull };
