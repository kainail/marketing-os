# Manus Task — Monthly Executive Report

**Task type:** Recurring intelligence task
**Trigger:** First Monday of each month at 12:00pm (after GBP optimization 11am — reads all intelligence files)
**Estimated time:** 30-40 minutes
**Output:** outputs/anytime-fitness/monthly-reports/YYYY-MM-report.json + YYYY-MM-report.md
**Reads:** All intelligence-db/ files written in the prior month
**Feeds into:** AHRI monthly-report skill, Kai executive review

Context: This is the one monthly artifact that synthesizes everything the system has collected
into a single decision-grade view. It is written for Kai to read in under 10 minutes and
act on within 24 hours. No raw data — only patterns, numbers, and the 3 decisions that
matter most this month.

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: the monthly-report JSON structure defined in STEP 8 of this file.

Also write files to disk:
- `outputs/anytime-fitness/monthly-reports/YYYY-MM-report.json` — structured report
- `outputs/anytime-fitness/monthly-reports/YYYY-MM-report.md` — human-readable brief

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "monthly-report",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {},
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If task cannot run: set `status` to `"failed"` with all errors logged.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Verify all intelligence files are present and were updated in the last 35 days:
  intelligence-db/paid/meta-performance.json — last updated?
  intelligence-db/paid/google-performance.json — last updated?
  intelligence-db/paid/pacing-log.json — last updated?
  intelligence-db/lead-journey/attribution-report.json — last updated?
  intelligence-db/clarity/heatmap-insights.json — last updated?
  intelligence-db/retention/dropout-alerts.json — last updated?
  intelligence-db/nurture/sequence-performance.json — last updated?
  intelligence-db/market/review-log.json — last updated?
  intelligence-db/market/referral-log.json — last updated?
  intelligence-db/market/competitor-offers.json — last updated?
  intelligence-db/crm/crm-hygiene-report.csv — last updated?
  intelligence-db/market/gbp-audit-report.csv — last updated?

If any critical file is missing or stale (not updated in 35+ days):
  Log as WARNING — note in report header that data for [section] may be incomplete
  Continue — do not stop

---

## STEP 1 — ACQUISITION SECTION

Read: intelligence-db/paid/meta-performance.json, google-performance.json, pacing-log.json,
      intelligence-db/lead-journey/attribution-report.json

Compile:
  Total leads this month (all sources)
  Leads by source: Facebook, Google, GBP, organic, referral, unattributed
  Total ad spend this month: Meta + Google
  Reported CPL: Meta, Google
  True blended CPL (from attribution report)
  Number of new members this month
  Cost per new member (total ad spend ÷ new members)
  Best performing ad campaign this month (by CPL)
  Best performing creative this month (if identifiable)
  Tracking gap %: what share of leads have no source attribution

Key question to answer:
  "Was this month's acquisition efficient? Did CPL stay under $30?"
  "Which channel produced the most members, not just the most leads?"

---

## STEP 2 — FUNNEL SECTION

Read: intelligence-db/clarity/heatmap-insights.json,
      intelligence-db/nurture/sequence-performance.json,
      intelligence-db/lead-journey/attribution-report.json

Compile:
  Landing page hero form reach (mobile and desktop)
  Landing page form completion rate
  Top landing page issue from Clarity this month
  Nurture sequence health: strong/needs-work/broken
  Booking trigger message (which step in sequence drives most bookings)
  Weak or dead messages in nurture sequence
  Avg touches before conversion (from attribution report)
  Avg time from first touch to form submit

Key question to answer:
  "Where in the funnel are we losing people?"
  "What one landing page change and one nurture change would have the biggest impact?"

---

## STEP 3 — RETENTION SECTION

Read: intelligence-db/retention/dropout-alerts.json

Compile:
  New members in last 30 days
  Active members (checked in within 7 days) as % of new members
  30-day retention rate
  vs. prior month (if prior month file exists)
  Number of members who went CRITICAL (14+ days inactive) this month
  Were critical members contacted? (check coaching-alerts.csv for follow-up notes)

Key question to answer:
  "Are new members sticking in their first 30 days?"
  "Did our re-engagement outreach this month make a measurable difference?"

---

## STEP 4 — REPUTATION SECTION

Read: intelligence-db/market/review-log.json

Compile:
  Total new reviews this month: Google, Facebook, Yelp
  Star breakdown: 5-star, 4-star, 3-star, 2-star, 1-star
  Overall reputation trend: improving/stable/declining
  Top praise themes (what happy members said most)
  Top complaint themes (what complaints recurred)
  Unresponded negative reviews: were drafts prepared? Did Kai post responses?

Key question to answer:
  "Is our reputation improving?"
  "What operational problem is showing up most in complaints?"

---

## STEP 5 — COMPETITIVE SECTION

Read: intelligence-db/market/competitor-offers.json,
      intelligence-db/market/referral-log.json

Compile:
  Competitor pricing updates this month (any changes vs. last month)
  Competitor promotions active right now (join fee waivers, free weeks, etc.)
  Our referral program health: strong/moderate/weak
  Referrals received this month
  Top referrers (VIPs with 3+ referrals in 90 days)

Key question to answer:
  "Are competitors undercutting us? Do we need to adjust our offer?"
  "Is our referral program producing meaningful volume?"

---

## STEP 6 — INFRASTRUCTURE SECTION

Read: intelligence-db/market/gbp-audit-report.csv,
      logs/crm-hygiene-log.json

Compile:
  GBP health score: strong/needs-work/critical
  Locations with tracking redirect URLs: X/9
  CRM health score: clean/needs-work/critical
  Outstanding CRM issues: untagged leads, duplicates, pipeline blockages

---

## STEP 7 — TOP 3 DECISIONS

Based on all sections above, identify the 3 most important actions for Kai this month.
These must be specific and immediately actionable — not vague recommendations.

Format:
  Decision 1: [specific action] — [why it's the top priority right now]
  Decision 2: [specific action] — [what signal triggered it]
  Decision 3: [specific action] — [estimated impact]

Selection logic:
  Any CRITICAL retention alert with no follow-up logged → retention action first
  CPL over $60 or tracking gap over 40% → acquisition/attribution action
  Competitor price drop or VIP referrer unthanked → retention of members
  GBP tracking gap on 3+ locations → infrastructure action
  Nurture sequence dead message with < 5% reply rate → funnel action

---

## STEP 8 — WRITE REPORT FILES

Determine the report month: YYYY-MM from the date the task runs.
Create directory if needed: outputs/anytime-fitness/monthly-reports/

Write intelligence-db summary: outputs/anytime-fitness/monthly-reports/YYYY-MM-report.json

```json
{
  "report_month": "YYYY-MM",
  "generated_at": "ISO timestamp",
  "acquisition": {
    "total_leads": 0,
    "total_new_members": 0,
    "total_ad_spend": 0,
    "true_blended_cpl": 0,
    "cost_per_member": 0,
    "best_channel": "facebook|google|gbp|referral",
    "tracking_gap_pct": 0
  },
  "funnel": {
    "landing_page_form_reach_mobile": 0,
    "form_completion_rate": 0,
    "nurture_health": "strong|needs-work|broken",
    "booking_trigger_message": 0,
    "avg_touches_before_conversion": 0
  },
  "retention": {
    "new_members_30d": 0,
    "retention_rate_30d": 0,
    "critical_members_this_month": 0,
    "vs_last_month": "improving|stable|declining"
  },
  "reputation": {
    "total_new_reviews": 0,
    "trend": "improving|stable|declining",
    "top_praise_theme": "theme",
    "top_complaint_theme": "theme"
  },
  "competitive": {
    "competitor_price_changes": false,
    "referral_program_health": "strong|moderate|weak",
    "referrals_this_month": 0
  },
  "infrastructure": {
    "gbp_health": "strong|needs-work|critical",
    "gbp_tracking_coverage": 0,
    "crm_health": "clean|needs-work|critical"
  },
  "top_3_decisions": [
    { "priority": 1, "action": "...", "reason": "..." },
    { "priority": 2, "action": "...", "reason": "..." },
    { "priority": 3, "action": "...", "reason": "..." }
  ]
}
```

Write human-readable: outputs/anytime-fitness/monthly-reports/YYYY-MM-report.md

Format as a one-page brief:
  ## [Month] Executive Brief
  **Generated:** [date]

  ### Acquisition
  [3-4 sentences: spend, CPL, members, best channel]

  ### Funnel
  [2-3 sentences: landing page, nurture health, conversion path]

  ### Retention
  [2-3 sentences: 30-day rate, critical alerts, trend]

  ### Reputation
  [2-3 sentences: new reviews, trend, top complaint]

  ### Competitive
  [2-3 sentences: any price changes, referral health]

  ### Infrastructure
  [1-2 sentences: GBP and CRM status]

  ### Top 3 Decisions This Month
  1. [Decision 1]
  2. [Decision 2]
  3. [Decision 3]

---

## STEP 9 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Monthly report complete — [YYYY-MM]
   Acquisition: [X] leads, [X] members, $[X] true CPL
   Retention: [X]% 30-day retention ([improving/stable/declining])
   Reputation: [X] new reviews ([improving/stable/declining])
   Nurture health: [strong/needs-work/broken]
   GBP tracking: [X]/9 locations covered
   Top decision: [Decision 1 summary]
   Report saved to outputs/anytime-fitness/monthly-reports/[YYYY-MM]-report.md"

---

## WHAT MANUS NEVER DOES

- Never sends the report to anyone — writes files only, Kai reviews and distributes
- Never makes budget decisions — flags options and thresholds, Kai decides
- Never edits intelligence source files when writing this report — read only from all sources
- Never deletes prior monthly reports — archive only, append never overwrite
