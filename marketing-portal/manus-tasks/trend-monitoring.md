# Manus Task — Trend Monitoring

**Task type:** Recurring intelligence task
**Runs:** Every Monday at 6:30 AM (after competitor-research at 6:00 AM, before weekly content at 7:00 AM)
**Operator:** Manus AI
**Purpose:** Identify emerging content trends in the local fitness and wellness space — hooks, formats, seasonal moments — so AHRI can act on real-time signal rather than evergreen assumptions

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/trend-hypotheses.schema.json`

Also write the payload to disk:
- `intelligence-db/patterns/trend-hypotheses.json` — full trend-hypotheses payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "trend-monitoring",
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

Before researching anything, verify your environment.

1. Open Instagram. Confirm you are logged into the research account (NOT the gym's business account). Trend monitoring requires browsing as a general user — the explore feed reflects what is trending broadly, not what the gym's own audience sees.

2. Open Facebook. Confirm you are NOT logged into the gym's Facebook page for this task. Use a personal or neutral research account. The local group browsing in Step 2 works better from a real community member perspective.

3. Confirm you have access to: `intelligence-db/patterns/hypotheses.json` — this is the file you will update at the end of this task. If it does not exist, create it as: `{ "active_hypotheses": [], "retired_hypotheses": [] }`

If verification passes — continue to Step 1.

---

## STEP 1 — INSTAGRAM EXPLORE RESEARCH

Open Instagram and navigate to the Explore page (the magnifying glass).

Search for each of these terms and scroll through the top results (first 20–30 posts for each):
- "gym" — look at what's trending in fitness content format
- "fitness over 40" — speaks directly to the lifestyle member avatar
- "back to the gym" — captures the I've Quit Before moment
- "workout motivation" — what hook styles are getting engagement
- "[city name] fitness" — what local content is performing

For each search, note:
- What hook formats are getting high engagement (text overlays, talking-to-camera, before/after reaction, educational, humor)?
- What emotional angles keep appearing (community, accountability, self-care, family, convenience)?
- What formats are trending (Reels vs. feed posts vs. carousels)?
- Any specific hooks or phrases appearing frequently (exact wording if memorable)?

**Do NOT record personal information about any individual.** Record only what is visible in public content: format, hook angle, topic, engagement indicators.

---

## STEP 2 — LOCAL FACEBOOK GROUP SCAN

Search Facebook Groups for:
- "[city name] community" — general local community group
- "[city name] parents" or "[city name] moms/dads" — direct avatar overlap
- "[city name] buy sell trade" or "[city name] neighbors" — general local activity

For each group (if accessible — do not request to join private groups, only observe public groups):

Look at the last 7 days of posts. Note:
- What topics are locals posting about? (Jobs, events, school, weather, local businesses?)
- Is anyone asking about gyms, fitness, health, or wellness? If so: what are they asking?
- Is anyone sharing anything related to fitness challenges, health changes, or lifestyle shifts?
- Any local events posted that could tie into the gym's content this week?

**Key question to answer:** "What is on the mind of a 35–55-year-old local parent or professional right now — this week specifically?" The answer shapes the weekly content's seasonal relevance.

---

## STEP 3 — IDENTIFY THIS WEEK'S TREND SIGNAL

After Steps 1 and 2, identify one specific trend signal for AHRI to act on this week.

Format:

```
TREND SIGNAL — WEEK OF [DATE]

Signal: [one sentence describing the trend]
Source: [Instagram Explore / Facebook local group / both]
Platform signal strength: [strong / moderate / weak]
Avatar relevance: [how directly this maps to the lifestyle member avatar — 1 sentence]
Content angle this suggests: [what specific hook type or topic this opens up for this week's calendar]
Seasonal tie-in: [does this connect to any current seasonal moment?]

Example content piece this could produce:
[One concrete example of a post idea that uses this trend signal]
```

If no clear trend signal emerges this week, write:
"No strong trend signal this week. Content calendar defaults to top-performing hooks from brain-state's winning hooks."

---

## STEP 4 — UPDATE hypotheses.json

Open `intelligence-db/patterns/hypotheses.json`.

**If the trend signal is strong:** Add a new hypothesis to the "active_hypotheses" array:

```json
{
  "hypothesis_id": "hyp-[YYYYMMDD]-[3-char-random]",
  "hypothesis": "[specific testable claim — e.g., 'Reels using the parent/child angle will outperform static posts this week due to trending family content on Explore']",
  "trend_source": "instagram_explore | facebook_local",
  "created_date": "[YYYY-MM-DD]",
  "test_pieces": 2,
  "status": "untested",
  "result": null
}
```

**If a prior hypothesis has been "untested" for more than 2 weeks:** Move it to "retired_hypotheses" with note "Not tested — content calendar did not include test pieces."

**If AHRI's weekly content routine ran a test on a prior hypothesis and produced engagement data:** Update that hypothesis's "status" to "tested" and fill in "result" with the data.

Do NOT delete hypotheses — the history matters.

---

## STEP 5 — END-OF-TASK LOG

After updating hypotheses.json, send this summary:

```
MANUS TREND MONITORING LOG — [DATE]

Instagram Explore scanned: Yes
- Hook formats trending: [list]
- Emotional angles trending: [list]

Local Facebook groups scanned: [N groups]
- Local topics this week: [2–3 bullet points]
- Any fitness/gym questions found: Yes [quote the question] / No

Trend signal this week: [strong / moderate / weak / none]
Signal summary: [1 sentence]

hypotheses.json updated: Yes (new hypothesis added) / No (no strong signal) / Updated existing ([hypothesis_id])

Note for AHRI content calendar: [one sentence on what this week's content should emphasize based on this research]
```

AHRI reads hypotheses.json during the weekly-content routine's Phase 1. A well-maintained hypotheses file means every week's calendar tests something new while building on what's working.

---

## WHAT MANUS NEVER DOES

- Never requests access to private Facebook groups — observe only what is publicly accessible
- Never records personal information about any individual observed in any group
- Never posts in any group or on any platform during this task
- Never modifies competitor-ads.json (that is the competitor-research task)
- Never deletes hypotheses — archive to retired_hypotheses instead
- Never logs in to the gym's accounts during this task
