const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

// ── REPORT PROMPT ──────────────────────────────────────────────
const REPORT_PROMPT = (strategy) => `You are VEKTOR, an independent crypto strategy falsification system. A trader has paid $99 for a full audit report. Write a professional, clear, honest report.

Strategy submitted:
"""
${strategy}
"""

Return ONLY a JSON object with this exact structure — no other text:
{
  "verdict": "STOP" | "REWORK" | "GO_CONDITIONAL",
  "verdict_color": "#ef4444" | "#fbbf24" | "#4ade80",
  "verdict_emoji": "🔴" | "🟠" | "🟡",
  "executive_summary": "2-3 clear sentences. What is this strategy, what is the verdict, and the single most important reason.",
  "tests": [
    {
      "name": "Look-ahead & Leakage Scan",
      "result": "FAIL" | "PASS" | "MARGINAL" | "UNABLE TO TEST",
      "result_color": "#ef4444" | "#4ade80" | "#fbbf24" | "#94a3b8",
      "finding": "2-3 sentences explaining what was checked and what was found."
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
    "Specific, concrete action item 1",
    "Specific, concrete action item 2",
    "Specific, concrete action item 3"
  ],
  "bottom_line": "One plain-language sentence summarising the verdict for a non-technical reader."
}

Rules:
- Be honest and direct. Most strategies fail.
- If the description is vague, mark tests as UNABLE TO TEST and explain what information is missing.
- Do NOT invent specific p-values or statistics you cannot actually compute.
- Use plain language — no jargon without explanation.
- Keep each finding to 2-3 sentences maximum.`;

// ── EMAIL BUILDER ──────────────────────────────────────────────
function buildEmail(name, strategy, report) {
  const testRows = report.tests.map(t => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;font-size:13px;color:#cbd5e1;font-weight:600;">${t.name}</td>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;white-space:nowrap;">
        <span style="background:${t.result_color}18;border:1px solid ${t.result_color}44;color:${t.result_color};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:4px;">${t.result}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;font-size:13px;color:#94a3b8;line-height:1.6;">${t.finding}</td>
    </tr>`).join('');

  const changeItems = report.what_would_change_verdict.map(item =>
    `<li style="margin-bottom:8px;color:#94a3b8;font-size:13px;line-height:1.6;">${item}</li>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#050508;">
<div style="max-width:660px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <!-- Logo -->
  <div style="font-family:monospace;font-size:14px;font-weight:800;letter-spacing:4px;color:#a78bfa;margin-bottom:8px;">VEKTOR</div>
  <div style="font-family:monospace;font-size:11px;color:#374151;margin-bottom:36px;">Independent Strategy Falsification · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>

  <!-- Verdict banner -->
  <div style="background:${report.verdict_color}10;border:2px solid ${report.verdict_color}40;border-radius:12px;padding:24px 24px;margin-bottom:24px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">${report.verdict_emoji}</div>
    <div style="font-family:monospace;font-size:26px;font-weight:900;letter-spacing:4px;color:${report.verdict_color};margin-bottom:12px;">${report.verdict.replace('_',' ')}</div>
    <div style="font-size:14px;color:#cbd5e1;line-height:1.7;max-width:480px;margin:0 auto;">${report.executive_summary}</div>
  </div>

  <!-- Strategy submitted -->
  <div style="background:#080812;border:1px solid #1a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#374151;margin-bottom:6px;">Strategy submitted</div>
    <div style="font-size:13px;color:#4b5563;line-height:1.65;">${strategy}</div>
  </div>

  <!-- Test results -->
  <div style="background:#0a0a16;border:1px solid rgba(124,58,237,.2);border-radius:12px;overflow:hidden;margin-bottom:24px;">
    <div style="padding:16px 20px;background:rgba(124,58,237,.07);border-bottom:1px solid rgba(124,58,237,.12);">
      <span style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c3aed;">Test Results · 6 Independent Tests</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#060610;">
          <th style="padding:10px 16px;text-align:left;font-family:monospace;font-size:10px;letter-spacing:1px;color:#374151;text-transform:uppercase;font-weight:700;border-bottom:1px solid #0f0f20;">Test</th>
          <th style="padding:10px 16px;text-align:left;font-family:monospace;font-size:10px;letter-spacing:1px;color:#374151;text-transform:uppercase;font-weight:700;border-bottom:1px solid #0f0f20;">Result</th>
          <th style="padding:10px 16px;text-align:left;font-family:monospace;font-size:10px;letter-spacing:1px;color:#374151;text-transform:uppercase;font-weight:700;border-bottom:1px solid #0f0f20;">Finding</th>
        </tr>
      </thead>
      <tbody>${testRows}</tbody>
    </table>
  </div>

  <!-- What would change verdict -->
  <div style="background:#0a0a16;border:1px solid rgba(124,58,237,.2);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c3aed;margin-bottom:14px;">What Would Change This Verdict</div>
    <ul style="padding-left:20px;margin:0;">${changeItems}</ul>
  </div>

  <!-- Bottom line -->
  <div style="background:#060610;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:32px;">
    <div style="font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4c1d95;margin-bottom:6px;">Bottom Line</div>
    <div style="font-size:15px;color:#e2e8f0;font-weight:600;line-height:1.6;">${report.bottom_line}</div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #0d0d18;padding-top:20px;font-family:monospace;font-size:11px;color:#1f2937;line-height:1.8;text-align:center;">
    VEKTOR · independent strategy falsification<br>
    Pre-registered methodology · Append-only experiment ledger<br>
    This report is not investment advice and does not constitute a trading recommendation.<br>
    Questions? Reply to this email.
  </div>

</div>
</body>
</html>`;
}

// ── HANDLER ──────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data?.object;
  const email = session?.customer_details?.email;
  const name = session?.customer_details?.name || 'Trader';
  const customFields = session?.custom_fields || [];
  const strategy = customFields
    .map(f => f.text?.value || f.dropdown?.value || '')
    .filter(Boolean).join('\n').trim()
    || 'No strategy description provided.';

  if (!email) {
    console.error('No email in webhook session');
    return res.status(400).json({ error: 'No customer email' });
  }

  // Generate report
  let report;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: REPORT_PROMPT(strategy) }],
    });
    const raw = msg.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    report = match ? JSON.parse(match[0]) : null;
  } catch (err) {
    console.error('Report generation error:', err.message);
    report = null;
  }

  if (!report) {
    report = {
      verdict: 'REWORK',
      verdict_color: '#fbbf24',
      verdict_emoji: '🟠',
      executive_summary: 'Report generation encountered a technical error. The VEKTOR team will send a manual report within 24 hours.',
      tests: [{ name: 'All tests', result: 'ERROR', result_color: '#94a3b8', finding: 'Technical error during analysis. Manual review pending.' }],
      what_would_change_verdict: ['Manual review will be completed within 24 hours.'],
      bottom_line: 'A technical error occurred. Your audit will be completed manually.',
    };
  }

  const emailHtml = buildEmail(name, strategy, report);
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Send report to customer
  try {
    await resend.emails.send({
      from: 'VEKTOR Audit <onboarding@resend.dev>',
      to: email,
      subject: `${report.verdict_emoji} Your VEKTOR Strategy Audit — ${report.verdict.replace('_',' ')}`,
      html: emailHtml,
    });
  } catch (err) {
    console.error('Customer email error:', err.message);
  }

  // Notify owner
  try {
    await resend.emails.send({
      from: 'VEKTOR System <onboarding@resend.dev>',
      to: 'laurin85@gmail.com',
      subject: `[VEKTOR] Audit sent to ${email} — ${report.verdict}`,
      html: emailHtml,
    });
  } catch (err) {
    console.error('Owner notify error:', err.message);
  }

  res.json({ received: true });
};
