# Manus Task — Lead Journey Tracker

**Task type:** Recurring intelligence task
**Trigger:** Every Sunday at 10:00pm (before cross-brain sync at 11pm — feeds fresh data into sync)
**Estimated time:** 20-25 minutes
**Output:** intelligence-db/lead-journey/attribution-report.json
**Feeds into:** AHRI weekly-cross-brain-sync, morning brief, monthly report

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/lead-journey.schema.json`

Also write the payload to disk:
- `intelligence-db/lead-journey/attribution-report.json` — full lead-journey payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "lead-journey-tracker",
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

Open GHL.
Confirm you are in the correct location: [test location name]
If wrong location: STOP. Log error. Exit.

---

## STEP 1 — PULL NEW GHL CONTACTS (LAST 7 DAYS)

Open GHL → Contacts
Filter: created in last 7 days
For each contact, record:
  Name, phone, email,
  lead_source (column M in the tracking sheet),
  archetype_detected (column R in the tracking sheet),
  created_date, last_activity,
  current_stage in pipeline

---

## STEP 2 — CHECK JOURNEY LOG

Open intelligence-db/lead-journey/journey-log.json
  (This file is written by the tracking redirect service on every /go click)

For each contact from Step 1:
  Search by email or phone in the journey log
  Did they appear?

  If yes — record their path:
    First touch source (utm_source of first appearance)
    Number of touches before form submit
    Did they return via GBP click, social bio, email link?
    Time between first touch and form submit

  If no — they are unattributed (walked in, direct visit, or clicked a non-tracked link)

---

## STEP 3 — NEW MEMBER MATCHING

In GHL, check contacts tagged as member (or whatever tag marks a signed member).
For contacts who became members this week:
  Were they a prior GHL contact?
    If yes: what was their original lead_source tag?
    If no: walk-in or corporate site signup — mark as unattributed

Build attribution table:
  Source → Leads this week → Members this week
  Facebook ad:    X leads → X members
  Google ad:      X leads → X members
  GBP click:      X leads → X members
  Organic/direct: X leads → X members
  Unattributed:   X members

---

## STEP 4 — CALCULATE TRUE CPL

Read intelligence-db/paid/meta-performance.json for Meta spend this week.
Read intelligence-db/paid/google-performance.json for Google spend this week.

Reported CPL (platform attribution): CPL as reported in Ads Manager
True CPL calculation:
  Total ad spend ÷ (leads with tracked source + members who traced back to ads)
  Note: true CPL is typically lower than reported because some members
  converted through multiple touchpoints or non-tracked paths

---

## STEP 5 — WRITE ATTRIBUTION REPORT

Update intelligence-db/lead-journey/attribution-report.json:

```json
{
  "last_updated": "ISO timestamp",
  "week_of": "YYYY-MM-DD",
  "leads_created": 0,
  "leads_with_journey_data": 0,
  "leads_without_journey_data": 0,
  "tracking_gap_percentage": 0,
  "source_attribution": {
    "facebook": { "leads": 0, "members": 0, "cpl_true": 0 },
    "google":   { "leads": 0, "members": 0, "cpl_true": 0 },
    "gbp":      { "leads": 0, "members": 0 },
    "organic":  { "leads": 0, "members": 0 },
    "unattributed": { "members": 0 }
  },
  "multi_touch_leads": 0,
  "avg_touches_before_conversion": 0,
  "avg_time_first_touch_to_submit": "X days",
  "reported_cpl_meta": 0,
  "reported_cpl_google": 0,
  "true_cpl_blended": 0,
  "tracking_gap_trend": "improving/declining/stable"
}
```

---

## STEP 6 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Lead journey tracking complete.
   New leads this week: [X]
   Journey data captured: [X]%
   Tracking gap: [X]% — [increase/decrease] from last week
   True CPL (including all paths): $[X]
   vs Meta-reported CPL: $[X]
   [X] members traced back to paid ad source"

---

## WHAT MANUS NEVER DOES

- Never edits GHL contacts or pipeline stages during this task — read only
- Never deletes journey log entries
- Never records personal data beyond what is already in GHL
