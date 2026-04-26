# intelligence-db/paid/ — Paid Media Performance Data

Schema: ad performance data written by Manus tasks after each analysis run.

## Files
- meta-performance.json     — Meta Ads weekly performance (campaigns, ad sets, creatives, A/B results)
- google-performance.json   — Google Ads weekly performance (campaigns, search terms, quality scores)
- pacing-log.json           — Monthly budget pacing status (Meta + Google vs. targets)
- test-results.json         — A/B test outcomes with winner declarations

## Write cadence
meta-performance.json:  Every Wednesday (paid-ads-analyzer Manus task)
google-performance.json: Every Wednesday (google-ads-analyzer Manus task)
pacing-log.json:         Every Monday (budget-pacing-tracker Manus task)

## Read by
AHRI morning brief, AHRI monthly campaign routine, process_manus_results intent handler
