# Manus Task — Competitor Research

**Task type:** Recurring intelligence task
**Runs:** Every Monday at 6:00 AM (before weekly content at 7:00 AM)
**Operator:** Manus AI
**Purpose:** Gather what competitor gyms are running in ads and organic content so AHRI's content calendar can avoid saturation and exploit gaps

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/competitor-ads.schema.json`, `competitor-offers.schema.json`, `hook-saturation.schema.json`

Also write the payloads to disk:
- `intelligence-db/market/competitor-ads.json` — competitor-ads payload
- `intelligence-db/market/competitor-offers.json` — competitor-offers payload
- `intelligence-db/market/hook-saturation.json` — hook-saturation payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "competitor-research",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {
    "competitor_ads": {},
    "competitor_offers": {},
    "hook_saturation": {}
  },
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If task cannot run: set `status` to `"failed"` with all errors logged.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Before researching anything, verify your browsing environment is clean.

1. Open Facebook in a browser. Confirm you are NOT logged into the gym's Facebook account. For competitor research, you should be either logged out or in a neutral/research account. If logged into the gym's page, log out first — competitor ad research works best from a neutral perspective.

2. Confirm you have access to: `intelligence-db/market/competitor-ads.json` — this is the file you will update at the end of this task. If the file does not exist, create it as an empty JSON array: `[]`

If verification passes — continue to Step 1.

---

## STEP 1 — META AD LIBRARY RESEARCH

Go to: https://www.facebook.com/ads/library

Search criteria:
- Country: United States (or the gym's local country)
- Ad category: All ads
- Search for: [each competitor gym name in the local area — start with known competitors, then search by keyword "gym [city name]"]

For each active competitor gym found:

**Record these details for each ad they are currently running:**

```
Competitor name: [gym name]
Ad status: Active
Platform: [Facebook / Instagram / both]
Estimated start date: [if shown]
Format: [image / video / carousel]
Hook (first 5 words of headline or primary text): [exact words]
Offer type: [free trial / discount / no offer visible / event / referral]
Visual description: [1 sentence — what does the image/video show? People? Equipment? Text?]
CTA button: [Learn More / Sign Up / Book Now / etc.]
```

Research at least 5 competitor gyms. If fewer than 5 are active in the local area, research gyms in similar-sized markets as a benchmark.

Note: You do not need to watch entire video ads. The thumbnail, headline, and copy visible in the Ad Library is sufficient.

---

## STEP 2 — ORGANIC CONTENT SCAN

For the top 3 local competitor gyms (highest number of active ads):

1. Go to their Instagram profile
2. Look at the last 10 posts (feed only — not Stories)
3. Record:
   - Hook themes (what topics keep appearing?)
   - Offers being promoted
   - Comment volume on any post (rough indicator of engagement)
   - Whether they use member photos or stock/AI images

4. Go to their Facebook Page
5. Look at the last 10 posts
6. Record the same fields

Do NOT engage with any posts (no likes, comments, follows). Observation only.

---

## STEP 3 — GAP ANALYSIS

After completing Steps 1 and 2, identify:

**Gap 1 — Offer gap:** What offer types are competitors NOT running?
Example: "No competitor is running a coached first-month offer — they're all doing free trials."

**Gap 2 — Hook gap:** What emotional hooks or avatar angles are competitors ignoring?
Example: "No competitor is speaking to the parent/child moment — all hooks are about personal transformation."

**Gap 3 — Format gap:** What formats are competitors underusing?
Example: "All competitors post single images — no one is running carousels or Reels locally."

**Gap 4 — Platform gap:** Is any platform significantly less contested locally?
Example: "No competitor has a Google Business Profile post in the last 30 days — GBP is open."

Write these 4 gaps as clear, specific statements. These feed directly into AHRI's content calendar directives.

---

## STEP 3B — COMPETITOR WEBSITE PRICING CHECK

For the top 3 competitors identified in Step 1 (highest active ad count):

1. Visit their website directly (not the Ad Library — their actual gym website)
2. Look for any pricing or offer page
3. Record:
   - Current offer displayed on homepage or pricing page
   - Any price shown (monthly rate, initiation fee, etc.)
   - Any limited-time offer visible

Compare to last month's record in competitor-ads.json:
  Has their offer changed?
  Has their price changed?
  Are they running a new promotion?

Log findings to: `intelligence-db/market/competitor-offers.json`
Append one object per competitor (never delete existing entries):

```json
{
  "competitor_name": "[gym name]",
  "research_date": "[YYYY-MM-DD]",
  "website_url": "[their website]",
  "current_offer": "[what's showing on their site]",
  "price_shown": "[any price visible]",
  "changed_since_last_month": true/false,
  "change_notes": "[what changed, if anything]"
}
```

If their site has no pricing visible: note "pricing not public."

---

## STEP 4 — UPDATE competitor-ads.json

Open `intelligence-db/market/competitor-ads.json`. The file is a JSON array. Append one object per competitor researched this week:

```json
{
  "competitor_name": "[gym name]",
  "research_date": "[YYYY-MM-DD]",
  "ads_active": N,
  "offers_running": ["list of offer types found"],
  "hook_themes": ["list of hook themes found in active ads"],
  "visual_style": "[real photos / stock / AI / mixed]",
  "platforms": ["facebook", "instagram"],
  "gaps_identified": {
    "offer_gap": "[what they are NOT doing]",
    "hook_gap": "[what emotional angles they ignore]",
    "format_gap": "[formats they underuse]",
    "platform_gap": "[platforms with low competition locally]"
  },
  "notes": "[anything notable — a specific ad that performed well, an unusual offer, etc.]"
}
```

Do NOT delete existing entries. Append new research alongside prior entries. The history matters — AHRI tracks whether competitors change their strategy month to month.

---

## STEP 5 — END-OF-TASK LOG

After updating competitor-ads.json, send this summary:

```
MANUS COMPETITOR RESEARCH LOG — [DATE]

Competitors researched: [N]
Active ads found: [N total across all competitors]

Gaps identified:
1. Offer gap: [1 sentence]
2. Hook gap: [1 sentence]
3. Format gap: [1 sentence]
4. Platform gap: [1 sentence]

competitor-ads.json updated: Yes / No (if no — explain why)

Notable findings:
- [any single observation worth flagging — a competitor running an unusually strong offer, a new gym that appeared, etc.]
```

AHRI reads this data during the weekly-content routine's Phase 1 intelligence gathering. The better this research is, the more differentiated the weekly content calendar will be.

---

## WHAT MANUS NEVER DOES

- Never logs in or engages with competitor accounts
- Never takes screenshots that include personal information about competitor customers
- Never deletes existing entries in competitor-ads.json
- Never edits the active gym's ads or pages during this task
- Never records information about individual people in competitor ads (only the ad creative and offer details)
