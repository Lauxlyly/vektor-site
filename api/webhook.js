// Stripe webhook — reliable payment notification + safety net.
//
// The full report is generated on success.html via /api/generate-report,
// which has the strategy (from the buyer's browser) and emails a copy.
// This webhook fires on EVERY completed payment regardless of whether the
// buyer reached success.html, so it's the owner's guarantee that no sale is
// missed. If a buyer closes the tab before the report renders, the owner
// sees this notification and can follow up manually.

const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body || {};
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data && event.data.object ? event.data.object : {};
  const email = (session.customer_details && session.customer_details.email) || 'unknown';
  const name = (session.customer_details && session.customer_details.name) || 'Trader';
  const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : '$99';
  const sessionId = session.id || 'unknown';

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set — cannot notify owner');
    return res.json({ received: true });
  }

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#050508;color:#e2e8f0;padding:32px;">
    <div style="max-width:520px;margin:0 auto;">
      <div style="font-family:monospace;font-size:13px;font-weight:800;letter-spacing:4px;color:#a78bfa;margin-bottom:20px;">VEKTOR · PAYMENT</div>
      <div style="background:#0a0a16;border:1px solid rgba(74,222,128,.25);border-radius:12px;padding:22px;">
        <div style="font-size:22px;font-weight:800;color:#4ade80;margin-bottom:14px;">💰 New audit purchased — ${amount}</div>
        <div style="font-size:14px;color:#cbd5e1;line-height:1.9;">
          <b>Customer:</b> ${name}<br>
          <b>Email:</b> ${email}<br>
          <b>Session:</b> <span style="font-family:monospace;font-size:12px;color:#94a3b8;">${sessionId}</span>
        </div>
      </div>
      <div style="font-size:12px;color:#64748b;line-height:1.7;margin-top:18px;">
        The full report is generated + emailed automatically when the buyer lands on the success page.
        If this customer did <b>not</b> receive their report (they closed the tab early), reach out to
        ${email} and generate one manually.
      </div>
    </div>
  </body></html>`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'VEKTOR System <onboarding@resend.dev>',
      to: 'laurin85@gmail.com',
      subject: `[VEKTOR] 💰 Payment ${amount} from ${email}`,
      html,
    });
  } catch (err) {
    console.error('Owner notify error:', err.message);
  }

  res.json({ received: true });
};
