# intelligence-db/lead-journey/ — Lead Journey & Attribution Data

Schema: full lead journey data from tracking redirect service + GHL contact matching.

## Files
- journey-log.json          — Every click through the tracking redirect (ip_hash, utm, destination, cookies)
- attribution-report.json   — Weekly lead-to-member source attribution with true CPL calculation
- referral-log.json         — Referral-sourced contacts, super-connectors, partnership referrals

## Write cadence
journey-log.json:       Real-time (tracking redirect service fires on every /go request)
attribution-report.json: Every Sunday (lead-journey-tracker Manus task)
referral-log.json:      Every Sunday (referral-tracker Manus task)

## Read by
AHRI morning brief, process_manus_results, weekly-cross-brain-sync
