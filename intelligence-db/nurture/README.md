# intelligence-db/nurture/ — GHL Nurture Sequence Performance Data

Schema: GHL nurture sequence performance data from conversation analysis.

## Files
- sequence-performance.json — Per-message reply rates, weak links, booking trigger message
- weak-link-alerts.json     — Messages flagged as dead (<5% reply rate) or weak (50%+ drop from prior)

## Write cadence
sequence-performance.json: Every Sunday (nurture-performance-analyzer Manus task)

## Definitions
Weak link:   Message where reply rate drops 50%+ vs. previous message
Dead message: Message with < 5% reply rate
Booking trigger: Last message received before contact booked a visit

## Read by
AHRI morning brief, nurture-sync skill (uses weak links to guide rewrites),
process_manus_results, monthly-report Manus task
