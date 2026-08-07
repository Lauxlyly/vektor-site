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
    temperature: 0.2, // low → consistent screening verdict on repeat runs of the same strategy
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
  "what_would_help": "one sentence on what ruleset/data would be needed to actually test this",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "preliminary_note": "one sentence: this is a free qualitative screen, not a completed test"
}

Terminology (be precise): say 'full margin' not '100% leverage' unless a multiple is stated; 'loss-averaging' not 'martingale' unless a sizing formula is given; never assert direction (long/short) unless stated; perp funding is paid OR received, not a pure cost.

Classification rules:
- STOP: a clearly fatal design/risk problem is evident from the description (e.g. guaranteed-blow-up loss-averaging, obvious look-ahead, or pure survivorship-bias marketing).
- REWORK: structurally weak but potentially salvageable — needs significant change before it could be tested.
- GO_CONDITIONAL: no obvious fatal flaw visible in this quick screen — warrants a proper review with a ruleset and data (does NOT mean it works).

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
      what_would_help: 'Provide entry trigger, exit logic, timeframe, and instrument.',
      confidence: 'LOW',
      preliminary_note: 'This is a quick screen only — not a full statistical audit.'
    };
  }

  res.json(result);
};
