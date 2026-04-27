# Manus Task — Review Monitoring

**Task type:** Recurring intelligence task
**Trigger:** Every Monday at 9:00am
**Estimated time:** 20-25 minutes
**Output:** intelligence-db/market/review-log.json
**Feeds into:** AHRI reputation tracking, morning brief, monthly report

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/review-log.schema.json`

Also write the payload to disk:
- `intelligence-db/market/review-log.json` — full review-log payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "review-monitoring",
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

No posting in this task — read and draft only.
Open business.google.com.
Confirm you are logged into the account with access to the gym's GBP listings.
If wrong account or no listings visible: STOP. Log error. Exit.

---

## STEP 1 — GOOGLE REVIEWS

Open: business.google.com → Reviews
Check all available gym locations in sequence.

For each location, find new reviews since last Monday.
For each new review, record:
  Location name, rating (1-5 stars), review date, reviewer name (first name only),
  review text (first 100 words), has the gym responded? Y/N

  Flag: 1-star or 2-star review with no response
    Priority: URGENT — draft response immediately in Step 3

  Flag: 4-5 star review with no response
    Note for Kai to personalize a response

---

## STEP 2 — FACEBOOK AND YELP

Check Facebook page reviews (same fields as Step 1).
Check Yelp listing (same fields).

Identify patterns across all platforms:
  Common praise themes: what are happy members saying most?
  Common complaint themes: what problems keep appearing?

---

## STEP 3 — DRAFT RESPONSES

For each unresponded negative review (1-2 stars):
  Draft a professional response:
    "Thank you for sharing your feedback [first name].
     We take [specific concern they mentioned] seriously.
     Please reach out to our manager at [manager name] so we can make this right."

  Rules for negative responses:
    NEVER argue or be defensive
    NEVER reveal personal details
    ALWAYS offer to take the conversation offline
    Reference the specific concern from their review — never generic

For each unresponded positive review (4-5 stars):
  Draft a short, warm, specific response (2-3 sentences max):
    Thank them by name
    Reference something specific from their review
    Invite them to bring a friend or come back soon

Note: Kai must post all responses — Manus drafts only.

---

## STEP 4 — WRITE REVIEW LOG

Update intelligence-db/market/review-log.json:

```json
{
  "last_updated": "ISO timestamp",
  "week_ending": "YYYY-MM-DD",
  "reviews_this_week": {
    "google": { "count": 0, "new_5star": 0, "new_4star": 0, "new_3star": 0, "new_2star": 0, "new_1star": 0 },
    "facebook": { "count": 0, "avg_rating": 0 },
    "yelp": { "count": 0, "avg_rating": 0 }
  },
  "unresponded_negative": [
    {
      "platform": "google",
      "location": "location name",
      "rating": 1,
      "review_preview": "first 30 words",
      "draft_response": "full draft response"
    }
  ],
  "unresponded_positive": [
    {
      "platform": "google",
      "rating": 5,
      "review_preview": "first 30 words",
      "draft_response": "full draft response"
    }
  ],
  "praise_themes": ["what members love — list"],
  "complaint_themes": ["recurring problems — list"],
  "overall_reputation_trend": "improving/stable/declining"
}
```

---

## STEP 5 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Review monitoring complete.
   New reviews this week: [X] (Google: [X] / FB: [X] / Yelp: [X])
   Unresponded negative: [X] — drafts ready for Kai
   Unresponded positive: [X] — drafts ready for Kai
   Praise themes: [top 2]
   Complaint themes: [top 2]
   Reputation trend: [improving/stable/declining]"

---

## WHAT MANUS NEVER DOES

- Never posts any review responses — drafts only, Kai posts
- Never edits or removes existing reviews
- Never engages with reviewer profiles
- Never shares specific reviewer names outside this system
