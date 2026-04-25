# Monthly Campaign Routine

**Schedule:** First Monday of every month at 7:00 AM (automated)
**Trigger:** Automated — no Kai input required. Runs in addition to (not instead of) the weekly content routine.
**Engine:** engine/ahri.ts → handleMonthlyCampaign()
**Script:** npm run monthly-campaign
**Output:** outputs/anytime-fitness/campaigns/[YYYY-MM]-campaign-package.md

---

## Purpose

The first Monday of every month, AHRI reviews the prior month's full performance data, evaluates the active offer, runs the full campaign creative suite for the month ahead, and presents Kai with a complete package: offer recommendation, ad creative, budget math, and avatar recommendation. Kai takes 45 minutes to review and approve. AHRI executes immediately after approval.

This is the highest-leverage session of the month. The offer decision made here shapes every other asset generated until the next first Monday.

---

## Pre-Campaign Reads (run before any generation)

1. `brain-state/current-state.md` — current offer, avatar, hooks, cross-brain insights
2. `performance/asset-log.csv` — every asset generated last month (filter: prior calendar month)
3. `performance/test-results.csv` — all concluded A/B tests from last month — winners and losers
4. `performance/channel-performance.csv` — CPL, ROAS, lead volume by channel for last 30 days
5. `performance/offer-history.csv` — prior offers, their duration, and performance outcome
6. `intelligence-db/cross-brain/archetype-performance.json` — archetype conversion rates this month
7. `intelligence-db/cross-brain/offer-to-ltv.json` — which offers attracted leads with higher LTV
8. `intelligence-db/patterns/winning-patterns.json` — top-performing hooks, formats, CTAs this month
9. `intelligence-db/market/competitor-ads.json` — what competitors ran last month
10. `knowledge-base/fitness/seasonal-calendar.md` — seasonal context for the month ahead

---

## Step 1 — Offer Assessment

Before generating any creative, AHRI evaluates the current offer against the data.

**Evaluation criteria:**

| Criterion | Weight | Source |
|---|---|---|
| Lead volume vs. prior month | 30% | channel-performance.csv |
| Booking rate of leads generated | 25% | cross-brain/archetype-performance.json |
| Cost per booked lead | 20% | channel-performance.csv |
| Offer-to-LTV match | 15% | cross-brain/offer-to-ltv.json |
| Competitor saturation of same offer | 10% | market/competitor-ads.json |

**Output of assessment:**
```
OFFER ASSESSMENT — [Month YYYY]

Current offer: [name]
Running since: [date from offer-history.csv]
Recommendation: KEEP / ADJUST / REPLACE

Rationale (3 bullet points max):
- [data point 1 — specific number]
- [data point 2 — specific number]
- [data point 3 — what changed or what gap competitors have left]

If ADJUST: specify exact adjustment (e.g., "Change price from $1 to $0 for first week — test lower friction")
If REPLACE: specify replacement offer + rationale — run through offer-machine skill before presenting to Kai
```

If offer-machine skill is needed: call it first. Include its output in Step 1 before proceeding.

---

## Step 2 — Hook Writer

Run the hook-writer skill for the month ahead. Generate a full set of hooks for the current (or new) offer.

**Requirements:**
- Minimum 10 hooks per awareness level: L1 (unaware), L2 (problem aware), L3 (solution aware)
- Hooks incorporate winning patterns from last month
- Hooks incorporate current seasonal context
- No hook repeats any hook from the prior month's set (check asset-log.csv)
- A/B variants: Variant A = emotional/identity, Variant B = outcome/practical

Log hook set to performance/asset-log.csv. These hooks feed the ad copy and content calendar.

---

## Step 3 — Ad Copy

Run the ad-copy skill using the month's hook set.

**Generate for each active channel:**

| Channel | Ad types | Awareness levels |
|---|---|---|
| Facebook cold | 3 feed ads (long-form) + 3 feed ads (short-form) | L1–L2 |
| Facebook retargeting | 3 feed ads | L3–L4 |
| Instagram feed | 3 posts (square format) | L2–L3 |
| Instagram Stories | 2 story ads | L3–L4 |
| Google Search | 1 responsive search ad (15 headlines / 4 descriptions) | L4–L5 |

Each ad: 2 variants (A/B). Both variants share a test_id. Both go to pending-review/.

**[BUDGET APPROVAL REQUIRED: see Step 7 for exact amounts]** — creative approval and budget approval are separate. Kai must approve both independently.

---

## Step 4 — Landing Page Copy

Run the landing-page skill. Generate updated landing page copy for the month's offer.

**If offer is unchanged:** Generate an optimization variant only — 1 section rewritten based on top objection from last month's cross-brain data.
**If offer is adjusted or replaced:** Generate a full new landing page: all sections rewritten for the new offer.

Flag for Kai: Landing page copy always requires Kai approval before going live. Note in Section 6 (Waiting for Kai) of the monthly brief.

---

## Step 5 — Email / Nurture Sequence (conditional)

**If offer changed:** Run nurture-sync skill. Generate new 4-message nurture sequence for the new offer.
**If offer unchanged:** Skip this step. The existing nurture sequence (see brain-state script version) remains active.

If run: both variants (A/B) go to pending-review/. Flag for Kai: these require ElevenLabs voice recording for SMS delivery before going live.

---

## Step 6 — Recommended Content Angles

Based on the month's intelligence, generate 5 recommended content angles for the weekly content routines this month. These are not individual pieces — they are the strategic direction each week's calendar should weight.

```
CONTENT ANGLE RECOMMENDATIONS — [Month YYYY]

Week 1 angle: [one sentence — what theme/hook type to lead with]
Week 2 angle: [one sentence]
Week 3 angle: [one sentence]
Week 4 angle: [one sentence]
Wildcard: [one untested angle from hypotheses.json worth trying this month]
```

---

## Step 7 — Budget Math

Every monthly package includes exact budget math. No ranges. No approximations.

```
MONTHLY BUDGET RECOMMENDATION — [Month YYYY]

[BUDGET APPROVAL REQUIRED: $XXX/month]

Channel breakdown:
- Facebook cold audience: $[X]/day × [N] days = $[X] total
  Expected: [N] leads at $[X] CPL
- Facebook retargeting: $[X]/day × [N] days = $[X] total
  Expected: [N] booked leads at $[X] cost/booked lead
- Google Search: $[X]/day × [N] days = $[X] total
  Expected: [N] leads at $[X] CPL
- [Any other channel]: $[X] total

Total monthly budget: $[X]
Expected total leads: [N]
Expected cost per member acquired (at [X]% conversion from lead to member): $[X]
Expected members at this budget: [N] new members

Basis for CPL estimates: [last month's actual CPL / industry benchmark — specify which]

Note: If no channel-performance.csv data exists yet, all estimates use industry benchmarks
from knowledge-base/fitness/gym-industry-context.md. Flag this clearly.
```

---

## Output Package

Combine all 7 steps into one document:

```
# Monthly Campaign Package — [Month YYYY]
# Generated: [ISO timestamp]
# Offer: [offer name]
# Avatar: [primary avatar]

---

## SECTION 1 — OFFER ASSESSMENT
[Step 1 output]

---

## SECTION 2 — HOOK SET
[Step 2 output — all hooks, both variants]

---

## SECTION 3 — AD CREATIVE
[Step 3 output — all ads, all channels, both variants]

---

## SECTION 4 — LANDING PAGE COPY
[Step 4 output — full page or optimization variant]

---

## SECTION 5 — NURTURE SEQUENCE (if applicable)
[Step 5 output — or "Not regenerated — existing nurture-sync v[X] remains active"]

---

## SECTION 6 — CONTENT ANGLE RECOMMENDATIONS
[Step 6 output — 5 weekly angles]

---

## SECTION 7 — BUDGET RECOMMENDATION
[Step 7 output — full budget math]
[BUDGET APPROVAL REQUIRED: $XXX]

---

## WAITING FOR KAI

For each item requiring explicit approval before AHRI can proceed:

- [ ] OFFER: [keep / adjust / replace as specified] — approve or redirect
- [ ] CREATIVE: [N ads across N channels] — approve all or flag specific assets
- [ ] LANDING PAGE: [full rewrite / optimization variant] — approve before AHRI pushes to GHL
- [ ] BUDGET: $[X]/month across [N] channels — approve exact amount
- [ ] NURTURE SEQUENCE: [new sequence / not changed] — if new: ElevenLabs recording required before live
- [ ] AVATAR: [AHRI recommends / no change] — [if recommendation: state which avatar and why]

---

## Log Entry
campaign_id: monthly-campaign-[YYYYMM]-[6-char-random]
```

---

## Session Logging

After generating the package, append to `logs/session-history.json`:

```json
{
  "session": "monthly-campaign",
  "date": "[ISO timestamp]",
  "month": "[YYYY-MM]",
  "output_file": "outputs/anytime-fitness/campaigns/[YYYY-MM]-campaign-package.md",
  "offer_status": "keep | adjust | replace",
  "hooks_generated": N,
  "ads_generated": N,
  "budget_recommended": "$X",
  "nurture_regenerated": true | false,
  "errors": []
}
```

---

## Error Handling

- Missing performance data: generate package using available data, note gaps explicitly in each section, flag in Waiting for Kai as "Data missing — approval may need to be deferred."
- Offer-machine fails: note in Section 1 — "Offer assessment is manual this cycle — check intelligence-db/ manually." Present what data is available.
- Ad copy generation fails: retry once. If second attempt fails, write completed sections and flag: [GENERATION FAILED — AD COPY]. Do not skip other sections.
- Budget math impossible (no CPL data): use gym-industry-context.md benchmarks. State clearly in Section 7: "Estimate based on industry benchmarks — no historical data yet."
- Any compliance flag in generated assets: prefix with [COMPLIANCE FLAG — MONTHLY: description]. Include in Waiting for Kai. Do not suppress.

---

## When to Run Manually

```bash
npm run monthly-campaign
```

Run manually if Kai requests a mid-month offer refresh (e.g., a seasonal event demands an immediate new campaign). The output is timestamped and saved to campaigns/ with the current date. The existing monthly package is not deleted — both are preserved.

---

## Avatar Evaluation (optional monthly step)

After reviewing this month's archetype-performance.json, AHRI may recommend an avatar adjustment if:
- A non-primary archetype shows significantly higher conversion (>2× booking rate)
- The primary avatar's performance has declined for 2+ consecutive months
- A new seasonal window is opening that favors a different avatar profile

If recommending an avatar change, write a brief recommendation at the top of Section 1:

```
[AVATAR CHANGE RECOMMENDATION]
Current: [avatar name]
Recommended: [avatar name]
Reason: [specific data — archetype performance, seasonal signal, offer alignment]
Risk: [what changes if the primary avatar shifts — cross-brain recalibration period]
Kai must approve before any primary avatar change takes effect.
```
