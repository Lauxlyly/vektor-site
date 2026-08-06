# VEKTOR — Go-Live Checklist

Everything the site needs to accept real payments and deliver reports.
Live URL: https://vektor-site-xi.vercel.app · Repo: Lauxlyly/vektor-site

---

## 1. Vercel environment variables

Vercel → vektor-site → Settings → Environment Variables. After adding/changing, **redeploy**.

| Variable | Needed for | Notes |
|----------|-----------|-------|
| `ANTHROPIC_API_KEY` | free screen + full report | should already be set |
| `STRIPE_SECRET_KEY` | payment verification + webhook | **use `sk_live_...` for real money** (not `sk_test_`) |
| `RESEND_API_KEY` | emails | should already be set |
| `EMAIL_FROM` | email sender | e.g. `VEKTOR <audit@yourdomain.com>` — must be a **verified Resend domain** or customers get nothing |
| `OWNER_EMAIL` | payment/report copy to you | defaults to laurin85@gmail.com |
| `SUPADATA_API_KEY` | video/reel transcripts | should already be set |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | rate limiting (optional) | free Upstash Redis DB; without it, limiter is a no-op |

---

## 2. Stripe: switch test → live  🔴 REQUIRED

1. Toggle Stripe dashboard to **Live mode**.
2. Create the **$99 Payment Link** in live mode.
3. Payment Link → **After payment → Redirect** to:
   `https://vektor-site-xi.vercel.app/success?session_id={CHECKOUT_SESSION_ID}`
4. Remove any custom fields (strategy carries through localStorage, not Stripe).
5. Developers → **Webhooks** → add endpoint (live mode):
   `https://vektor-site-xi.vercel.app/api/webhook` · event `checkout.session.completed`
6. Put the **live** `sk_live_...` into `STRIPE_SECRET_KEY` in Vercel.
7. Edit `index.html` (marked `GO-LIVE:` comment, ~line 477) — replace the test
   Payment Link with the **live** one. Commit + push.

---

## 3. Resend: verify a sending domain  🔴 REQUIRED for customer emails

Without a verified domain, Resend's shared `onboarding@resend.dev` only delivers to
your own Resend account address — **real customers won't receive their emailed report.**

> The on-page report on `/success` is delivered regardless (and is downloadable as PDF),
> so email is a backup — but the page promises an email, so verify the domain before launch.

1. Resend → Domains → add + verify your domain (DNS records).
2. Set `EMAIL_FROM` in Vercel to an address on that domain, e.g. `VEKTOR <audit@yourdomain.com>`.

---

## 4. Optional / nice-to-have

- **Rate limiting:** create a free Upstash Redis DB → add the two `UPSTASH_*` env vars.
  Closes the cost-DoS vector (someone scripting the free screen to burn API budget).
- **Custom domain:** point e.g. `vektor.io` at Vercel. Share links + `SITE_URL` are
  currently hardcoded to `vektor-site-xi.vercel.app` (index.html + success.html) — update if you switch.
- **Refund/terms page:** the site advertises a 30-day money-back guarantee; a short terms page is worth adding.

---

## 5. Smoke test after going live

1. Run a real $99 purchase (or a live-mode test card if enabled).
2. Confirm redirect to `/success`, the report renders, PDF downloads clean.
3. Confirm the customer email arrives (checks domain verification).
4. Confirm the owner payment notification arrives.

`npm test` runs the security + extract suites locally before each push.
