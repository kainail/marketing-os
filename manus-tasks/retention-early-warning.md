# Manus Task — Campaign Retention Signals

**Task type:** Recurring intelligence task
**Trigger:** Every Wednesday at 11:00am
**Estimated time:** 5 minutes
**Output:** intelligence-db/retention/campaign-signals.json
**Feeds into:** AHRI retention handler, weekly brief

Campaign health check — 3 signals only. Reads existing intelligence-db files.
No GHL access required. No member data required.

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Also write the payload to disk:
- `intelligence-db/retention/campaign-signals.json` — full signal report

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "retention-early-warning",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {
    "signals_checked": 3,
    "signals_triggered": 0,
    "ctr_signal": {
      "triggered": false,
      "current_week_ctr": "string — e.g. 1.8%",
      "previous_week_ctr": "string — e.g. 2.4%",
      "drop_percent": 0,
      "severity": "none"
    },
    "form_cvr_signal": {
      "triggered": false,
      "current_week_cvr": "string — e.g. 4.2%",
      "previous_week_cvr": "string — e.g. 6.1%",
      "drop_percent": 0,
      "severity": "none"
    },
    "zero_leads_signal": {
      "triggered": false,
      "spend_7d": 0,
      "leads_7d": 0,
      "severity": "none"
    },
    "recommendation": "All signals clear. Campaign performing within expected ranges."
  },
  "errors": []
}
```

Severity values: `"none"` | `"warning"` | `"critical"`

If a file cannot be read: set that signal's fields to null and log in `errors[]`. Continue with remaining signals.
If no data files exist at all: set `status` to `"failed"`, log `"No performance data available. Run paid-ads-analyzer first."` in `errors[]`.

---

## STEP 0 — READ DATA FILES (REQUIRED — DO NOT SKIP)

Read these files if they exist:
- `intelligence-db/paid/meta-performance.json`
- `intelligence-db/paid/pacing-log.json`

If neither file exists: set status to "failed" and stop.

Do NOT open a browser. Do NOT log into Meta. Do NOT access GHL. Read only.

---

## STEP 1 — CTR DROP SIGNAL

From `intelligence-db/paid/meta-performance.json`:

Read `current_week_ctr` and `previous_week_ctr`.

Calculate: `drop_percent = (previous - current) / previous * 100`

Apply thresholds:
- Drop >= 35%: `severity: "critical"`, `triggered: true`
- Drop >= 20%: `severity: "warning"`, `triggered: true`
- Drop < 20%: `severity: "none"`, `triggered: false`

If CTR data is missing from the file: set all ctr_signal fields to null, log in errors[], continue.

---

## STEP 2 — FORM CONVERSION DROP SIGNAL

From `intelligence-db/paid/meta-performance.json` or `intelligence-db/clarity/heatmap-insights.json`:

Read `current_week_form_cvr` and `previous_week_form_cvr` (or equivalent fields).

Apply thresholds:
- Drop >= 25% week-over-week OR current CVR below 3%: `severity: "warning"`, `triggered: true`
- Drop >= 40% week-over-week OR current CVR below 1.5%: `severity: "critical"`, `triggered: true`
- Otherwise: `severity: "none"`, `triggered: false`

If form CVR data is missing: set all form_cvr_signal fields to null, log in errors[], continue.

---

## STEP 3 — ZERO LEADS SIGNAL

From `intelligence-db/paid/pacing-log.json`:

Find any 7-day window where:
- `spend` >= 50 (USD)
- `leads` == 0

Apply thresholds:
- Spend >= 50, leads == 0: `severity: "warning"`, `triggered: true`
- Spend >= 100, leads == 0: `severity: "critical"`, `triggered: true`

If pacing log is missing or has no spend data: set all zero_leads_signal fields to null, log in errors[], continue.

---

## STEP 4 — COMPILE AND RETURN

Count `signals_triggered` = number of signals where `triggered: true`.

Set `recommendation`:
- If no signals triggered: `"All signals clear. Campaign performing within expected ranges."`
- If 1 signal triggered (warning): `"[Signal name] showing early warning. Review creative and targeting before budget renewal."`
- If 1 signal triggered (critical): `"[Signal name] is critical. Pause campaign spend immediately and alert Kai."`
- If 2+ signals triggered: `"Multiple signals triggered — [list]. Recommend pausing spend and running full paid-ads-analyzer audit."`

Write the JSON to `intelligence-db/retention/campaign-signals.json`.

Return the JSON. No additional text.

---

## WHAT MANUS NEVER DOES IN THIS TASK

- Never accesses GHL, member records, or check-in data
- Never contacts gym members
- Never logs into Meta or any ad platform
- Never pauses or modifies campaigns — report only
- Never deletes signal history — append only
