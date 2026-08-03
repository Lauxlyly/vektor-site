const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { strategy } = req.body || {};
  if (!strategy || strategy.trim().length < 15) {
    return res.status(400).json({ error: 'Strategy description too short (min 15 chars)' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `You are VEKTOR — an independent crypto strategy falsification system used by serious traders to screen strategies before deployment. Give a preliminary screening assessment.

Strategy submitted:
"""
${strategy.slice(0, 2500)}
"""

Reply with ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "verdict": "STOP" | "REWORK" | "GO_CONDITIONAL",
  "primary_finding": "one clear sentence — the single most important finding",
  "red_flags": ["2-3 specific concerns, each max 12 words"],
  "what_would_help": "one sentence on what testing/data would settle the question",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "preliminary_note": "one sentence clarifying this is a quick screen, not a full statistical audit"
}

Classification rules:
- STOP: has a clear fatal flaw — look-ahead bias, no edge over random entry, collapses under realistic costs, or is pure curve-fitting
- REWORK: structurally flawed but potentially salvageable — needs significant changes before testing
- GO_CONDITIONAL: no obvious fatal flaw identified in this quick screen — warrants formal statistical testing (does not mean it works)

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
