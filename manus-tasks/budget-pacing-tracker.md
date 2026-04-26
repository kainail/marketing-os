# Manus Task — Budget Pacing Tracker

**Task type:** Recurring intelligence task
**Trigger:** Every Monday at 8:00am (start of week — set the week up correctly)
**Estimated time:** 15 minutes
**Output:** intelligence-db/paid/pacing-log.json
**Reads first:** knowledge-base/paid-media/thresholds.md
**Feeds into:** AHRI morning brief, monthly executive report

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open Meta Ads Manager and Google Ads.
Confirm both accounts match the test/live accounts for this gym.
If wrong account on either platform: STOP. Log error. Exit.

---

## STEP 1 — CALCULATE PACING TARGETS

Read thresholds.md for monthly budgets:
  Meta monthly budget: $750
  Google monthly budget: $600
  Total monthly: $1,350

Calculate where spending should be today:
  Day of month: [today's date]
  Days in month: [actual days in this month]
  Expected % spent = (day of month ÷ days in month) × 100

Weekly benchmarks from thresholds.md:
  Week 1 (days 1-7):  25% of monthly budget should be spent
  Week 2 (days 8-14): 50% should be spent
  Week 3 (days 15-21): 75% should be spent
  Week 4 (days 22+):  100% should be spent

---

## STEP 2 — CHECK META SPEND PACE

Open Meta Ads Manager.
Set date range: This month (1st of month to today).
Record: total spend month-to-date.

Calculate expected: (day of month ÷ days in month) × $750

Compare actual to expected:
  If actual < expected × 0.90 (more than 10% below):
    Status: UNDERPACING
    Recommendation: "Increase Meta daily budgets by $[X] to get back on pace.
      Currently $[actual] vs $[expected] target."

  If actual > expected × 1.15 (more than 15% above):
    Status: OVERPACING
    Calculate projected month-end: actual ÷ (day/total days)
    Recommendation: "Reduce Meta daily budgets by $[X]. On pace to exhaust
      $750 budget by day [projected day]. Will go dark [X] days before month end."

  If within ±10% of expected:
    Status: ON PACE — no action needed

---

## STEP 3 — CHECK GOOGLE SPEND PACE

Same process for Google Ads.
Monthly target: $600.
Apply same underpacing/overpacing thresholds and logic.

---

## STEP 4 — WRITE PACING REPORT

Update intelligence-db/paid/pacing-log.json:

```json
{
  "last_updated": "ISO timestamp",
  "week_of_month": 1,
  "day_of_month": 0,
  "days_in_month": 30,
  "meta": {
    "monthly_budget": 750,
    "spent_to_date": 0,
    "expected_by_today": 0,
    "variance_dollars": 0,
    "variance_percent": 0,
    "status": "on-pace/underpacing/overpacing",
    "recommendation": "specific action or 'no action needed'"
  },
  "google": {
    "monthly_budget": 600,
    "spent_to_date": 0,
    "expected_by_today": 0,
    "variance_dollars": 0,
    "variance_percent": 0,
    "status": "on-pace/underpacing/overpacing",
    "recommendation": "specific action or 'no action needed'"
  },
  "combined": {
    "total_budget": 1350,
    "total_spent": 0,
    "projected_month_end_spend": 0,
    "status": "on-pace/underpacing/overpacing",
    "action_required": false,
    "action_summary": "string"
  }
}
```

---

## STEP 5 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Budget pacing check complete.
   Meta: [on-pace / underpacing $X / overpacing $X]
   Google: [on-pace / underpacing $X / overpacing $X]
   Combined: [X]% of monthly budget spent — [on track/needs attention]
   Action required: [yes/no — what to do]"

---

## WHAT MANUS NEVER DOES

- Never changes budgets or bids during this task — read only and report
- Never records data from the wrong account
- Never skips account verification
