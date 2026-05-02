# Manus Task — Prospect Research (Task 17)

**Task type:** On-demand intelligence task (never scheduled)
**Triggered by:** New gym onboarding session creation
**Operator:** Manus AI
**Purpose:** Gather market intelligence before the voice interview so AHRI can open the onboarding call with specific, accurate knowledge about the prospect's market, competitors, and existing brand.

---

## CONTEXT PROVIDED AT TRIGGER TIME

The following variables are injected above this instruction block at trigger time:

- `SESSION_ID` — the onboarding session ID (use this in your output)
- `GYM_NAME` — the gym's name
- `CITY` / `STATE` / `ZIP` — the gym's location
- `FRANCHISE_TYPE` — "franchise", "independent", or "boutique"
- `WEBSITE_URL` — the gym's website (may be "not provided")

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "prospect-research",
  "session_id": "SESSION_ID_VALUE",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {
    "gymName": "",
    "city": "",
    "state": "",
    "franchiseType": "",
    "googleRating": 0,
    "googleReviewCount": 0,
    "googleReviews": [
      { "text": "", "rating": 5, "date": "" }
    ],
    "competitors": [
      { "name": "", "adCount": 0, "adThemes": [], "offerType": "" }
    ],
    "marketGaps": [],
    "websiteCopy": "",
    "existingOfferLanguage": "",
    "facebookAbout": "",
    "facebookFollowers": 0,
    "recentFacebookPosts": []
  },
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If the task cannot run at all: set `status` to `"failed"` with all errors logged.

**The `session_id` field is required in your output.** Copy it from the SESSION_ID variable provided above.

---

## STEP 1 — GOOGLE PLACES LOOKUP

Search Google Maps / Google Places for the gym using GYM_NAME + CITY + STATE.

Collect:
- Overall star rating (e.g. 4.8)
- Total review count
- Up to 10 most recent reviews: text, star rating, date
- Business hours
- Business category confirmation (gym / fitness center)
- Address confirmation

If the gym has multiple Google listings, use the one with the most reviews.

Store results in the `googleRating`, `googleReviewCount`, and `googleReviews` fields.

**Review selection for the interview:** Identify the 2-3 reviews that best capture why people chose this gym in their own words. These will be read aloud by AHRI during the call.

---

## STEP 2 — FACEBOOK PAGE SCRAPE

Search Facebook for the gym's public page using GYM_NAME + CITY.

Collect (public data only — no login required):
- About section text
- Follower count (approximate)
- 3-5 most recent public posts: text, type (photo/video/text), engagement (likes if visible)
- Any visible offer language in pinned posts or about section

If no Facebook page is found, log in `errors[]` and continue.

Store results in `facebookAbout`, `facebookFollowers`, `recentFacebookPosts`.

---

## STEP 3 — META AD LIBRARY SCAN (COMPETITOR RESEARCH)

Go to: https://www.facebook.com/ads/library/
Select: Country = United States, Ad category = All ads

Search for competitor gyms in the same city. Identify competitors by searching:
1. "[CITY] gym"
2. "[CITY] fitness"
3. "[CITY] personal training"
4. Common franchise names: Orangetheory, Planet Fitness, Crunch, Club Pilates, F45, YMCA, CrossFit (search each if relevant to the market)

For each active competitor found (limit to top 5):
- Gym/business name
- Number of active ads
- Dominant themes across their ads (e.g., "weight loss transformation", "community/friendship", "accountability program", "free trial offer")
- Offer type visible in ads (e.g., "free week", "30-day trial", "$0 enrollment", "limited spots")

Do NOT include the prospect gym's own ads in competitor data.

Store results in `competitors[]`.

---

## STEP 4 — MARKET GAP ANALYSIS

After completing Steps 1-3, analyze the competitor ad themes collected in Step 3.

Ask yourself: **What marketing angles are NOT being used by any competitor in this market?**

Look for gaps such as:
- Nobody talking about community / belonging
- Nobody targeting a specific life stage (new moms, over-40, post-injury)
- Nobody using social proof from real member outcomes (not "transformation")
- Nobody talking about the specific moment someone decides to change
- Nobody addressing the most common objection in this market
- Nobody positioning around a specific result other than weight loss

Generate 2-4 market gaps. Each gap should be:
- Specific (not generic "differentiation")
- Actionable (could become a hook or campaign angle)
- True to what the competitors are NOT saying

Store results in `marketGaps[]` as plain English statements.

Example: "Nobody in [city] is talking about how joining a gym changes your confidence at work — not just your body."

---

## STEP 5 — WEBSITE SCRAPE (IF URL PROVIDED)

If WEBSITE_URL is not "not provided":

Visit the website and collect:
- Homepage headline and subheadline
- Any visible offer language (trial, pricing, guarantee)
- Any testimonial text visible on the homepage
- About page copy if accessible

Store in `websiteCopy` (concatenated key copy) and `existingOfferLanguage` (any offer-specific language found).

If the website is unavailable or returns an error, log in `errors[]` and continue.

---

## QUALITY CHECK BEFORE RESPONDING

Before submitting your output, verify:

1. `session_id` matches the SESSION_ID provided at the top of this task
2. `competitors[]` contains at least 1 entry (if no competitors found, note why in errors)
3. `googleReviews[]` contains at least 2 reviews (if not found, note why in errors)
4. `marketGaps[]` contains at least 2 gaps
5. All fields present in the schema are present in your output (use empty strings / 0 / [] for missing data — never omit fields)

---

*Task 17 — GymSuite AI Marketing OS | AHRI Onboarding System*
