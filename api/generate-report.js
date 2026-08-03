const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');

const REPORT_PROMPT = (strategy) => `You are VEKTOR, an independent crypto strategy falsification system. A trader has paid $99 for a full audit. Write a complete, professional falsification report.

Strategy submitted:
"""
${strategy}
"""

Return ONLY a valid JSON object — no markdown, no extra text:
{
  "verdict": "STOP" | "REWORK" | "GO_CONDITIONAL",
  "verdict_color": "#ef4444" | "#fbbf24" | "#4ade80",
  "verdict_emoji": "🔴" | "🟠" | "🟡",
  "executive_summary": "2-3 clear sentences. What is this strategy, the verdict, and the single most important reason.",
  "tests": [
    {
      "name": "Look-ahead & Leakage Scan",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 honest sentences explaining what was checked and what was found."
    },
    {
      "name": "Cost & Slippage Stress (3× base fees)",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences."
    },
    {
      "name": "Random-Entry Null Comparison",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences."
    },
    {
      "name": "Permuted-Timing Null",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences."
    },
    {
      "name": "Walk-Forward Out-of-Sample Test",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences."
    },
    {
      "name": "Multiple-Testing Correction",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences."
    }
  ],
  "what_would_change_verdict": [
    "Specific concrete step 1",
    "Specific concrete step 2",
    "Specific concrete step 3"
  ],
  "bottom_line": "One plain-language sentence for a non-technical reader."
}

Be honest and direct. If the description is vague, mark tests UNABLE TO TEST and state what info is missing. Do NOT invent specific p-values you cannot compute.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, strategy } = req.body || {};

  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  if (!strategy || strategy.trim().length < 10) return res.status(400).json({ error: 'strategy required' });

  // Verify payment via Stripe
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payment verification not configured.' });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Payment not confirmed. Please complete checkout first.' });
    }
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(403).json({ error: 'Could not verify payment. If you paid, contact laurin85@gmail.com.' });
  }

  // Generate report
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: REPORT_PROMPT(strategy.slice(0, 3000)) }],
    });
    const raw = msg.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const report = match ? JSON.parse(match[0]) : null;
    if (!report) throw new Error('Invalid JSON from model');
    res.json({ report });
  } catch (err) {
    console.error('generate-report error:', err.message);
    res.status(500).json({ error: 'Report generation failed. Please try refreshing the page.' });
  }
};
