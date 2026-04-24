# AHRI Morning Brief Routine
# Runs: Monday 7am (automated)
# Produces: outputs/anytime-fitness/morning-briefs/[date].md

## Purpose

Every Monday at 7am AHRI reads the full brain state and queues a structured brief for Kai.
Kai spends 15 minutes reviewing it and either approving or rejecting queued initiatives.

## What AHRI reads

1. `brain-state/current-state.md` — offer, hooks, objections, seasonal context
2. `performance/asset-log.csv` — all assets generated this week (filter: last 7 days)
3. `performance/test-results.csv` — any A/B test with 72+ hours of data
4. `performance/channel-performance.csv` — CPL, ROAS, and lead volume by channel
5. `distribution/queue/pending-review/` — count and list of unapproved assets
6. `distribution/queue/ready-to-post/` — count of approved but unposted assets

## Output

Save to: `outputs/anytime-fitness/morning-briefs/YYYY-MM-DD.md`

### Format

```
# AHRI Morning Brief — [DATE]
# Generated: [timestamp]

## This Week at a Glance
- Offer:           [active offer]
- Active avatar:   [current avatar]
- Pending review:  [N assets]
- Ready to post:   [N assets]
- A/B tests live:  [N tests]
- Tests concluded: [N — list winners]

## A/B Test Summary
For each concluded test (72+ hours, minimum N impressions):
- Test ID:     [id]
- Skill:       [skill name]
- Winner:      [Variant A / Variant B / No winner]
- Confidence:  [high / medium / low — based on sample size]
- Recommended action: [declare winner / extend test / kill]

## Queue Summary
Assets awaiting Kai review:
- [List each pending asset: asset_id | skill | created_date]

## Channel Performance (last 7 days)
- [Channel: CPL | leads | spend | notes]

## AHRI Recommendations
Up to 3 ranked recommendations based on data this week.
Format: [priority] [action] [why — 1 sentence]

## Required Kai Decisions
For each item that needs explicit approval before AHRI can proceed:
- [Item: BUDGET / CONTENT / AVATAR CHANGE / OFFER CHANGE] — [specific decision needed]
```

## Rules

- Brief is informational only — Kai approves or rejects in the 15-minute Monday window
- AHRI never acts on the brief's recommendations without explicit Kai sign-off
- If no A/B test data exists, omit that section
- If queue is empty, say so explicitly — never skip the section
- Budget recommendations always include exact dollar amounts (never a range)
- Any compliance flag found during brief generation → immediate Kai alert, do not wait for Monday

## Kai's 15-minute Monday protocol

1. Open brief at `outputs/anytime-fitness/morning-briefs/[date].md`
2. For each pending asset: approve or reject (move to ready-to-post or archive)
3. For each A/B test: confirm AHRI's winner declaration or override
4. For each budget recommendation: approve exact amount or counter
5. For any required decision: act or defer to next week (note reason)
