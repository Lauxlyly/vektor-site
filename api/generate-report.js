const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const { Resend } = require('resend');
const { jsonrepair } = require('jsonrepair');
const { buildEmail } = require('../lib/report-email');
const { rateLimit } = require('../lib/ratelimit');
const { saveOrder } = require('../lib/orders');

function makeAuditId(sessionId) {
  const d = new Date();
  const ymd = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const src = (sessionId || '').replace(/[^a-zA-Z0-9]/g, '');
  const tail = (src.slice(-4) || String(Math.floor(1000 + Math.random() * 9000))).toUpperCase();
  return `VK-${ymd}-${tail}`;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Alerts the owner immediately on any failure, with enough context (session_id +
// full strategy text) to recover the order by hand without digging through Stripe,
// Resend, and 1-hour-retention Vercel logs first.
async function notifyOwnerFailure({ sessionId, auditId, email, strategy, stage, error }) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM || 'VEKTOR System <onboarding@resend.dev>';
    const owner = process.env.OWNER_EMAIL || 'laurin85@gmail.com';
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#050508;color:#e2e8f0;padding:32px;">
      <div style="max-width:600px;margin:0 auto;">
        <div style="font-family:monospace;font-size:13px;font-weight:800;letter-spacing:4px;color:#f87171;margin-bottom:20px;">VEKTOR · REPORT FAILED</div>
        <div style="background:#0a0a16;border:1px solid rgba(248,113,113,.3);border-radius:12px;padding:22px;font-size:14px;color:#cbd5e1;line-height:1.9;">
          <b>Stage:</b> ${escHtml(stage)}<br>
          <b>Session:</b> <span style="font-family:monospace;font-size:12px;color:#94a3b8;">${escHtml(sessionId)}</span><br>
          ${auditId ? `<b>Audit ID:</b> ${escHtml(auditId)}<br>` : ''}
          <b>Customer:</b> ${escHtml(email || 'unknown')}<br>
          <b>Error:</b> ${escHtml(error)}
        </div>
        <div style="margin-top:18px;">
          <div style="font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Submitted strategy</div>
          <div style="background:#080812;border:1px solid #1a1a2e;border-radius:8px;padding:14px 16px;font-size:13px;color:#94a3b8;line-height:1.6;white-space:pre-wrap;">${escHtml(strategy || '(not available)')}</div>
        </div>
        <div style="font-size:12px;color:#64748b;line-height:1.7;margin-top:18px;">
          The payment was already captured — this only affects delivery. To recover: check
          <code>/admin</code> for this session, or POST the session_id + strategy above to
          /api/generate-report by hand (works up to 48h after purchase).
        </div>
      </div>
    </body></html>`;
    await resend.emails.send({
      from,
      to: owner,
      subject: `[VEKTOR] ⚠️ Report failed (${stage}) — ${email || 'unknown email'}`,
      html,
    });
  } catch (e) {
    console.error('notifyOwnerFailure error:', e.message);
  }
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
- Do not include internal or system XML tags (e.g. thinking tags) in your response.
- The text may be a raw auto-transcription. Read numbers/ratios charitably: spoken "one to four" often lands as "104" or "1:04" and almost always means a 1:4 risk-reward. Interpret the intended meaning, note if a figure is genuinely ambiguous, and never propagate an obvious transcription typo as if it were the trader's stated value.

# EDGE-SOURCE & COUNTERPARTY (a qualitative read available from a description)
Unlike the statistical checks below (which need data and are therefore NEEDS DATA), you CAN qualitatively assess whether the submission STATES a plausible edge thesis and persistence mechanism. This is an assessment of the described thesis — NOT evidence the edge is real, durable, un-arbitraged, or economically large. Frame it strictly at that level; do not imply it was verified.
A durable edge, if one exists, comes from exactly ONE of: SPEED, INFORMATION, STRUCTURE (being paid to provide liquidity / take the other side of forced/mechanical flow), or RISK PREMIUM (being paid to hold a risk others avoid). Prediction from visible chart patterns is not a durable edge.
Classify edge_source using the SAME enum and definitions as the free screen (keep them identical): use "prediction-only" ONLY for explicit visible-pattern prediction; "none-identifiable" when the description is too thin to name a source. Distinguish TERSE from EDGELESS — missing detail is not proof no edge exists.
Counterparty: name the party or flow that plausibly pays, loses, cedes spread, or accepts worse terms, and why it may persist (urgency, hedging, liquidation, mandate, inventory constraint, latency disadvantage, information gap, or risk transfer). Do NOT invent one — if unsupported, write "No identifiable counterparty from the description." A missing/vague edge source is one of the most important findings, but it does NOT override a concrete mechanical fatal flaw (e.g. guaranteed-blow-up loss-averaging), which stays the priority whenever one is present.
If your edge classification differs from a prior free quick-screen, treat this report as the authoritative deeper assessment and state plainly why the fuller read changed the call.

# TEXT-JUDGEABLE ILLUSION GUARDS
These remain qualitative review items unless real trade/price data was supplied — never label them PASS/FAIL from narrative alone; they are NEEDS DATA (or LIMITED DATA) like the checks below.

Mean / Median Skew Check: If a fat-tailed strategy cites an average/mean return, require the median, the hit rate (share of positive events), the outlier/concentration profile, and the treatment of untradeable/unexitable cases. Treat an extreme headline number as more likely an outlier/concentration or pipeline-artifact risk than a discovery until shown otherwise. The finding must state that these values were NOT computed here unless the submission supplied them.

Exit Feasibility Check: For illiquid, thin, latency-sensitive, copy-trading, or fixed-horizon strategies, require the fraction of signals exitable at the stated horizon and the rule for signals with no exit. Do NOT claim exits failed unless supplied data shows it. Skip for slow, liquid, single-instrument strategies unless the text raises fill/liquidity/horizon ambiguity.

Source Concentration Check: For copy-trading, KOL, wallet-following, signal-following, or any claimed multi-source strategy, require the number of genuinely independent sources and the share of events from the largest few. Do NOT apply to unrelated single-instrument strategies.

Capital-Clustering / Concurrent-Position Check: For strategies whose entries are triggered by regimes, breakouts, volatility spikes, momentum/trend conditions, liquidations, or other market-state events that can plausibly re-fire before earlier positions have exited, require trigger dates, exit dates, holding-period logic, position-sizing rules, max concurrent positions, gross/net exposure caps, and portfolio-level NAV accounting. The risk is that a sequential trade chain can silently give each clustered signal fresh full capital instead of sharing one capped capital pool. Do NOT claim overlap was measured unless dates were supplied. Do NOT apply this to one-position-at-a-time systems, fixed calendar rebalances with explicit portfolio weights, or strategies with explicit capped gross/net exposure. Missing capital-pool detail is NEEDS DATA / REWORK, not a computed failure.

Surfacing: emit these as the last four entries of tests[] using exactly the names above. When a guard is not relevant to the submitted strategy type, still emit it with result "NEEDS DATA" and a one-line finding saying why it does not apply — never silently omit an entry. Never present any of them as a computed result.

Multiple-Testing / Selection-Bias Check (finding guidance): In addition to asking for the number of variants tried and whether selection was pre-registered, if the submission mentions a permutation or bootstrap null test alongside a stated variant count, require the number of null draws and compare the minimum achievable honest p-value, approximately 1/(draws + 1), with the corrected significance bar such as alpha / variants. If the draw count is too small to ever clear the corrected bar, state that the null test is underpowered for the claimed correction. Do not invent the variant count, alpha, or draw count; if any are missing, ask for them.

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
    { "name": "Multiple-Testing / Selection-Bias Check", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Mean / Median Skew Check", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Exit Feasibility Check", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Source Concentration Check", "result": "...", "result_color": "...", "finding": "..." },
    { "name": "Capital-Clustering / Concurrent-Position Check", "result": "...", "result_color": "...", "finding": "..." }
  ],
  "what_would_change_verdict": [
    "The first, cheapest step: a zero-latency, zero-cost best-case backtest that keeps every event (no dropped/unfillable trades). If the strategy fails at lag 0 with no fees, slippage, or latency, every realistic downstream variant is dominated and the question is settled in an afternoon.",
    "The second: a formal, testable ruleset (entry/exit/sizing) plus a trade log or backtest with dates — evaluated on the correct metrics for the strategy type (e.g. probability of ruin before target, expected log-growth, terminal-wealth distribution for an extreme-skew system — not just Sharpe).",
    "The third: full track-record disclosure to rule out survivorship/selection bias (number of blown accounts, total capital deposited, withdrawals)."
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
  const auditId = makeAuditId(session_id);
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

    // Order confirmed real and paid — start tracking it now, before the slow part,
    // so a crash mid-generation still leaves a durable record instead of nothing.
    // (Fails soft if Upstash isn't configured; never blocks the response either way.)
    await saveOrder(session_id, {
      audit_id: auditId,
      email: customerEmail,
      amount_total: session.amount_total,
      currency: session.currency,
      client_reference_id: session.client_reference_id || null,
      created_at: session.created ? new Date(session.created * 1000).toISOString() : undefined,
      strategy,
      status: 'generating',
    });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(403).json({ error: 'Could not verify payment. If you paid, contact laurin85@gmail.com.' });
  }

  // Generate report
  const cleanStrategy = strategy.slice(0, 3000);
  let report;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Sonnet 5, not Opus 5. This runs inside a 60s Vercel function; Opus 5 (adaptive
    // thinking on by default) routinely ran past 60s on a full 10-check report and the
    // buyer got an opaque platform timeout. Sonnet 5 is 2-3x faster, cheaper, and easily
    // strong enough for a structured red-team.
    //  - thinking disabled + effort low: single-shot JSON, no tools -> terse and fast
    //  - streaming + 55s client timeout: finishes well under Vercel's 60s, and a slow run
    //    aborts as a catchable error (clean JSON 500) instead of a platform timeout
    //  - no temperature: the 4.7+ family (incl. Sonnet 5) rejects sampling params with 400
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: REPORT_PROMPT(cleanStrategy) }],
    }, { timeout: 55_000 });
    const msg = await stream.finalMessage();
    const textBlock = msg.content.find((b) => b.type === 'text');
    const raw = (textBlock ? textBlock.text : '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in model response');
    try {
      report = JSON.parse(match[0]);
    } catch (parseErr) {
      // The model occasionally emits a syntax error inside a free-text field (almost
      // always an unescaped quote inside a "finding"/"summary" string it's quoting the
      // submitted strategy in) — a real customer hit exactly this. jsonrepair fixes the
      // SYNTAX so the paid order still gets a report instead of nothing; the specific
      // field that had the stray character may end up slightly truncated or split at
      // that point, which is an acceptable trade against a hard failure on an
      // already-paid $99 order. The strict-parse path above is unaffected for the
      // normal case (well-formed JSON), so this only ever engages on a response that
      // would otherwise have failed outright.
      console.error('generate-report: JSON.parse failed, attempting repair:', parseErr.message);
      report = JSON.parse(jsonrepair(match[0]));
    }
    if (!report || typeof report !== 'object') throw new Error('Invalid JSON from model');
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
    await saveOrder(session_id, { status: 'failed', error: err.message });
    await notifyOwnerFailure({ sessionId: session_id, auditId, email: customerEmail, strategy, stage: 'generation', error: err.message });
    return res.status(500).json({ error: 'Report generation failed. Please try refreshing the page.' });
  }

  // Email the report to the customer + owner BEFORE sending the HTTP response.
  // On Vercel the function can be frozen the moment the response is returned, so
  // any await AFTER res.json() may never run — that's why the payment webhook mail
  // arrived but the report mail didn't. Report generation already took ~20s, so the
  // extra ~1-2s here is negligible and guarantees delivery.
  let emailSentCustomer = false;
  let emailSentOwner = false;
  let emailError = null;
  if (process.env.RESEND_API_KEY) {
    try {
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
        emailSentCustomer = true;
      }
      await resend.emails.send({
        from,
        to: owner,
        subject: `[VEKTOR] Audit #${auditId} — ${report.verdict} — ${customerEmail || 'unknown email'}`,
        html,
      });
      emailSentOwner = true;
    } catch (err) {
      console.error('Email send error (non-fatal):', err.message);
      emailError = err.message;
    }
  }

  // Report exists and is returned to the browser either way, but the emailed copy —
  // the thing the page promises — didn't go out. Flag it so it isn't only discoverable
  // if the customer happens to notice and mention it later.
  await saveOrder(session_id, {
    status: 'delivered',
    verdict: report.verdict,
    report,
    email_sent_customer: emailSentCustomer,
    email_sent_owner: emailSentOwner,
    email_error: emailError,
  });
  if (!emailSentCustomer && customerEmail) {
    await notifyOwnerFailure({ sessionId: session_id, auditId, email: customerEmail, strategy, stage: 'email delivery', error: emailError || 'customer email not sent (RESEND_API_KEY missing?)' });
  }

  // Respond last, once emails + the order record have been dispatched.
  res.json({ report });
};
