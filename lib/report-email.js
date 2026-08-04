// Shared email HTML builder for the VEKTOR full audit report.
// Used by api/generate-report.js (customer + owner copy on payment).

function buildEmail(strategy, report, auditId) {
  const testRows = (report.tests || []).map(t => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;font-size:13px;color:#cbd5e1;font-weight:600;">${t.name}</td>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;white-space:nowrap;">
        <span style="background:${t.result_color}18;border:1px solid ${t.result_color}44;color:${t.result_color};font-family:monospace;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:4px;">${t.result}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #0f0f20;font-size:13px;color:#94a3b8;line-height:1.6;">${t.finding}</td>
    </tr>`).join('');

  const changeItems = (report.what_would_change_verdict || []).map(item =>
    `<li style="margin-bottom:8px;color:#94a3b8;font-size:13px;line-height:1.6;">${item}</li>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#050508;">
<div style="max-width:660px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:36px;">
    <div>
      <div style="font-family:monospace;font-size:14px;font-weight:800;letter-spacing:4px;color:#a78bfa;">VEKTOR</div>
      <div style="font-family:monospace;font-size:11px;color:#374151;margin-top:3px;">Independent Strategy Falsification</div>
    </div>
    <div style="text-align:right;font-family:monospace;font-size:10px;color:#374151;">
      <div style="color:#7c3aed;font-weight:700;">AUDIT #${auditId}</div>
      <div>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
  </div>

  <div style="background:${report.verdict_color}10;border:2px solid ${report.verdict_color}40;border-radius:12px;padding:24px 24px;margin-bottom:24px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">${report.verdict_emoji}</div>
    <div style="font-family:monospace;font-size:26px;font-weight:900;letter-spacing:4px;color:${report.verdict_color};margin-bottom:12px;">${report.verdict.replace(/_/g,' ')}</div>
    <div style="font-size:14px;color:#cbd5e1;line-height:1.7;max-width:480px;margin:0 auto;">${report.executive_summary}</div>
  </div>

  <div style="background:#080812;border:1px solid #1a1a2e;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#374151;margin-bottom:6px;">Strategy submitted</div>
    <div style="font-size:13px;color:#4b5563;line-height:1.65;">${strategy}</div>
  </div>

  <div style="background:#0a0a16;border:1px solid rgba(124,58,237,.2);border-radius:12px;overflow:hidden;margin-bottom:24px;">
    <div style="padding:16px 20px;background:rgba(124,58,237,.07);border-bottom:1px solid rgba(124,58,237,.12);">
      <span style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c3aed;">Test Results · 6 Independent Tests</span>
    </div>
    <table style="width:100%;border-collapse:collapse;"><tbody>${testRows}</tbody></table>
  </div>

  <div style="background:#0a0a16;border:1px solid rgba(124,58,237,.2);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c3aed;margin-bottom:14px;">What Would Change This Verdict</div>
    <ul style="padding-left:20px;margin:0;">${changeItems}</ul>
  </div>

  <div style="background:#060610;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:32px;">
    <div style="font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#4c1d95;margin-bottom:6px;">Bottom Line</div>
    <div style="font-size:15px;color:#e2e8f0;font-weight:600;line-height:1.6;">${report.bottom_line}</div>
  </div>

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

module.exports = { buildEmail };
