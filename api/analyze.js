const Anthropic = require('@anthropic-ai/sdk');
const { rateLimit } = require('../lib/ratelimit');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await rateLimit(req, res, { name: 'analyze', max: 8, windowSec: 60 }))) return;

  const { strategy } = req.body || {};
  if (typeof strategy !== 'string' || strategy.trim().length < 15) {
    return res.status(400).json({ error: 'Strategy description too short (min 15 chars)' });
  }
  if (strategy.length > 20000) {
    return res.status(413).json({ error: 'Strategy text is too long.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  // A real Anthropic key looks like `sk-ant-...` and is ~100+ chars. Catch a
  // missing/placeholder/truncated key here so we return a clean JSON error
  // instead of letting the SDK throw an unhandled 401 → FUNCTION_INVOCATION_FAILED.
  if (!apiKey || apiKey.length < 40) {
    console.error('analyze: ANTHROPIC_API_KEY missing or invalid (len=' + (apiKey ? apiKey.length : 0) + ')');
    return res.status(503).json({ error: 'The analysis service is temporarily unavailable. Please try again shortly.' });
  }

  const client = new Anthropic({ apiKey });

  let msg;
  try {
    msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    temperature: 0, // as deterministic as the API allows → same strategy, same verdict on repeat runs
    messages: [{
      role: 'user',
      content: `You are VEKTOR — an independent crypto strategy falsification service used by serious traders to screen strategies before deployment. Give a preliminary, qualitative RISK SCREEN. This is a judgement based only on the description — NOT a computed statistical test. Do NOT invent p-values, Sharpe ratios, drawdowns or trade counts, and do NOT claim any statistic was calculated.

Strategy submitted:
"""
${strategy.slice(0, 2500)}
"""

Reply with ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "verdict": "STOP" | "REWORK" | "GO_CONDITIONAL",
  "primary_finding": "one clear sentence — the single most important risk observation (an opinion, not a test result)",
  "red_flags": ["2-3 specific concerns, each max 12 words"],
  "edge_source": "speed" | "information" | "structure" | "risk-premium" | "prediction-only" | "none-identifiable",
  "counterparty": "one sentence: who plausibly loses to this trade and why they can't stop — or 'No identifiable counterparty' if none can be named",
  "what_would_help": "one sentence on what ruleset/data would be needed to actually test this",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "preliminary_note": "one sentence: this is a free qualitative screen, not a completed test"
}

Edge-source & counterparty — a QUALITATIVE assessment of whether the description STATES a plausible edge thesis and persistence mechanism. This is judgeable from text (unlike the statistics), but it is NOT evidence the edge is real, durable, un-arbitraged, or survives costs — keep it at that level, never as proof.
A durable edge, if one exists, comes from ONE of: SPEED (acting on information faster), INFORMATION (seeing/computing/aggregating what others can't), STRUCTURE (being paid to provide a service — liquidity, or taking the other side of forced/mechanical flow), or RISK PREMIUM (being paid to hold a risk others avoid). Prediction from visible chart patterns is not a durable edge.
Classify edge_source: use "prediction-only" ONLY when the strategy explicitly relies on visible-pattern prediction; use "none-identifiable" when the description is too thin to identify a source. Distinguish TERSE from EDGELESS — missing detail is not proof that no edge exists; when a source can't be identified because the description is thin, set edge_source="none-identifiable", confidence="LOW", and prefer REWORK (ask for more), not STOP.
For counterparty, name the party or flow that plausibly pays, loses, cedes spread, or accepts worse terms, and why it may persist: urgency, hedging, liquidation, mandate, inventory constraint, latency disadvantage, information gap, or risk transfer. Do NOT invent a counterparty — if the description doesn't support one, write "No identifiable counterparty from the description" and note what would be needed.

Illusion guards — qualitative opinions only, never computed. Do NOT claim you calculated any of the values below; judge only what the description does and does not rule out.
- Mean/median divergence & implausible magnitude: In fat-tailed domains (crypto, memecoins, options, small caps), if the submission uses an average/mean return as its headline evidence without also giving the median and the hit rate (share of positive events), flag an outlier/denominator gap and ask for both. Separately, treat an extreme headline number (returns in the hundreds or thousands of percent) as more likely a broken data pipeline or a few outlier events than a real discovery, and say so as an opinion. Do NOT penalise a user merely for reporting a mean — the problem is relying on the mean alone as proof. A missing median is REWORK, not STOP.
- Exit feasibility: Only for illiquid, thin, latency-sensitive, copy-trading, or fixed-horizon strategies, check whether the description states what fraction of signals can actually be exited at the stated horizon and what happens to those that cannot. If absent, ask for it. Do NOT claim any trade was unexitable unless the submission says so. For slow, liquid, major-market single instruments, raise this only if the text itself invites a fill/liquidity/horizon concern.
- Source concentration: Only for copy-trading, KOL, wallet-following, signal-following, or other strategies that claim benefit from many independent sources, check whether the description shows how many genuinely independent sources generate the signals and the share from the largest few. If independence is asserted but unsupported, flag concentration risk. Do NOT apply this to a single-instrument strategy unless source diversification is part of the stated thesis.
- Capital-clustering / concurrent-position risk: For strategies whose entries are triggered by regimes, breakouts, volatility spikes, momentum/trend conditions, liquidations, or other market-state events that can plausibly re-fire before earlier positions have exited, check whether the description states how capital is shared across simultaneous open signals. Ask whether the backtest used one capped capital pool with position-sizing / max-exposure rules, or whether each signal was effectively given fresh full capital. Do NOT claim signals overlapped unless the submission provides trigger/exit dates. Do NOT apply this to strategies that are one-position-at-a-time by construction, fixed calendar rebalances with explicit portfolio weights, or systems with explicit gross/net exposure caps. Missing capital-pool detail is REWORK, not STOP; STOP only when a strong deployment-ready return claim rests on an explicit unlimited-reentry / fresh-full-capital assumption.
- Self-reported methodology claims are not independent evidence: a submission stating it was "walk-forward tested", "out-of-sample validated", "parameter-stable", or similarly rigorous does NOT verify that testing happened, and must NOT be allowed to soften or override a fatal-looking headline stat (e.g. an extreme win rate paired with a negative risk:reward) or a missing counterparty. Decide the verdict from the stat/counterparty evidence alone; mention the methodology claim only as an unverified detail worth asking about in what_would_help. This precedence rule exists specifically so that a submission combining one fatal-looking element with one reassuring-sounding element gets a stable verdict rather than one that depends on which detail the read happens to weight first.

These guards normally produce REWORK when detail is missing. They support STOP only when a strong, deployment-ready edge claim rests entirely on the unsupported headline statistic, an assumed exit, an asserted-but-unshown independence, or an explicit uncapped/fresh-capital assumption for overlapping or re-entering signals.

Terminology (be precise): say 'full margin' not '100% leverage' unless a multiple is stated; 'loss-averaging' not 'martingale' unless a sizing formula is given; never assert direction (long/short) unless stated; perp funding is paid OR received, not a pure cost.

Classification rules:
- STOP: a clearly fatal design/risk problem is evident from the description (e.g. guaranteed-blow-up loss-averaging, obvious look-ahead, or pure survivorship-bias marketing) — OR the strategy explicitly relies on visible-pattern prediction with no edge mechanism — OR it makes a strong edge claim while no source/counterparty can be named. (Do NOT STOP merely because a terse description omitted its counterparty.)
- REWORK: structurally weak but potentially salvageable, OR simply under-specified (edge source not yet identifiable from thin detail) — needs more detail/change before it could be tested.
- GO_CONDITIONAL: no obvious fatal flaw visible in this quick screen AND either a plausible edge source + counterparty can be named, or the only gap is under-specification rather than absence of an edge — warrants a proper review with a ruleset and data (does NOT mean it works).

Be honest, critical, and concise. The vast majority of strategies fail screening. Social media hype is not evidence of edge.`
    }]
    });
  } catch (err) {
    // Auth failure, model access, rate limit, network — never crash the function.
    console.error('analyze: Anthropic call failed:', err.status, err.message);
    return res.status(502).json({ error: 'The analysis service is temporarily unavailable. Please try again shortly.' });
  }

  const text = msg.content[0].text.trim();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { result = JSON.parse(match[0]); } catch { result = null; }
    }
  }
  if (!result) {
    result = {
      verdict: 'REWORK',
      primary_finding: 'Analysis could not be completed. Please rephrase and try again.',
      red_flags: ['Unclear strategy description'],
      edge_source: 'none-identifiable',
      counterparty: 'Not determinable from the text provided.',
      what_would_help: 'Provide entry trigger, exit logic, timeframe, and instrument.',
      confidence: 'LOW',
      preliminary_note: 'This is a quick screen only — not a full statistical audit.'
    };
  }

  // Enforce the edge_source enum server-side: any off-enum value (hallucination,
  // typo, schema drift) collapses to 'none-identifiable' so the UI can never paint
  // an unknown class green.
  const OK_ES = ['speed', 'information', 'structure', 'risk-premium', 'prediction-only', 'none-identifiable'];
  if (!OK_ES.includes(String(result.edge_source || '').toLowerCase())) {
    result.edge_source = 'none-identifiable';
  }

  res.json(result);
};
