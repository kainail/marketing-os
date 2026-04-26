# Manus Task — Clarity Landing Page Analyzer

**Task type:** Recurring intelligence task
**Trigger:** Every Wednesday at 10:00am (after paid ads analysis — correlates ad performance with page behavior)
**Estimated time:** 20 minutes
**Output:** intelligence-db/clarity/heatmap-insights.json
**Reads first:** knowledge-base/paid-media/thresholds.md (for context on traffic sources)
**Feeds into:** AHRI landing-page skill, morning brief, monthly report

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/clarity-insights.schema.json`

Also write the payload to disk:
- `intelligence-db/clarity/heatmap-insights.json` — full clarity-insights payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "clarity-analyzer",
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

Open: clarity.microsoft.com
Confirm you are viewing the correct project: [landing page project name]
If wrong project: STOP. Log error. Exit.

---

## STEP 1 — SCROLL DEPTH ANALYSIS

Navigate to: Clarity → Heatmaps → Scroll
Set date range: Last 7 days
Check Mobile and Desktop separately

For each device type, record:
  % of visitors who reach the hero section: X%
  % who reach the first form (hero form): X%
  % who reach the testimonials section: X%
  % who reach the bottom CTA form: X%
  The "scroll depth cliff" — where does the biggest % drop occur?

Flag: If fewer than 40% of visitors reach the first form
  → "Hero section is not compelling enough — headline or photo not hooking"

Flag: If fewer than 20% reach the bottom CTA
  → "Page is too long OR mid-page is losing them at [cliff section]"

---

## STEP 2 — CLICK ANALYSIS

Navigate to: Heatmaps → Click
Review what users are clicking.

Record:
  Are the CTA buttons getting clicks? How many vs. how many reached that section?
  Any dead zones: spots where people click but nothing is clickable?
  Any rage clicks: spots where people click multiple times in frustration?

Flag: Any rage click cluster = UX problem that needs fixing
Flag: If CTA button has fewer clicks than expected given scroll depth
  → CTA copy is weak or the button is not visually distinct

---

## STEP 3 — SESSION RECORDINGS

Navigate to: Recordings
Filter: sessions where user did NOT submit a form
Watch 5 non-converting sessions.

For each recording, note:
  Where did they hesitate (cursor stopped moving)?
  What did they try to click that wasn't clickable?
  Where did they leave the page?
  Did they start filling the form then abandon?
  What was the last element they viewed before leaving?

Summarize as 5 bullet points — patterns across recordings, not individual observations.

---

## STEP 4 — FORM ANALYTICS

If Clarity has form analytics enabled for the page:
  Which form field has the highest abandonment rate?
  What is the overall form completion rate?
  Is mobile form completion lower than desktop?
    If gap > 20%: flag as mobile form UX problem
      (likely too many fields, field too small, or keyboard covering button)

---

## STEP 5 — EXIT INTENT PATTERNS

What % of sessions end without any click at all?
  High bounce + no clicks = message mismatch
    (ad promised something the landing page didn't deliver)

What is the avg session duration?
  Under 10 seconds: first impression failing
  10-30 seconds: reading headline, not converting on body
  Over 30 seconds: engaged — conversion problem is in the form or CTA

---

## STEP 6 — WRITE INSIGHTS FILE

Update intelligence-db/clarity/heatmap-insights.json:

```json
{
  "last_updated": "ISO timestamp",
  "date_range": "last 7 days",
  "scroll_depth": {
    "reach_hero_desktop": 0,
    "reach_hero_mobile": 0,
    "reach_first_form_desktop": 0,
    "reach_first_form_mobile": 0,
    "reach_testimonials": 0,
    "reach_bottom_cta": 0,
    "biggest_dropoff_section": "section name"
  },
  "click_issues": {
    "rage_click_locations": ["list of elements"],
    "dead_click_locations": ["list of elements"],
    "cta_click_rate_hero": 0,
    "cta_click_rate_bottom": 0
  },
  "form_analytics": {
    "hero_form_completion_rate": 0,
    "bottom_form_completion_rate": 0,
    "highest_abandon_field": "field name",
    "mobile_vs_desktop_gap": 0
  },
  "session_recording_insights": [
    "Bullet 1 from recordings",
    "Bullet 2",
    "Bullet 3",
    "Bullet 4",
    "Bullet 5"
  ],
  "avg_session_duration_seconds": 0,
  "zero_click_bounce_rate": 0,
  "recommendation_for_ahri": "One specific change to make this week based on Clarity data"
}
```

---

## STEP 7 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Clarity analysis complete.
   Scroll depth cliff: [where biggest drop happens]
   Hero form reach: [X]% mobile / [X]% desktop
   Form completion: [X]%
   Top issue: [most actionable finding]
   AHRI recommendation: [one change to make]"

---

## WHAT MANUS NEVER DOES

- Never edits the Clarity project settings during this task — read only
- Never records or exports any personal visitor data
- Never records session recordings that show identifiable personal information
