---
skill: workflow-updater
model: claude-sonnet-4-6
type: operational
requires-approval: true
---

# Workflow Updater — Operational Skill

This skill reads an approved nurture-sync package from distribution/queue/ready-to-post/, validates all SMS messages against GHL SMS rules, shows the full update manifest to Kai, and pushes the approved Variant A or B messages to the live GHL workflows when Kai confirms.

## When This Runs

Triggered via AHRI: "Push the script updates to GHL workflows"
Triggered after: nurture-sync skill generates and is approved, and Kai selects A or B variant
Triggered automatically: never — always requires Kai confirmation before pushing live

## Workflow Coverage

This skill updates SMS content in all five GHL workflows:

| Workflow | Name                        | Env Key |
|----------|-----------------------------|---------|
| 1        | Hyperpersonalization Filter | wf1     |
| 2        | Social Archetype Nurture    | wf2     |
| 3        | Analytical Archetype Nurture| wf3     |
| 4        | Supportive Archetype Nurture| wf4     |
| 5        | Independent Archetype Nurture| wf5    |

GHL_WORKFLOW_IDS format in .env:
```
GHL_WORKFLOW_IDS=wf1:abc123,wf2:def456,wf3:ghi789,wf4:jkl012,wf5:mno345
```

[KAI — paste your actual GHL workflow IDs here after going to GHL → Workflows → each workflow → copy the ID from the URL]

## Pre-Flight Checklist

Before pushing to GHL:

1. Confirm nurture-sync package is in ready-to-post/ (approved by Kai)
2. Confirm GHL_API_KEY is set in .env
3. Confirm GHL_WORKFLOW_IDS is set in .env with all 5 workflow IDs
4. Parse the nurture-sync package for the selected variant (A or B)
5. Run validateSmsContent() on every message in the package
6. If any message fails validation — STOP. Show the failures. Do not push partial updates.
7. Show the full update manifest (all workflows, all steps, all char counts)
8. Wait for explicit YES confirmation
9. Push each step via updateWorkflowStep() sequentially — never parallel
10. Log the run to performance/asset-log.csv

## Validation Rules (Applied Before Every Push)

Every message must pass all of these before the push is allowed:

1. Under 306 characters (2-segment hard limit)
2. No em dashes or en dashes — only plain hyphens
3. No emoji
4. All GHL variables properly closed: {{contact.first_name}}, not {{contact.first_name}
5. No bullet points — SMS is conversation, not a list
6. 1-segment goal (under 160 chars) — flag 2-segment messages for Kai awareness

## Protected Message

The following message must NEVER be overwritten. It runs 30 minutes after the first message in every archetype workflow:

"Totally okay if now's not a great time, I just didn't want you to feel like this was one of those 'submit a form and never hear back' situations"

If any proposed update matches this message, reject the push immediately and alert Kai.

## Update Manifest Format

Show this before asking for confirmation:

```
VARIANT [A/B] — UPDATE MANIFEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Workflow 1 › Facebook Ad Opener          [142c · 1-seg] PASS
  2. Workflow 1 › Free Pass Opener            [158c · 1-seg] PASS
  3. Workflow 1 › Lost Join Opener            [287c · 2-seg] PASS
  4. Workflow 2 › Day 0 Evening               [143c · 1-seg] PASS
  5. Workflow 2 › Day 1 Morning               [139c · 1-seg] PASS
  ...
  [N messages total] — all validation passed

  This will overwrite live GHL workflow content.
  Current content will no longer run for new leads entering after push.
  This action cannot be undone from AHRI — revert manually in GHL if needed.
```

## Confirmation Gate

Never push without this exact prompt:

  Type YES to push to GHL workflows >

Accept only "YES". Any other input cancels. No partial pushes. Either all messages pass and all get pushed, or nothing gets pushed.

## Error Handling

- GHL_API_KEY not set: show full manifest with manual implementation instructions and step IDs for each update
- GHL_WORKFLOW_IDS missing: list which workflow IDs are missing and where to find them in GHL
- Any single step fails: log to errors.csv, continue remaining steps, report failures at end
- Validation fails on any message: stop the entire push, show which messages failed and why — never push a partially-valid batch
