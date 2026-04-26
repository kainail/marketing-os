# Paid Media Thresholds — GymSuite AI

## Performance Targets
Target CPL:              $30 or below
Member LTV:              $2,000
Breakeven CPL:           $60 (2x target — kill zone)
ROI at target CPL:
  30% booking rate →    $100/member → 20x ROI
  60% booking rate →    $50/member  → 40x ROI

## Kill Signals (stop spending immediately)
CPL > $60 after $50 minimum test spend
CTR < 0.8% after 1,000 impressions
Frequency > 3.5 (creative fatigue — kill regardless of CPL)
Thumbstop rate < 20% (hook is not stopping the scroll)
Video drop-off before 3 seconds > 80% (first frame wrong)

## Watch Zone (monitor closely, do not scale)
CPL $30–$60 — test new creative before scaling
Frequency 2.5–3.5 — refresh creative, don't kill yet
CTR 0.8%–1.5% — acceptable, room to improve

## Scale Signals (increase budget)
CPL ≤ $30 for 3 consecutive days:
  → Increase daily budget by 20%
  → Log as scale event in intelligence-db/paid/

## Double Down Signals (aggressive scaling)
CPL ≤ $20 for 3 consecutive days:
  → Increase daily budget by 40%
  → Flag for Kai approval if increase > $50/day
  → Log as double-down event

## Winner Declaration (A/B tests)
Minimum spend per variant: $30
Minimum impressions per variant: 1,000
Winner threshold: 25%+ lower CPL after criteria met
Tie rule: within 10% after $60 total → extend 48hrs

## Budget Pacing Rules
Week 1 target: 25% of monthly budget spent
Week 2 target: 50% of monthly budget spent
Week 3 target: 75% of monthly budget spent
Week 4 target: 100% of monthly budget spent
Underpacing alert: >10% below target at weekly check
Overpacing alert: >15% above target at weekly check

## Attribution Windows
Meta: 7-day click, 1-day view (standard)
Google: 30-day click (search), 7-day (display)
Cross-domain: tracked via Railway redirect service
Intake match: phone + email match within 60 days
  of first tracked touch

## Platform Budget Allocation (starting point)
Meta Ads:   $25/day ($750/month)
Google Ads: $20/day ($600/month)
Total:      $45/day ($1,350/month)
Expected leads at $30 CPL: 45/month
Expected bookings at 30%: 13-14/month
