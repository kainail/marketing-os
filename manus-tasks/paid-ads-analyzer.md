# Manus Task — Meta Ads Performance Analyzer

**Task type:** Recurring intelligence task
**Trigger:** Every Wednesday at 8:00am
**Estimated time:** 25-35 minutes
**Output:** intelligence-db/paid/meta-performance.json
**Reads first:** knowledge-base/paid-media/thresholds.md, knowledge-base/paid-media/creative-framework.md
**Feeds into:** AHRI paid-ads decisions, morning brief, monthly executive report

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open Meta Business Manager or Meta Ads Manager.
Confirm the account name matches: [TEST Meta Ads account name]

If wrong account: STOP immediately.
Log to logs/errors.csv: "wrong account active — paid-ads-analyzer aborted."
Do not view or record data from the wrong account.

---

## STEP 1 — OPEN ADS MANAGER

Navigate to: business.facebook.com/adsmanager
Wait for dashboard to fully load.
Set date range: Last 7 days
Set columns to include: Amount spent, Impressions, Reach, Results,
  Cost per result, CTR (link click-through rate), Link clicks, CPM,
  Frequency, Video plays, 3-second video views, Video average play time,
  Post engagement, Saves

---

## STEP 2 — CAMPAIGN-LEVEL REVIEW

For each active campaign, record:
  campaign name, objective, status, total spend last 7 days,
  total results (leads/conversions), overall CPL this week

Compare CPL to knowledge-base/paid-media/thresholds.md:
  CPL ≤ $20:      DOUBLE DOWN signal — flag immediately
  CPL $20–$30:    SCALE signal — flag for budget increase
  CPL $30–$60:    WATCH ZONE — note, monitor
  CPL > $60:      KILL signal — flag for immediate review
  (Only apply these signals after $30 minimum spend is met)

---

## STEP 3 — AD SET LEVEL REVIEW

For each ad set within active campaigns, record:
  ad set name, audience, budget, spend, CPL, CTR, frequency, reach

Apply logic from thresholds.md:

  If frequency > 3.5:
    Flag: CREATIVE FATIGUE — kill regardless of CPL
    Recommendation: "Pause [ad set]. Frequency [X] exceeds 3.5 threshold.
      Replace creative before reactivating."

  If CPL > $60 AND spend > $30:
    Flag: KILL SIGNAL
    Recommendation: "Pause [ad set name]. CPL $[X] exceeds $60 kill threshold
      after $[spend] spent. Not recoverable with current creative."

  If CPL ≤ $30:
    Flag: SCALE SIGNAL
    Recommendation: "Increase [ad set] budget from $[X] to $[X × 1.2]/day.
      CPL $[X] — at or below $30 target."

  If CPL ≤ $20:
    Flag: DOUBLE DOWN SIGNAL
    Recommendation: "Increase [ad set] budget from $[X] to $[X × 1.4]/day.
      CPL $[X] — significantly below target.
      Flag for Kai approval if increase > $50/day."

---

## STEP 4 — CREATIVE-LEVEL REVIEW

For each active ad, record:
  ad name, format (image/video/carousel), hook (first line of copy),
  thumbstop rate (3-second views ÷ impressions), video retention
  milestones if video, CTR, CPL, spend

Apply creative framework from knowledge-base/paid-media/creative-framework.md:

  Thumbstop < 20%:
    Flag: WEAK HOOK — kill or refilm opening
  Thumbstop > 40%:
    Flag: STRONG HOOK — protect this creative

  For video ads:
    If > 80% drop-off before 3 seconds:
      Flag: FIRST FRAME WRONG — refilm opening
    If > 80% drop-off between 3-8 seconds:
      Flag: HOOK LANDED — BODY COPY FAILING
    If strong retention past 15 seconds:
      Flag: HIGH INTENT VIEWERS — optimize for conversion

  If two ads run same audience:
    Compare CPL — if 25%+ difference:
      Declare winner: lower CPL ad
      Recommendation: "Pause [losing ad]. [winning ad] outperforms by [X]%
        after $[spend] combined. Winner threshold met."

---

## STEP 5 — A/B TEST STATUS

Identify any active split tests.
For each test:
  Have both variants met $30 minimum spend?
    If no: "Test inconclusive — need more spend"
    If yes: compare CPL — declare winner if 25%+ diff; tie if within 10%

---

## STEP 6 — WRITE INTELLIGENCE FILE

Update intelligence-db/paid/meta-performance.json:

```json
{
  "last_updated": "ISO timestamp",
  "date_range": "last 7 days",
  "account": "test/live",
  "campaigns": [
    {
      "name": "campaign name",
      "objective": "lead_generation",
      "spend_7d": 0,
      "cpl_7d": 0,
      "status_signal": "kill/watch/scale/double-down",
      "recommendation": "specific action"
    }
  ],
  "ad_sets": [
    {
      "name": "ad set name",
      "spend": 0,
      "cpl": 0,
      "frequency": 0,
      "status_signal": "kill/watch/scale/double-down/fatigue",
      "recommendation": "specific action"
    }
  ],
  "creatives": [
    {
      "name": "ad name",
      "format": "image/video/carousel",
      "thumbstop_rate": 0,
      "cpl": 0,
      "spend": 0,
      "hook_status": "weak/acceptable/strong",
      "recommendation": "specific action"
    }
  ],
  "ab_tests": [
    {
      "test_id": "identifier",
      "variant_a_cpl": 0,
      "variant_b_cpl": 0,
      "status": "inconclusive/winner-a/winner-b/tie"
    }
  ],
  "top_performer": {
    "ad_name": "name",
    "cpl": 0,
    "why": "what makes it work"
  },
  "weekly_summary": {
    "total_spend": 0,
    "total_leads": 0,
    "blended_cpl": 0,
    "vs_target": "above/at/below $30 target",
    "recommendation_for_ahri": "one sentence"
  }
}
```

---

## STEP 7 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Meta Ads Analysis complete.
   Blended CPL: $[X] ([above/at/below] $30 target)
   Kill signals: [count] ad sets
   Scale signals: [count] ad sets
   Top performer: [ad name] at $[CPL]
   Action needed: [most urgent recommendation]"

---

## IF ANY STEP FAILS

Log to logs/errors.csv with specific error.
Continue with remaining steps.
Never leave without completing the JSON write — use empty arrays if data unavailable.

---

## WHAT MANUS NEVER DOES

- Never pauses, changes budgets, or edits any ad during this task — read only
- Never records data from the wrong account
- Never makes budget decisions — flags them for Kai
- Never skips account verification
