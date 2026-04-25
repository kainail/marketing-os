# AHRI Morning Brief Routine

**Schedule:** Every Monday at 7:00 AM (automated)
**Trigger:** Automated — no Kai input required. Runs after weekly-media-processing (5:45 AM) and weekly-cross-brain-sync (Sunday 11 PM) have already completed.
**Engine:** engine/ahri.ts → handleMorningBrief()
**Script:** npm run morning-brief
**Output:** outputs/anytime-fitness/morning-briefs/[YYYY-MM-DD]-morning-brief.md

---

## Purpose

Every Monday at 7 AM AHRI reads the full system state and produces a structured 15-minute brief for Kai. The brief tells Kai exactly what happened last week, what the data is showing, what one action AHRI recommends, and what decisions only Kai can make. Kai approves or rejects in the 15-minute window. Nothing executes without that approval.

---

## Pre-Brief Reads (run in order before generating)

1. `brain-state/current-state.md` — active offer, hooks, objections, seasonal context, cross-brain insights
2. `performance/asset-log.csv` — all assets generated in the past 7 days (filter: last 7 days by date_created)
3. `performance/test-results.csv` — any A/B test with 72+ hours of data and result recorded
4. `performance/channel-performance.csv` — CPL, leads, spend by channel (last 7 days)
5. `distribution/queue/pending-review/` — count + list of every unapproved asset
6. `distribution/queue/ready-to-post/` — count of approved but unposted assets
7. `intelligence-db/cross-brain/archetype-performance.json` — latest archetype conversion rates
8. `logs/session-history.json` — last session timestamp, skill runs, error count

---

## Output Format

Save to: `outputs/anytime-fitness/morning-briefs/YYYY-MM-DD-morning-brief.md`

```
# AHRI Morning Brief — [DATE]
# Generated: [ISO timestamp]

---

## 1. SYSTEM STATUS

- Active offer:        [offer name]
- Active avatar:       [avatar name]
- Script version:      [nurture-sync version — from brain-state]
- Landing page:        [live / pending / down — from brain-state]
- GHL status:          [connected / API key expired / not configured]
- Last sync:           [cross-brain sync date — from session-history.json]
- Pending review:      [N assets — list count by skill type]
- Ready to post:       [N assets]
- Critical alerts:     [NONE / list any compliance flags or API errors from last 7 days]

---

## 2. YESTERDAY

Assets generated in the past 7 days:
[For each asset_id in asset-log.csv from the past 7 days:]
- [skill] | [asset_id] | [variant A or B] | [created_date] | Status: [pending / approved / posted]

If nothing was generated this week:
- No assets generated — AHRI has been idle. Check session-history.json for errors.

Assets approved this week:
- [list asset_ids that moved from pending to approved]

Assets posted this week (via Manus):
- [list asset_ids in distribution/queue/posted/ with this week's timestamp]

---

## 3. PERFORMANCE PULSE

Data source: cross-brain-sync (archetype-performance.json) + channel-performance.csv

- Top archetype this month:    [archetype] — [booking rate]% booking rate ([N] calls)
- Top source this month:       [source] — [CVR]% conversion rate ([N] leads)
- Overall booking rate:        [X]% (N booked / N total calls)
- Top objection pattern:       [from brain-state — top objection this month]
- One pattern worth noting:    [1 sentence from cross-brain insights — most actionable]

If cross-brain data is empty or stale (>7 days old):
- [KAI — Cross-brain sync data is stale or missing. Run npm run sync-brains.]

---

## 4. THIS WEEK

Context pulled from brain-state/current-state.md + knowledge-base/fitness/seasonal-calendar.md

- Seasonal context:     [from brain-state — e.g., "Late April — spring motivation window"]
- Recommended angle:    [one sentence on what hook type to weight this week, based on data]
- Offer status:         [No change / Offer adjustment recommended — see Section 5]
- Upcoming dates:       [any local events, holidays, or gym milestones this week worth noting]

Content calendar status:
- [N] pieces queued for this week (from distribution/queue/ready-to-post/)
- [N] pieces approved and scheduled for Manus posting
- [N] pieces need platform images — shot list has [N] outstanding gaps

---

## 5. ONE RECOMMENDED ACTION

One action only. Specific. Executable. Supported by data.

Recommendation: [specific action]
Data supporting this: [1-2 sentences with specific numbers from this week's data]
Effort required: [Kai approval only / 30 minutes / 2 hours / budget required]
Budget required: [NONE / $X — [BUDGET APPROVAL REQUIRED: $X]]
Expected outcome: [specific, measurable — not vague]

AHRI does not act on this recommendation without Kai's explicit approval this session.

---

## 6. WAITING FOR KAI

For each item that requires explicit Kai approval before AHRI can proceed:

- [ ] [Item type: CONTENT / BUDGET / OFFER / AVATAR / TECHNICAL] — [specific decision]
  Waiting since: [date first flagged]
  Blocking: [what AHRI cannot do until this is resolved]

If nothing is waiting:
- No pending decisions — AHRI can execute full autonomy this week.
```

---

## Rules

- Brief is informational only — Kai approves or rejects in the 15-minute Monday window
- AHRI never acts on the brief's recommendations without explicit Kai sign-off this session
- If no A/B test data exists, the Performance Pulse section shows what data is available and notes the gap — it is never omitted
- If queue is empty, say so explicitly — never skip the section
- Budget recommendations always include exact dollar amounts (never a range)
- Any compliance flag found during brief generation → immediate Kai alert, do not wait for Monday
- Every section must have content. If a section has no data, write "No data available — [reason]" and tell Kai what is needed to populate it.

---

## Session Logging

After generating the brief, append to `logs/session-history.json`:

```json
{
  "session": "morning-brief",
  "date": "[ISO timestamp]",
  "output_file": "outputs/anytime-fitness/morning-briefs/[date]-morning-brief.md",
  "assets_in_review": N,
  "assets_ready_to_post": N,
  "cross_brain_data_age_days": N,
  "errors": []
}
```

---

## Error Handling

- Missing asset-log.csv: note in Section 2 — "Asset log not found. Check performance/ directory."
- Missing channel-performance.csv: note in Section 3 — "Channel performance data unavailable."
- Missing cross-brain data: note in Section 3 — "Cross-brain sync not yet run." Flag in Section 6 as a required Kai decision if data has been missing for more than 7 days.
- Brief generation fails: write partial brief with all available sections, flag what failed, save partial output. Log to logs/errors.csv: timestamp, "morning-brief", model used, error message, resolved: false.
- Never crash without saving. Always write whatever was generated.

---

## Kai's 15-Minute Monday Protocol

1. Open brief at `outputs/anytime-fitness/morning-briefs/[date]-morning-brief.md`
2. For each pending asset in Section 2: approve or reject (approve → move to ready-to-post / reject → move to archive with reason)
3. For the recommended action in Section 5: approve exact scope or override with counter-instruction
4. For each item in Section 6: act or defer (if deferring, write reason so AHRI logs the decision)
5. Reply to AHRI in the terminal to execute approved items immediately

---

## When to Run Manually

```bash
npm run morning-brief
```

Useful if Kai wants an out-of-cycle status check (mid-week check, before a meeting, after a large batch run). The output will be timestamped and saved to the morning-briefs/ folder with today's date regardless of day of week.
