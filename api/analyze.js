const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { strategy } = req.body || {};
  if (typeof strategy !== 'string' || strategy.trim().length < 15) {
    return res.status(400).json({ error: 'Strategy description too short (min 15 chars)' });
  }
  if (strategy.length > 20000) {
    return res.status(413).json({ error: 'Strategy text is too long.' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
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
