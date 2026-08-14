---
description: Sync vektor-site for development — pull, install deps, run tests, report status
---

Get this vektor-site checkout ready to develop on. Do setup only — do NOT change code or push.

1. `git status` — note the branch and whether the working tree is clean or has local changes.
2. `git pull origin master` — get the latest from GitHub.
3. `npm install` — sync dependencies to package-lock.
4. `npm test` — run the suite (security + extract + contrast + page-guardrails); report pass/fail per suite.
5. `npm run check:publish` — report whether case-study.html is publishable (it will BLOCK until the owner pastes real ledger figures — that is expected, not an error).

Then give a short status summary:
- current branch + last commit line
- test results
- anything needing attention: uncommitted changes, failing tests, or notes from GO-LIVE.md / docs/ that are still pending (Stripe live, Resend domain, {{VERIFY}} slots).

Note: API keys are NOT in git (they live in Vercel env). Local API functions won't run without a local `.env` — but UI/static development needs no keys.
