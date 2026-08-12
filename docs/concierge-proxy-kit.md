# Concierge Proxy Tier (B) — Minimal Viable Kit

_Reuses the existing census framework. No detection ML, no new pipeline. Human-gated._

The proxy tier is a **bonus falsification attempt** delivered inside an existing $99 Falsification
Review. The owner (human) judges mechanizability, hand-writes the ruleset, runs the census framework
already built for the crypto-bot project, and pastes the result block below into the report.

**Golden rule: the $99 buys the review. It never buys a promise to disprove.** The proxy is best-effort.
Never let pricing read as "pay and we'll kill your strategy" — a not-negative proxy result must not
become a refund demand.

---

## Step 1 — Mechanizability gate (owner judges; ALL THREE must hold)

Offer the proxy run **only if** every box is checkable from the submission's *stated* rules:

- [ ] **Entry is stateable** as a condition on price/indicator/level
      (e.g. "1H closes above the marked 4H swing high"). Not "when it looks clean."
- [ ] **Exit AND stop are stateable** and non-discretionary
      (fixed R, level reclaim, ATR, time-box — anything codeable).
- [ ] **No load-bearing undisclosed discretion.** If the edge secretly lives in "I only take the good
      ones," that is not a blocker — it is the finding: *unfalsifiable as stated.*

If entry/exit/stop are all codeable → **offer the proxy.**
If not → deliver the normal qualitative review; the honest note is that the strategy is
*unfalsifiable as stated* (a real, sellable answer), and invite the user to state the missing rule.

## Step 2 — Write the generous proxy (favor the user)

- Fill every underspecified parameter in the direction **most favorable to the strategy** (generous
  proxy). If a range is plausible, test the favorable end; if it still loses, the finding is robust.
- Pre-register the ruleset + pass bar **before** touching out-of-sample data. Log it to the ledger.
- Reuse the census defaults: in-sample fit → sealed OOS, dual-null (random-time + wrong-sign),
  walk-forward, triple-cost. Do not invent new methodology per order.

## Step 3 — Run + record

- Run the census framework on the mechanized ruleset over the standard universe/window.
- Capture: net expectancy/trade, N OOS setups, both null comparisons, OOS window count.
- Append to the ledger (append-only; never edit a prior pre-registration).

## Step 4 — Paste this block into the report

> ### Empirical falsification (bonus — generous proxy of your stated rules)
>
> We were able to mechanize your stated rules, so instead of stopping at a qualitative read we ran a
> real test. **We tested a generous proxy of your *stated* rules — not your personal discretion.**
> Here is the exact ruleset we ran:
>
> ```
> ENTRY:  <...>
> STOP:   <...>
> EXIT:   <...>
> UNIVERSE / WINDOW: <...>
> COSTS:  triple-cost (fees + slippage + spread)
> NULLS:  random-time entry; wrong-sign entry (must beat both)
> SPLIT:  in-sample fit → sealed out-of-sample scoring
> ```
>
> **Result (out-of-sample, sealed):** net expectancy **<X>%/trade** over **<N>** setups;
> vs random-entry null: **<better/worse>**; vs wrong-sign null: **<better/worse>**.
>
> **What this means — and does not.** This is a falsification of *this mechanical proxy of your stated
> rules*, over this universe and window. It is **not** a claim that your strategy will lose, **not** a
> claim about your live discretion or risk management, and **not** a prediction. If your actual rules
> differ from the proxy above, tell us where — **we will re-run once, free.**

## Liability guardrails (non-negotiable)

1. **Fee decoupled from result.** The review is paid for regardless of whether the proxy runs or what
   it returns. State this at checkout and in the report.
2. **Claim scope = the disclosed ruleset only.** Never "your strategy loses." Always "this proxy of
   your stated rules scored X."
3. **Free single re-run** on a disputed rule. This converts the main exposure ("that's not my rules")
   into engagement and demonstrates the honesty posture live.
4. **Show the ruleset in full**, every time. The user's ability to point at a wrong rule is the honesty
   feature, not a liability.
5. **Owner reviews the first N proxy orders personally** before this is advertised as a standing site
   feature (vs. offered ad hoc). Prove the framing survives contact with paying users first.
6. **No automated mechanizability detection in v1.** Human gate only. Automate only after enough manual
   runs reveal a stable pattern worth encoding.
