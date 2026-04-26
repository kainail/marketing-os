# Manus Task — Google Ads Performance Analyzer

**Task type:** Recurring intelligence task
**Trigger:** Every Wednesday at 9:00am (after Meta analyzer completes)
**Estimated time:** 20-25 minutes
**Output:** intelligence-db/paid/google-performance.json
**Reads first:** knowledge-base/paid-media/thresholds.md
**Feeds into:** AHRI paid-ads decisions, morning brief, monthly executive report

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/google-performance.schema.json`

Also write the payload to disk:
- `intelligence-db/paid/google-performance.json` — full google-performance payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "google-ads-analyzer",
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

Open Google Ads Manager.
Confirm account name matches: [TEST Google Ads account name]

If wrong account: STOP. Log to logs/errors.csv: "wrong account — google-ads-analyzer aborted."
Do not view or record data from the wrong account.

---

## STEP 1 — CAMPAIGN OVERVIEW

Navigate to: ads.google.com
Set date range: Last 7 days

For each active campaign, record:
  campaign name, type (Search/Display/Performance Max),
  spend, clicks, impressions, CTR, avg CPC,
  conversions, cost per conversion

---

## STEP 2 — SEARCH CAMPAIGNS — SEARCH TERMS REPORT

For each Search campaign:
  Open the Search Terms report
  Identify top 5 search terms by spend
  Identify any irrelevant search terms (clearly not gym-intent)

  Flag irrelevant terms as: NEGATIVE KEYWORD NEEDED
    Example: "gym shoes" — user looking for footwear, not a gym membership
    Log each one: "[term] — add as negative keyword"
    These waste budget — log for Kai to add as negatives in Ads Manager

Apply CPL thresholds from thresholds.md (same kill/watch/scale logic as Meta task):
  CPL > $60 after $30 spend: KILL SIGNAL
  CPL ≤ $30: SCALE SIGNAL
  CPL ≤ $20: DOUBLE DOWN SIGNAL

---

## STEP 3 — AD PERFORMANCE

For each active ad, record: headline, description, CTR, conversion rate, cost/conversion

If CTR < 2% on Search (Search industry standard for fitness):
  Flag: LOW CTR — test new headline

If conversion rate < 5% from click to lead form:
  Flag: LANDING PAGE FRICTION for this traffic source
  (Problem is likely the landing page, not the ad)

---

## STEP 4 — QUALITY SCORE CHECK

Check Quality Score for top 10 keywords:
  Below 5:  Flag: LOW QUALITY SCORE — ad copy mismatched to keyword intent.
            Low QS = paying more per click than competitors with better relevance.
  7+:       Healthy — no action needed.

Note any keywords with QS ≤ 4 — these are costing premium rates unnecessarily.

---

## STEP 5 — WRITE INTELLIGENCE FILE

Update intelligence-db/paid/google-performance.json:

```json
{
  "last_updated": "ISO timestamp",
  "date_range": "last 7 days",
  "account": "test/live",
  "campaigns": [
    {
      "name": "campaign name",
      "type": "Search/Display/PMax",
      "spend_7d": 0,
      "conversions": 0,
      "cost_per_conversion": 0,
      "status_signal": "kill/watch/scale/double-down",
      "recommendation": "specific action"
    }
  ],
  "top_search_terms": ["list of top 5 terms"],
  "negative_keywords_needed": ["list of irrelevant terms found"],
  "quality_score_issues": [
    {
      "keyword": "term",
      "quality_score": 0,
      "recommendation": "what to fix"
    }
  ],
  "weekly_summary": {
    "total_spend": 0,
    "total_conversions": 0,
    "blended_cpl": 0,
    "vs_target": "above/at/below $30 target",
    "recommendation_for_ahri": "one sentence"
  }
}
```

---

## STEP 6 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Google Ads Analysis complete.
   Blended CPL: $[X] ([above/at/below] $30 target)
   Negative keywords needed: [count]
   Quality score issues: [count keywords below 5]
   Action needed: [most urgent recommendation]"

---

## IF ANY STEP FAILS

Log to logs/errors.csv. Continue. Complete JSON write regardless.

---

## WHAT MANUS NEVER DOES

- Never edits ads, bids, or budgets during this task — read only
- Never records data from the wrong account
- Never skips account verification
