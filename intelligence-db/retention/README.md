# intelligence-db/retention/ — Member Retention Early Warning Data

Schema: member retention early warning data from GHL new member check-in tracking.

## Files
- new-member-checkin.json   — Weekly check-in frequency for all members joined in last 30 days
- dropout-alerts.json       — At-risk / high-risk / critical members with re-engagement scripts

## Write cadence
dropout-alerts.json:    Every Wednesday (retention-early-warning Manus task)

## Context
At $2,000 member LTV, each prevented dropout is worth $2,000 retained.
The first 30 days are the highest-risk period. This file catches members
before they mentally quit — early enough to intervene.

## Alert thresholds
AT RISK:   7+ days since last check-in (joined < 30 days ago)
HIGH RISK: 10+ days since last check-in
CRITICAL:  14+ days since check-in — intervention needed today

## Read by
AHRI morning brief, process_manus_results, monthly-report Manus task
