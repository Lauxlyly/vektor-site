# VEKTOR — Next Step Decision (Builder response to Strategist)

_Date: 2026-08-12 | Builder (Claude) refining Strategist (ChatGPT) | Question: sequence A/B/C/D_

## Verdict on the sequence

**Agree with the spine: A (owner, parallel, now) → D (build now) → B-as-concierge → C (defer).**
The A-vs-B framing was a false choice; A is two owner clicks, not Builder time. D is the single
best Builder step because it is the cheapest possible test of the *only* differentiator (a real
falsification with numbers) using an asset already owned, and it is the conversion asset that
makes "going live at 0 customers" mean something.

I am refining, not overturning. Two refinements below tighten the two live HIGH concerns.

---

## Refinement 1 — D's outward claim is safe ONLY under a strict claim-scope (the same discipline that fixed the 6-fake-tests gap)

The danger in D is not defamation-by-naming (easy to avoid: test a rule *family*, never a person).
The subtler danger is **over-generalization** — the exact class of error VEKTOR just fixed. One
family scoring −0.197%/trade OOS does **not** license "these strategies lose" or "your strategy
will lose." The page must claim *exactly what was tested and no more*:

- **Claim allowed:** "This specific mechanical ruleset, pre-registered, scored X over N sealed
  out-of-sample setups — worse than a random-entry null."
- **Claim forbidden:** any generalization to a named person, to "ICT/SMC" as a whole, to the
  reader's own strategy, or to the future ("will lose").

Concrete guardrails baked into the page (`case-study.html`):
1. Rule **family**, described mechanically ("a popular level-breakout / market-structure ruleset"),
   never a guru's name.
2. The **pre-registered ruleset is shown in full** — so a reader can point at a rule and say "you
   proxied rule 3 wrong." That dispute path is the honesty feature.
3. A visible **"What this is / is NOT"** limitations box: one family, one market/window, a proxy of
   stated rules (not anyone's discretion), OOS-sealed but past ≠ future.
4. Every hard number is marked **`[VERIFY-AGAINST-LEDGER]`** in the draft. The Builder cannot see the
   census ledger from this workspace; the owner pastes the exact pre-registered figures from the
   append-only ledger before publish. We do **not** harden an unverified number into marketing — that
   would recreate the truth gap in the marketing layer.

If the page claims only "falsification of this mechanical proxy," it is the *inverse* of the 6-fake-
tests sin: a real pre-registered test, reported to exactly its own scope. That is on-brand, not a risk.

## Refinement 2 — Concierge-B refund exposure is bounded by decoupling the fee from the result

The Strategist's guardrails (show the ruleset; claim about the disclosed rules, not the user's
strategy; "unfalsifiable as stated" is itself a finding) are correct but insufficient alone. Add the
structural bound:

- **The $99 buys the review, never a promise to disprove.** The proxy run is a *bonus falsification
  attempt* delivered inside the same report — explicitly "best-effort, generous proxy." Pricing must
  never read as "pay $99 and we'll kill your strategy," or a PASS-ish proxy result becomes a refund
  demand ("you failed to disprove it, refund me").
- **Turn the dispute into a re-run, not a refund.** Offer once, free: "Think we proxied a rule wrong?
  Tell us the correction; we re-run once." This converts the "that's not my rules" complaint (the main
  exposure) into engagement and demonstrates the honesty posture live.
- **Human gate stays.** No automated mechanizability detection in v1. Owner judges the checklist,
  hand-writes the ruleset, runs the existing census framework, pastes results. Zero new pipeline.

With fee decoupled from outcome + a free re-run path + the disclosed ruleset, the refund surface is
bounded to "genuinely bad proxy," which the re-run absorbs.

## Vision (C) — defer, agreed

Distraction now. It multiplies input ambiguity (OCR/CV of levels off a screenshot) precisely when the
differentiator is rigor. Text rules are already mechanizable. The one cheap middle path (accept a
screenshot, OCR only user-confirmed text levels, no chart CV) is still scope creep pre-revenue. Revisit
only if real submissions show a chart-only bottleneck.

## Sequence, concretely

| Step | Owner/Builder | Cost | Gate before it |
|------|---------------|------|----------------|
| A — Stripe live + Resend verify | Owner | 2 clicks | none — start now, parallel |
| D — case-study page | Builder | ~½ day + owner pastes ledger figures | none — start now |
| B — concierge proxy tier | Owner (manual) + tiny report wiring | per-order manual run | D published, ≥1 real paid order that meets checklist |
| C — vision input | — | real build | B proven + demand shows a chart-only bottleneck |

## First actions (immediately)

1. **Owner:** Stripe test→live + Resend domain verification (unblocks real emailed reports).
2. **Owner:** open the census ledger, copy the exact pre-registered figures for the level-breakout
   family into the `[VERIFY-AGAINST-LEDGER]` slots in `deliverables/case-study.html`.
3. **Builder (done here):** drafted `case-study.html` (the D page, rule-family framing + limitations
   box + verify-slots) and `concierge-proxy-kit.md` (mechanizability checklist + honest report block).

## Update — Strategist review round 2 (both HIGH concerns closed)

The Strategist caught that the first draft gated the *digits* but not the *prose conclusion*: the
headline badge ("worse than a random entry") and "18 months" were hard-coded while their backing
figures were still placeholders — the same over-claim class the integrity fix targeted. Closed:

1. **Conclusion is now gated too.** Headline badge, the "N months" window (title, H1, body), and the
   null-comparison stat are all verify-slots. Integrity rule #4 in the page requires re-deriving the
   badge from the pasted ledger figures and forbids publishing the "worse than random" claim unless
   the proxy lost to BOTH nulls out-of-sample (else it's the wrong case study — pick another).
2. **Gate is code-enforced, not honor-system.** `check-publishable.sh` / `.ps1` fail publish if any
   `{{VERIFY}}` slot remains — mirroring the census engine's own hard-stop gates. Verified: blocks the
   draft (exit 1), passes a fully-resolved copy (exit 0). A machine sigil (`{{VERIFY}}`, distinct from
   human prose) was needed after the first cut had the gate flag its own documentation.

## Update — round 3 (count settled + last steelman addressed)

- **Slot count settled (auditor flagged 11 vs 12):** the honest figure is **12 lines / 13 occurrences**
  (line 97 carries two slots), verified with `grep -o`. After the provenance addition below: **15**.
- **Closed the "green gate ≠ true number" steelman as far as this workspace allows.** The gate can only
  prove no placeholder remains, not that a pasted figure is correct — that audit belongs to the owner
  against the ledger. To make that audit *recorded* rather than merely instructed, the page footer now
  carries a gated **Provenance** line: ledger run ID + OOS-seal date, transcribed straight from the
  append-only ledger. It is itself `{{VERIFY}}`-gated, so the publish check fails until the owner records
  real provenance. This doesn't prove truth; it forces a public, checkable source-of-record — the honest
  maximum from here. Gate re-verified after the change: draft blocks (exit 1), resolved copy passes (exit 0).

## Residual concerns (HIGH) I could not close from this workspace

- I cannot verify the −0.197% / 1,832-setup figures against the actual ledger from here. They are
  treated as owner-supplied and left as explicit verify-slots. **Publishing before that verification
  would itself be a truth gap.**
- Concierge-B still carries irreducible "generous proxy ≠ your discretion" tension. The kit bounds it;
  it does not eliminate it. First few orders should be reviewed by the owner personally before this is
  advertised on the site (vs. offered ad hoc).
