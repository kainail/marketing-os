# Manus Task — Paid Ads Setup

**Task type:** On-demand campaign setup
**Trigger:** Manual — Kai approval required before running
**Estimated time:** 30-45 minutes
**Output:** Campaign live in Meta Ads Manager (test account)
**Reads first:** distribution/queue/ready-to-post/ (approved ad creatives)
**Feeds into:** AHRI paid-ads-analyzer (Wednesday intelligence)

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "paid-ads-setup",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {
    "account_verified": true,
    "account_name": "Bloomington TEST",
    "campaign_id": "Meta campaign ID",
    "campaign_name": "campaign name as created",
    "ad_sets_created": [
      {
        "ad_set_id": "Meta ad set ID",
        "ad_set_name": "ad set name",
        "audience": "cold/warm",
        "daily_budget": 0,
        "ads_created": [
          {
            "ad_id": "Meta ad ID",
            "ad_name": "ad name",
            "hook": "hook text used"
          }
        ]
      }
    ],
    "total_daily_budget": 25,
    "status": "active/draft/review"
  },
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If task cannot run: set `status` to `"failed"` with all errors logged.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open Meta Ads Manager at: business.facebook.com/adsmanager

Confirm the account name in the top left of Ads Manager matches exactly:
`Bloomington TEST`

If the account name does not match `Bloomington TEST`: STOP immediately.
Do not create anything.
Return status failed with error:
`Wrong account active — Bloomington TEST required`

If account name matches: continue to Step 1.

---

## STEP 1 — CREATE CAMPAIGN

In Ads Manager, click Create.

Campaign settings:
- **Objective:** Leads
- **Campaign name:** No-Risk Comeback — 30-Day Kickstart — [YYYY-MM-DD]
- **Campaign budget optimization:** OFF (set budget at ad set level)
- **Special ad category:** None

Click Next.

---

## STEP 2 — CREATE AD SET A (COLD AUDIENCE)

Ad set name: Cold — Hook A — [YYYY-MM-DD]

**Budget:**
- Daily budget: $12.50/day

**Audience:**
- Location: Bloomington, IN — 10 mile radius
- Age: 28–55
- Gender: All
- Detailed targeting: Do NOT use interest targeting — use broad audience only
- Custom audiences: EXCLUDE existing leads list (if available in account)

**Placements:**
- Advantage+ placements: ON (let Meta optimize)

**Optimization:**
- Optimization for ad delivery: Leads
- Bid strategy: Lowest cost

Click Next.

---

## STEP 3 — CREATE AD A (COLD — HOOK A)

Ad name: Cold — Hook A — [YYYY-MM-DD]

**Identity:**
- Facebook Page: [gym's Facebook Page]
- Instagram account: [gym's Instagram]

**Ad format:** Single image or video (use the approved creative from distribution/queue/ready-to-post/)

**Creative:** Load approved Hook A cold creative from the ready-to-post queue.
- Primary text: [from approved ad copy]
- Headline: [from approved ad copy]
- Description: [from approved ad copy]
- Call to action: Learn More
- Website URL: [landing page URL from brain-state]
- URL parameters: utm_source=facebook&utm_medium=paid&utm_campaign=no-risk-comeback&utm_content=hook-a-cold

**Lead form:** Use existing lead form if available, or create new:
- Form name: No-Risk Comeback Lead Form
- Fields: First name, Last name, Phone number
- Thank you screen: "We'll text you within minutes to get you scheduled."
- Privacy policy URL: [gym privacy policy URL]

Click Publish.

---

## STEP 4 — CREATE AD SET B (WARM AUDIENCE)

Ad set name: Warm — Hook E — [YYYY-MM-DD]

**Budget:**
- Daily budget: $12.50/day

**Audience:**
- Custom audience: Page engagers (last 365 days) — if available
- Custom audience: Instagram engagers (last 365 days) — if available
- Custom audience: Website visitors (last 180 days) — if available
- If no custom audiences exist yet: use broad audience identical to Step 2 and note in errors[]

**Placements:**
- Advantage+ placements: ON

**Optimization:**
- Optimization for ad delivery: Leads
- Bid strategy: Lowest cost

Click Next.

---

## STEP 5 — CREATE AD B (WARM — HOOK E)

Ad name: Warm — Hook E — [YYYY-MM-DD]

**Creative:** Load approved Hook E warm creative from the ready-to-post queue.
- Primary text: [from approved ad copy]
- Headline: [from approved ad copy]
- Description: [from approved ad copy]
- Call to action: Learn More
- Website URL: [landing page URL from brain-state]
- URL parameters: utm_source=facebook&utm_medium=paid&utm_campaign=no-risk-comeback&utm_content=hook-e-warm

**Lead form:** Use same lead form created in Step 3.

Click Publish.

---

## STEP 6 — VERIFY CAMPAIGN ACTIVE

After publishing both ad sets:

1. Return to campaign view in Ads Manager
2. Confirm campaign status shows: Active (or In Review)
3. Confirm both ad sets are visible under the campaign
4. Confirm both ads are visible under each ad set
5. Confirm total daily budget across both ad sets = $25/day
6. Screenshot campaign structure and note campaign ID, both ad set IDs, both ad IDs

If campaign shows In Review: note in data.status = "review" — this is normal for new accounts.

---

## STEP 7 — LOG AND RETURN

Record all IDs from Step 6 in the JSON output.
Note any errors encountered (missing creatives, missing custom audiences, review flags).

Total daily budget must equal $25/day. If Manus cannot confirm this, set status to "partial" and explain in errors[].

---

## WHAT MANUS NEVER DOES

- Never runs this task without first verifying the Bloomington TEST account name
- Never creates campaigns in a live account — test account only until Kai explicitly approves live
- Never sets a budget other than $25/day total without Kai's written approval
- Never creates ads without the approved creatives from the ready-to-post queue
- Never skips account verification
- Never makes changes to existing campaigns during setup — create new only
