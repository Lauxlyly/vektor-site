# VEKTOR — Independent Crypto Strategy Falsification

Web service that falsifies crypto trading strategies. A user pastes a strategy (or a
link to a reel/video — transcript auto-pulled), gets a free qualitative risk screen, and
can pay $99 for a full Falsification Review. Live: https://vektor-site-xi.vercel.app

## Develop on another computer

```bash
git clone https://github.com/Lauxlyly/vektor-site.git
cd vektor-site
npm install
```

Then, in Claude Code inside the repo, run **`/vektor-dev`** — it pulls the latest,
installs deps, runs the tests, and reports status. (Or run the steps below by hand.)

```bash
npm test                 # security + extract + contrast + page-guardrails
npm run check:publish    # case-study publish gate (blocks until ledger figures pasted)
npm run test:e2e         # Playwright layout checks (needs: npx playwright install)
```

**Secrets are NOT in git** (by design — `.env*` is gitignored). API keys live in Vercel
env: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SUPADATA_API_KEY`,
optional `EMAIL_FROM`, `OWNER_EMAIL`, `UPSTASH_REDIS_REST_URL/_TOKEN`. UI/static work
needs no keys; to run the `api/` functions locally, create a local `.env` with them.

## Deploy

Connected to Vercel — **every `git push origin master` auto-deploys**. No manual step.

## Structure

| Path | What |
|------|------|
| `index.html` | Landing + free quick screen + link import |
| `success.html` | Post-payment full report (on-page + PDF via jsPDF) |
| `sample-report.html`, `case-study.html` | Sample + (gated) case-study page |
| `api/analyze.js` | Free screen (Claude Haiku) |
| `api/extract.js` | Pull transcript/caption from a link (Supadata + OG fallback) |
| `api/generate-report.js` | Stripe-verified $99 report + email |
| `api/webhook.js` | Stripe payment notification (authoritative re-fetch) |
| `lib/` | `report-email.js` (email HTML), `ratelimit.js` (Upstash, fail-open) |
| `scripts/check-publishable.js` | Hard-stop gate for the case-study page |
| `legal/`, `terms.html`, `privacy.html` | ToS + GDPR privacy |
| `test/`, `e2e/` | Node tests + Playwright layout guardrails |
| `GO-LIVE.md` | Go-live checklist (Stripe live, Resend domain) |
| `docs/` | Concierge proxy-tier kit + duo decision |

## Going live

See **`GO-LIVE.md`**. Two owner steps remain: Stripe test→live, and Resend domain
verification (so real customers receive their emailed report).
