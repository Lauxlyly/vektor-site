// Stripe webhook — reliable owner payment notification + safety net.
//
// SECURITY: the webhook payload is UNTRUSTED (anyone can POST to this URL). We do
// NOT act on the posted data. We take only the session id from it and RE-FETCH the
// session from the Stripe API. A forged event carrying a fake/unknown session id
// fails that fetch and is rejected — so forgery is useless. (Full signature
// verification would additionally need the raw request body, which Vercel's JSON
// body parser consumes; the authoritative re-fetch is the actual guarantee here.)
//
// The full report is generated on success.html via /api/generate-report (which also
// verifies payment against Stripe). This webhook fires on every completed payment as
// the owner's guarantee that no sale is missed even if the buyer closes the tab.

const Stripe = require('stripe');
const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body || {};
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true }); // ignore other event types quietly
  }

  const claimedId = event.data && event.data.object && event.data.object.id;
  if (typeof claimedId !== 'string' || !/^cs_[a-zA-Z0-9_]{10,120}$/.test(claimedId)) {
    return res.status(400).json({ error: 'invalid session reference' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY not set — cannot validate webhook');
    return res.json({ received: true });
  }

  // Re-fetch from Stripe (authoritative). Rejects forged / unpaid events.
  let session;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    session = await stripe.checkout.sessions.retrieve(claimedId);
  } catch (err) {
    console.error('Webhook: session re-fetch failed (likely forged):', err.message);
    return res.status(400).json({ error: 'unverifiable session' });
  }
  if (!session || session.mode !== 'payment' || session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'session not paid' });
  }

  const email = (session.customer_details && session.customer_details.email) || 'unknown';
  const name = (session.customer_details && session.customer_details.name) || 'Trader';
  const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : '$99';

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
          <b>Session:</b> <span style="font-family:monospace;font-size:12px;color:#94a3b8;">${session.id}</span>
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
      from: process.env.EMAIL_FROM || 'VEKTOR System <onboarding@resend.dev>',
      to: process.env.OWNER_EMAIL || 'laurin85@gmail.com',
      subject: `[VEKTOR] 💰 Payment ${amount} from ${email}`,
      html,
    });
  } catch (err) {
    console.error('Owner notify error:', err.message);
  }

  res.json({ received: true });
};
