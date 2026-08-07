# LEGAL-NOTES — What the owner must do before relying on these documents

**Read this first.** `TERMS.md` and `PRIVACY.md` are **strong AI-drafted templates — roughly 90% ready**, written to match VEKTOR's actual data flows. They are **not** legal advice and **not** a substitute for a qualified lawyer. This file lists (A) what you must fill in, (B) what a lawyer should review, (C) what changes if you add analytics/cookies, and (D) where to link the documents.

---

## A. Placeholders you (the owner) must fill in

Search both files for `[PLACEHOLDER:` and replace each. The key ones:

| Placeholder | What to enter |
|---|---|
| Legal/business name | Your registered sole-proprietor or company name. |
| Registered address | Publish if required by law or by Stripe/consumer-info rules. |
| Business registry code | Your Estonian registry code, if registered. |
| Contact email | A monitored address for legal, privacy, and refund requests. |
| Effective date / Last updated | The date you publish each document. |
| Refund window (Terms §5.3) | Normally **14** days; confirm. |
| Tax/VAT line (Terms §4.3) | Whether prices are inclusive/exclusive of VAT; VAT/OSS handling. |
| Court (Terms §13.3) | Likely Harju County Court; confirm. |
| ADR lines (Terms §13.4) | Whether you commit to a specific consumer ADR/arbitration body. (The EU ODR platform closed 20 Jul 2025 and has been removed from the Terms — do not re-add it.) Confirm current TTJA / ECC-Net references. |
| Retention values (Privacy §5) | Real periods matching how the system is actually configured. |
| Sub-processor regions (Privacy §6) | Confirmed location/transfer basis for **Supadata** and **Upstash** especially. |
| AKI / court contact details | Verify current details before publishing. |
| Language clause (Terms §14.6) | Whether an Estonian translation exists and which prevails. |

**Also verify these factual claims before publishing:**
- That retention periods in Privacy §5 are *true* — align them with the real Vercel/Upstash/app config. Don't state "deleted within 30 days" if nothing deletes it.
- Each sub-processor's **actual** region and transfer mechanism (see below).
- That you have (or accept) each sub-processor's **DPA** in force: Anthropic, Stripe, Resend, Vercel, Upstash, Supadata.

---

## B. Clauses a lawyer should review before you rely on them

1. **The EU withdrawal/refund waiver (Terms §5) — highest priority.**
   The waiver of the 14-day withdrawal right for immediately-delivered digital content is **only valid if the checkout/start-audit UX actually collects it**. You must implement, before the audit runs:
   - an **unticked-by-default checkbox** with wording equivalent to: *"I request that VEKTOR begin the Full Falsification Review immediately, and I acknowledge that I will lose my right of withdrawal once the report has been generated and delivered."*
   - a **stored record** that the box was ticked (timestamp + purchase email), as evidence.
   If this is not implemented, the withdrawal right is **not** waived and you must honour refunds within the withdrawal window. The Terms are drafted to be conditional on this, but the enforceability rests on the UX.

2. **Financial disclaimer enforceability (Terms §2).** Confirm the "not financial advice / not regulated activity" framing holds for your specific outputs and marketing, and that nothing on the site (copy, testimonials, "GO" language) crosses into regulated investment advice or a financial-promotion regime in the markets you reach.

3. **Limitation of liability & warranty disclaimer (Terms §8–9).** Consumer-protection law limits how far you can cap liability toward consumers. Confirm the cap and the "as is" disclaimer are enforceable in Estonia/EU and don't overreach against mandatory consumer rights.

4. **Consumer-law compliance generally.** Pre-contract information duties, price display, and confirmation-of-contract requirements under Directive 2011/83/EU and Estonian law (e.g. confirmation email/receipt content).

5. **Processor DPAs / SCCs / international transfers (Privacy §6–7).** Have someone confirm the correct, current transfer mechanism for each US/global provider (adequacy vs SCCs vs EU-US Data Privacy Framework certification), and whether Stripe is controller vs processor for which data. Update the tables to match reality.

6. **Tax/VAT (Terms §4.3).** Confirm with an accountant: VAT registration threshold, OSS, whether Stripe Tax is enabled, and how VAT is shown at checkout — especially for cross-border EU B2C digital sales.

7. **Accounting-record retention (Privacy §5).** Confirm the statutory retention period (commonly ~7 years in Estonia) for payment/transaction records.

8. **Governing-law / consumer-forum clause (Terms §13).** Confirm the wording preserves EU consumers' mandatory home-country protections (it is drafted to, but should be checked).

9. **Free-screen lawful basis (Privacy §4).** The free AI screen and link-import are drafted on **legitimate interest** (Art. 6(1)(f)) — a single, non-hedged basis — on the view that the user actively requests the feature and no account/contract exists. A lawyer may prefer to frame it as a requested-service/contract basis instead. Either way, keep it to **one** basis per purpose and ensure a light legitimate-interest assessment (LIA) exists on file if you keep 6(1)(f).

---

## C. What changes if you add analytics or non-essential cookies later

If you add analytics (e.g. Plausible, GA4, PostHog), advertising, or any non-essential cookie/tracker:

1. **Consent banner.** Under the ePrivacy rules, non-essential cookies/trackers need **prior opt-in consent** (banner with a real reject option). Privacy-friendly, cookieless analytics may reduce but not always remove this — check the specific tool.
2. **Update Privacy §8** to name the analytics vendor, what it collects, and its purpose; add it as a **sub-processor** in §6 with its region/transfer basis.
3. **Add/adjust legal basis** — analytics based on consent (Art. 6(1)(a)) rather than legitimate interest, in most EU readings.
4. **Add a cookie table / cookie policy** listing each cookie, its purpose, duration, and provider.
5. **Update retention and transfers** for the new vendor.
6. **Wire consent to behaviour** — don't load the tracker until consent is given, and honour withdrawal.

Until then, the current "no analytics, no tracking cookies, localStorage only" statement must remain **true**.

---

## D. Where to link the documents on the site

Link **both** documents in the **site footer** (persistent) **and** at the **checkout / audit-start flow** — next to the immediate-performance consent checkbox — with a line such as: *"By continuing you agree to our [Terms of Service] and [Privacy Policy]."* Ideally also surface the Privacy note ("your input is sent to AI providers — don't paste secrets") near the strategy input box on the free screen.

---

*Bottom line: these drafts get you most of the way, but the withdrawal-waiver UX (B.1), the sub-processor transfer/retention facts, and the tax/consumer-law items need real confirmation before you publish and rely on them.*
