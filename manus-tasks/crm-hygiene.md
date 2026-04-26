# Manus Task — CRM Hygiene

**Task type:** Recurring intelligence task
**Trigger:** First Monday of each month at 10:00am (after budget pacing 8am and review monitoring 9am)
**Estimated time:** 25-30 minutes
**Output:** intelligence-db/crm/crm-hygiene-report.csv + logs/crm-hygiene-log.json
**Feeds into:** AHRI morning brief, monthly report

Context: A clean CRM is a high-performing CRM. Untagged leads, stale contacts, and
duplicate records silently corrupt attribution data and inflate GHL workflows with dead
weight. This task runs once per month to catch drift before it compounds.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open GHL.
Confirm location: [test location name]
If wrong location: STOP. Log error. Exit.

---

## STEP 1 — FIND UNTAGGED LEADS

Open GHL → Contacts
Filter: no tags applied, created in last 30 days

For each untagged contact:
  Record: name, phone, email, created date, lead source (if visible in notes), current pipeline stage

  Attempt to infer lead source from:
    - Notes or conversation history ("came from Facebook ad", "walked in", etc.)
    - Pipeline stage (e.g., if in "Facebook Leads" pipeline, source = facebook)
    - Referral name mentioned in notes

  Classification outcome:
    INFERABLE — lead source identified from context (note the source)
    UNINFERABLE — no context available (flag for Kai to review)

Output: list of untagged contacts with inferred source where available

---

## STEP 2 — FIND INACTIVE LEADS (30+ DAYS)

Filter GHL Contacts: last activity more than 30 days ago, NOT tagged as member, NOT tagged as lost/dead

For each inactive lead:
  Record: name, last activity date, days inactive, current pipeline stage, original lead source tag
  
  Stage-specific logic:
    In "New Lead" stage for 30+ days: likely forgot or slipped — recommend re-engagement
    In "Appointment Set" stage for 30+ days: likely no-show — recommend rebooking outreach
    In "Trial" stage for 30+ days: likely ghosted after trial — recommend final check-in
    In any stage 60+ days: recommend marking LOST and archiving

  Do NOT move, tag, or modify any contact during this step — read only

Output: count by category (30-day inactive, 60-day inactive), list of names and stages

---

## STEP 3 — FIND DUPLICATE CONTACTS

Search GHL for duplicate indicators:
  Same phone number appearing on two different contacts
  Same email appearing on two different contacts
  Same first + last name with similar phone (may be same person re-entered)

For each suspected duplicate pair:
  Record: both contact IDs, names, phones, emails, created dates, tags, pipeline stages

  Note which record appears to be the primary (more tags, more activity, older)
  Note which appears to be the duplicate (newer, fewer tags, less activity)

  Do NOT merge or delete — flag for Kai to review and confirm before merging

Output: list of suspected duplicate pairs with primary and duplicate identified

---

## STEP 4 — PIPELINE AUDIT

Review each active pipeline stage in GHL:
  Count contacts in each stage
  Flag: any stage with 10+ contacts and no movement in 14 days
    → "Pipeline stage [X] has [N] contacts with no movement in 14 days — possible blockage"

  Check for contacts in contradictory stages:
    Tagged as member but still in "Trial" stage (should be moved to Members pipeline)
    Tagged as lost but still in active pipeline
    Untagged contacts in late-stage pipeline (Appointment Set, Trial)

Output: per-stage count, flagged blockages, contradictions list

---

## STEP 5 — WRITE CRM HYGIENE REPORT

Write to intelligence-db/crm/crm-hygiene-report.csv:
Headers: date,category,contact_name,phone,email,created_date,days_inactive,pipeline_stage,issue,recommended_action

One row per flagged contact:
  category: untagged | inactive_30d | inactive_60d | duplicate | pipeline_contradiction
  issue: brief description of the problem
  recommended_action: specific action for Kai or Jessica

Write summary to logs/crm-hygiene-log.json:

```json
{
  "last_updated": "ISO timestamp",
  "month": "YYYY-MM",
  "untagged_leads": 0,
  "untagged_inferable": 0,
  "untagged_uninferable": 0,
  "inactive_30d": 0,
  "inactive_60d": 0,
  "duplicate_pairs": 0,
  "pipeline_blockages": 0,
  "pipeline_contradictions": 0,
  "total_flagged": 0,
  "estimated_clean_contacts": 0,
  "crm_health_score": "clean/needs-work/critical"
}
```

CRM health score:
  clean: fewer than 5 total flags
  needs-work: 5-20 flags
  critical: 20+ flags or any duplicate pairs

---

## STEP 6 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "CRM hygiene complete.
   Untagged leads: [X] ([X] inferable / [X] uninferable)
   Inactive 30d: [X] contacts
   Inactive 60d: [X] contacts — recommend marking lost
   Duplicate pairs found: [X] — flagged for Kai review
   Pipeline blockages: [X]
   Total flagged: [X]
   CRM health: [clean/needs-work/critical]
   Report saved to intelligence-db/crm/crm-hygiene-report.csv"

---

## WHAT MANUS NEVER DOES

- Never merges, deletes, or modifies any GHL contact during this task — read only
- Never tags or re-tags contacts
- Never moves contacts between pipeline stages
- Never removes duplicate contacts — flagging only, Kai confirms before any merge
