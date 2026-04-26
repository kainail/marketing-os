# Manus Task — Google Business Profile Optimization

**Task type:** Recurring intelligence task
**Trigger:** First Monday of each month at 11:00am (after CRM hygiene 10am)
**Estimated time:** 30-35 minutes
**Output:** intelligence-db/market/gbp-audit-report.csv
**Feeds into:** AHRI morning brief, monthly report

Context: GBP is the gym's highest-converting free traffic channel. A well-optimized GBP
listing with tracking redirect links, current hours, active photos, and recent posts
generates walk-ins and calls at $0 CPL. This task audits all 9 locations monthly
to catch drift and flag what needs updating.

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/gbp-audit.schema.json`

Also write the payload to disk:
- `logs/gbp-audit-log.json` — full gbp-audit payload
- `intelligence-db/market/gbp-audit-report.csv` — row-level issues (separate from JSON response)

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "gbp-optimization",
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

Open business.google.com.
Confirm you are logged into the account with access to all GBP listings.
If wrong account or listings not visible: STOP. Log error. Exit.

Confirm locations visible: expect 9 Anytime Fitness locations.
If any location is missing from the dashboard: log as MISSING LISTING — flag URGENT.

---

## STEP 1 — PROFILE COMPLETENESS CHECK

For each of the 9 GBP locations, check the following fields:

Business name: Matches "Anytime Fitness [Location Name]"? Y/N
Address: Complete and accurate? Y/N
Phone number: Present and correct? Y/N
Website URL:
  CRITICAL CHECK — Does the website URL use the tracking redirect?
  Expected format: https://[tracking-redirect-domain]/go?utm_source=gbp&utm_medium=organic&utm_content=[location-slug]
  If URL points directly to AF.com or any non-tracked URL: FLAG AS PRIORITY — tracking gap
Business hours: Current and accurate including holiday hours? Y/N
Business description: Present (at least 250 characters)? Y/N
Primary category: "Gym" or "Fitness center"? Y/N
Service area: Listed? Y/N

Photo inventory:
  Cover photo: Recent (< 6 months old)? Y/N
  Interior photos: 3+ present? Y/N
  Equipment photos: Present? Y/N
  Total photo count: X photos

For each field, record: location name, field, status (OK/FLAG), notes

---

## STEP 2 — POSTS AUDIT

For each location, check Google Posts:
  When was the most recent post published?
  
  Flag: No post in the last 14 days
    → "STALE: [location] has no GBP post in [X] days — post freshness affects local ranking"

  Check post content quality for the most recent 3 posts:
    Does each post have a photo? Y/N
    Does each post have a CTA button? Y/N (Book, Sign Up, Learn More, etc.)
    Is the CTA link tracked (uses tracking redirect)? Y/N

---

## STEP 3 — Q&A SECTION

For each location, check the Q&A section:
  Are there any unanswered questions? Count them.
    Flag: Any unanswered question older than 7 days
      → "UNANSWERED Q&A: [location] — [question preview] — [X] days old"

  Are there any business-added Q&As present?
    These are FAQs the business plants proactively (e.g., "What are your hours?")
    If no business-added Q&As present: note as improvement opportunity

  Flag: Any Q&A with a negative or potentially damaging question
    → Flag for Kai to review response

---

## STEP 4 — TRACKING REDIRECT LINK AUDIT

This step verifies tracking coverage across all 9 locations.

For each location, check:
  Website field in GBP: tracked URL? Y/N
  GBP post CTA links (last 3 posts): tracked URL? Y/N
  Google Ads location extension: note if visible

Build tracking coverage table:
  Location | Website tracked | Post CTAs tracked | Overall
  [name]   | Y/N             | Y/N               | full/partial/none

Flag: any location with website URL pointing directly to AF.com
  PRIORITY: Change website URL to tracking redirect immediately — this is a live tracking gap

---

## STEP 5 — WRITE GBP AUDIT REPORT

Write to intelligence-db/market/gbp-audit-report.csv:
Headers: date,location,field,status,notes,priority

One row per issue found (not per location — only log rows where status = FLAG or PRIORITY).

Write summary to logs/gbp-audit-log.json:

```json
{
  "last_updated": "ISO timestamp",
  "month": "YYYY-MM",
  "locations_audited": 9,
  "locations_with_tracked_url": 0,
  "locations_without_tracked_url": 0,
  "locations_with_stale_posts": 0,
  "total_unanswered_questions": 0,
  "total_flags": 0,
  "priority_flags": 0,
  "gbp_health_score": "strong/needs-work/critical",
  "tracking_coverage_percent": 0
}
```

GBP health score:
  strong: all 9 locations have tracked URLs, no stale posts, no unanswered Q&As
  needs-work: 1-3 locations with tracked URL missing OR 3+ stale posts
  critical: 4+ locations without tracked URLs OR any missing listing

---

## STEP 6 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "GBP optimization audit complete.
   Locations audited: 9
   Tracking redirect links active: [X]/9
   Locations missing tracking: [location names or 'none']
   Stale post locations (14+ days): [X]
   Unanswered Q&As: [X] total
   Priority flags: [X]
   GBP health: [strong/needs-work/critical]
   Report saved to intelligence-db/market/gbp-audit-report.csv"

---

## WHAT MANUS NEVER DOES

- Never edits GBP listings directly during this task — read and audit only
- Never posts to GBP, responds to Q&As, or removes photos
- Never edits GBP profile fields — flags issues for Kai to update
- Never engages with reviewer profiles or reviewer Q&As during this task
