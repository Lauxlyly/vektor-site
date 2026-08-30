const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const { Resend } = require('resend');
const { buildEmail } = require('../lib/report-email');
const { rateLimit } = require('../lib/ratelimit');

function makeAuditId(sessionId) {
  const d = new Date();
  const ymd = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const src = (sessionId || '').replace(/[^a-zA-Z0-9]/g, '');
  const tail = (src.slice(-4) || String(Math.floor(1000 + Math.random() * 9000))).toUpperCase();
  return `VK-${ymd}-${tail}`;
}

const REPORT_PROMPT = (strategy) => `You are VEKTOR, an independent crypto strategy falsification service. Produce a rigorous, brutally honest FALSIFICATION REVIEW of the strategy below. This is a structured red-team of failure modes — NOT a claim that statistics were computed.

Strategy / evidence submitted:
"""
${strategy}
"""

# THE ONE RULE THAT MATTERS
You did NOT run any computation. You have no data feed, no backtest engine, no trade log. Therefore you MUST NOT claim any statistic was calculated. A check may ONLY be labelled PASS / FAIL / MARGINAL if an actual computation was performed on real trade or price data — which here it was not. With only a narrative description, EVERY check result is "NEEDS DATA" (or "LIMITED DATA" if partial data was given). Labelling an un-run check "FAIL" is forbidden and self-refuting.

# RESULT LABELS (definitions)
- PASS — check executed on data; pre-registered criterion met. (Not possible from a description.)
- FAIL — check executed on data; criterion violated. (Not possible from a description.)
- MARGINAL — check executed; result near threshold. (Not possible from a description.)
- NEEDS DATA — required inputs (formal ruleset and/or trade/price data) absent; check could not be run. ← default for a description-only submission.
- LIMITED DATA — some inputs present but too sparse for a reliable result.

# HOW EACH CHECK'S "finding" MUST READ (separate the un-run check from your opinion)
"This check requires [what it needs: permuted entry timing / walk-forward OOS windows / a fee+slippage model / a defined entry rule / the count of variants tried]. The submission contained only a narrative description, so no computation was performed. Qualitative note (opinion, not a test result): [your honest risk observation]."

# TERMINOLOGY GUARDRAILS (precision is the product — obey exactly)
- Say "full margin" NOT "100% leverage" unless a leverage multiple is explicitly stated.
- Say "loss-averaging / progressive position-sizing" NOT "martingale" unless a doubling/sizing formula is given.
- Do NOT use psychological labels ("revenge trading") unless the author states them.
- Perpetual funding is PAID OR RECEIVED depending on side/sign — never describe it as a pure cost.
- Say "posterior probability under stated priors" NOT "true Bayesian probability".
- Do NOT assert trade direction (long/short, "profits in uptrends") unless the submission specifies it.
- Only reference a "3× cost & slippage stress" if base fees were given and multiplied; otherwise it is NEEDS DATA — no fee baseline available.
- Never invent p-values, Sharpe ratios, drawdowns, or trade counts.
- The text may be a raw auto-transcription. Read numbers/ratios charitably: spoken "one to four" often lands as "104" or "1:04" and almost always means a 1:4 risk-reward. Interpret the intended meaning, note if a figure is genuinely ambiguous, and never propagate an obvious transcription typo as if it were the trader's stated value.

# EDGE-SOURCE & COUNTERPARTY (a qualitative read available from a description)
Unlike the statistical checks below (which need data and are therefore NEEDS DATA), you CAN qualitatively assess whether the submission STATES a plausible edge thesis and persistence mechanism. This is an assessment of the described thesis — NOT evidence the edge is real, durable, un-arbitraged, or economically large. Frame it strictly at that level; do not imply it was verified.
A durable edge, if one exists, comes from exactly ONE of: SPEED, INFORMATION, STRUCTURE (being paid to provide liquidity / take the other side of forced/mechanical flow), or RISK PREMIUM (being paid to hold a risk others avoid). Prediction from visible chart patterns is not a durable edge.
Classify edge_source using the SAME enum and definitions as the free screen (keep them identical): use "prediction-only" ONLY for explicit visible-pattern prediction; "none-identifiable" when the description is too thin to name a source. Distinguish TERSE from EDGELESS — missing detail is not proof no edge exists.
Counterparty: name the party or flow that plausibly pays, loses, cedes spread, or accepts worse terms, and why it may persist (urgency, hedging, liquidation, mandate, inventory constraint, latency disadvantage, information gap, or risk transfer). Do NOT invent one — if unsupported, write "No identifiable counterparty from the description." A missing/vague edge source is one of the most important findings, but it does NOT override a concrete mechanical fatal flaw (e.g. guaranteed-blow-up loss-averaging), which stays the priority whenever one is present.
If your edge classification differs from a prior free quick-screen, treat this report as the authoritative deeper assessment and state plainly why the fuller read changed the call.

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "verdict": "STOP" | "REWORK" | "GO_CONDITIONAL",
  "verdict_color": "#ef4444" | "#fbbf24" | "#4ade80",
  "verdict_emoji": "🔴" | "🟠" | "🟡",
  "executive_summary": "2-3 clear sentences: what the submission actually is, the verdict, and the single most important reason — framed as a risk/plausibility judgement, not as a computed result.",
  "edge_analysis": {
    "edge_source": "speed" | "information" | "structure" | "risk-premium" | "prediction-only" | "none-identifiable",
    "counterparty": "one sentence: who plausibly loses to this trade and why they can't stop — or 'No identifiable counterparty'",
    "assessment": "2-3 sentences assessing whether the description STATES a plausible edge thesis and persistence mechanism (NOT evidence the edge exists or survives costs/competition). If it relies on visible-pattern prediction with no nameable counterparty, say that is a primary concern — but do not let it override any concrete mechanical fatal flaw."
  },
  "tests": [
    { "name": "Look-ahead & Leakage Scan", "result": "NEEDS DATA" | "LIMITED DATA" | "FAIL" | "PASS" | "MARGINAL", "result_color": "#94a3b8" | "#ef4444" | "#4ade80" | "#fbbf24", "finding": "Follow the finding template above." },
    { "name": "Cost & Slippage Stress", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Random-Entry Null Comparison", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Permuted-Timing Null", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Walk-Forward Out-of-Sample", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Multiple-Testing / Selection-Bias Check", "result": "...", "result_color": "...", "finding": "..." }
  ],
  "what_would_change_verdict": [
    "Concrete input that would let this be genuinely tested (e.g. a formal ruleset with entry/exit/sizing, plus a trade log or backtest with dates).",
    "A second concrete, correctly-specified requirement (correct metrics for the strategy type — e.g. probability of ruin before target, expected log-growth, terminal-wealth distribution — not just Sharpe for an extreme-skew system).",
    "A third: full track-record disclosure needed to rule out survivorship/selection bias (number of blown accounts, total capital deposited, withdrawals)."
  ],
  "bottom_line": "One plain-language sentence: the honest verdict a non-technical reader should walk away with."
}

Colour mapping: NEEDS DATA / LIMITED DATA → "#94a3b8"; FAIL → "#ef4444"; PASS → "#4ade80"; MARGINAL → "#fbbf24".
Be direct and useful. The verdict and risk judgement can still be strong (a described blow-up system is clearly high-risk) — but never dress an opinion up as a completed statistical test.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await rateLimit(req, res, { name: 'report', max: 12, windowSec: 60 }))) return;

  const { session_id, strategy } = req.body || {};

  // Input validation / size caps (reject junk + oversized bodies early)
  if (typeof session_id !== 'string' || !/^cs_[a-zA-Z0-9_]{10,120}$/.test(session_id)) {
    return res.status(400).json({ error: 'A valid Stripe session_id is required.' });
  }
  if (typeof strategy !== 'string' || strategy.trim().length < 10) {
    return res.status(400).json({ error: 'strategy required' });
  }
  if (strategy.length > 20000) {
    return res.status(413).json({ error: 'Strategy text is too long.' });
  }

  // Verify payment via Stripe — the ONLY way to unlock a paid report.
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payment verification not configured.' });
  }
  let customerEmail = null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Must be a genuinely completed one-time payment on OUR account.
    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Payment not confirmed. Please complete checkout first.' });
    }
    // Reject tiny/foreign sessions (a real audit payment is ~$99).
    if (!session.amount_total || session.amount_total < 1000) {
      return res.status(403).json({ error: 'Payment could not be validated for this product.' });
    }
    // Recency window: a session unlocks the report only for a limited time after
    // purchase. This bounds how long a leaked/reused session_id stays usable.
    const ageHours = (Date.now() / 1000 - (session.created || 0)) / 3600;
    if (session.created && ageHours > 48) {
      return res.status(403).json({ error: 'This checkout link has expired. Contact laurin85@gmail.com to re-send your report.' });
    }
    customerEmail = session.customer_details && session.customer_details.email;
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(403).json({ error: 'Could not verify payment. If you paid, contact laurin85@gmail.com.' });
  }

  // Generate report
  const cleanStrategy = strategy.slice(0, 3000);
  let report;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      temperature: 0.2, // low → same strategy gives a consistent verdict/report on repeat runs
      messages: [{ role: 'user', content: REPORT_PROMPT(cleanStrategy) }],
    });
    const raw = msg.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    report = match ? JSON.parse(match[0]) : null;
    if (!report) throw new Error('Invalid JSON from model');
    // Enforce the edge_source enum server-side: off-enum -> none-identifiable, so
    // the report/email UI can never paint an unknown class green.
    if (report.edge_analysis) {
      const OK_ES = ['speed', 'information', 'structure', 'risk-premium', 'prediction-only', 'none-identifiable'];
      if (!OK_ES.includes(String(report.edge_analysis.edge_source || '').toLowerCase())) {
        report.edge_analysis.edge_source = 'none-identifiable';
      }
    }
  } catch (err) {
    console.error('generate-report error:', err.message);
    return res.status(500).json({ error: 'Report generation failed. Please try refreshing the page.' });
  }

  // Email the report to the customer + owner BEFORE sending the HTTP response.
  // On Vercel the function can be frozen the moment the response is returned, so
  // any await AFTER res.json() may never run — that's why the payment webhook mail
  // arrived but the report mail didn't. Report generation already took ~20s, so the
  // extra ~1-2s here is negligible and guarantees delivery.
  if (process.env.RESEND_API_KEY) {
    try {
      const auditId = makeAuditId(session_id);
      const html = buildEmail(cleanStrategy, report, auditId);
      const resend = new Resend(process.env.RESEND_API_KEY);
      const verdict = report.verdict.replace(/_/g, ' ');
      // EMAIL_FROM must be a verified-domain sender for real customers to receive mail
      // (Resend's shared onboarding@resend.dev only delivers to your own account).
      const from = process.env.EMAIL_FROM || 'VEKTOR Audit <onboarding@resend.dev>';
      const owner = process.env.OWNER_EMAIL || 'laurin85@gmail.com';
      if (customerEmail) {
        await resend.emails.send({
          from,
          to: customerEmail,
          subject: `${report.verdict_emoji} Your VEKTOR Strategy Audit — ${verdict} (#${auditId})`,
          html,
        });
      }
      await resend.emails.send({
        from,
        to: owner,
        subject: `[VEKTOR] Audit #${auditId} — ${report.verdict} — ${customerEmail || 'unknown email'}`,
        html,
      });
    } catch (err) {
      console.error('Email send error (non-fatal):', err.message);
    }
  }

  // Respond last, once the emails have been dispatched.
  res.json({ report });
};
