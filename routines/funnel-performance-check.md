# Funnel Performance Check Routine

**Schedule:** API trigger — runs automatically 72 hours after any funnel-updater push goes live
**Trigger:** Set a delayed API call or cron in GHL after publishPage() is called. Alternatively: every Wednesday morning if a funnel update went live in the past 7 days.
**Engine:** engine/ghl-funnel.ts (getPageMetrics)
**No Kai input required** — generates a brief automatically

---

## Purpose

After AHRI pushes updated copy to the GHL funnel page, this routine checks the before/after conversion rate to determine whether the copy update improved, maintained, or hurt performance. The result is logged to performance/test-results.csv and a brief is sent to Kai.

---

## When It Runs

Triggered after: a successful funnel-updater run completes (publishPage() returns success)
Timing: 72 hours after publish — enough traffic to be meaningful, short enough to catch regressions before they compound
Fallback: runs every Wednesday morning if a funnel update occurred in the prior 7 days and no API trigger is in place

---

## What It Does

**1. Read pre-update baseline**
Reads the conversion rate recorded in the asset-log.csv entry at the time of the funnel-updater run. This baseline was logged by the funnel-updater before pushing.

**2. Pull current metrics from GHL**
Calls getPageMetrics(pageId) for the live funnel page. Reads: page views, form submissions, and conversion rate for the 72-hour window since the update.

**3. Compare and classify**
Compares current rate to baseline:
- Improved: current rate > baseline × 1.05 (5% better or more)
- Neutral: within ±5% of baseline
- Regression: current rate < baseline × 0.95 (5% worse or more)

**4. Log to test-results.csv**
Appends a row:
```
"test_id","asset_type","variant","metric","baseline","current","delta_pct","result","date"
```

**5. Generate brief for Kai**
Writes a 3-bullet brief to distribution/queue/pending-review/:
- What the conversion rate was before
- What it is now
- Recommendation: keep running, run longer, or roll back

---

## Required .env Variables

```
GHL_API_KEY=                # GHL API Bearer token
GHL_LOCATION_ID=            # GHL location ID
GHL_FUNNEL_PAGE_ID=         # funnel page being tracked
```

---

## Failure Behavior

- Metrics endpoint unavailable: logs the failure, writes "metrics unavailable" in the brief, does not roll back the funnel. GHL analytics API may require different scope — [KAI — verify /funnels/pages/{pageId}/metrics availability in your GHL account].
- No baseline found in asset-log.csv: writes "baseline missing — unable to calculate delta" in the brief. Still logs current metrics for future comparison.
- 72-hour window has insufficient traffic (under 20 page views): notes this in the brief, recommends checking again at 168 hours (7 days), does not draw conclusions from thin data.

---

## What Constitutes a Winning Update

A funnel copy update wins when:
- Conversion rate improves by 5% or more
- Improvement holds for at least 72 hours
- Traffic is at least 50 page views in the window

If the update wins: AHRI logs the winning copy patterns to intelligence-db/patterns/winning-patterns.json under "funnel-copy" category.

If the update regresses: AHRI flags for Kai review. Kai decides whether to roll back manually in GHL. AHRI never automatically rolls back a live funnel.

---

## Integration with Other Routines

After a winning funnel copy pattern is logged, the hook-writer skill has access to the winning emotional framing via intelligence-db/patterns/winning-patterns.json. Winning funnel copy elements inform the next content calendar's hook selection — what converted on the funnel page likely converts in the newsfeed too.
