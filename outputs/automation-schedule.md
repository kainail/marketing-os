# AHRI Automation Schedule
# Master reference for all automated routines and Manus tasks
# Last updated: 2026-04-25 (Session 14 — v1.7)

---

## Weekly Schedule — Automated Routines

| Day | Time | Routine | Script | What It Does |
|---|---|---|---|---|
| Sunday | 8:00 PM | referral-tracker (Manus) | Hand off `manus-tasks/referral-tracker.md` | Manus finds referral contacts in GHL, identifies VIP referrers, flags unthanked referrers, writes referral-log.json |
| Sunday | 9:00 PM | nurture-performance-analyzer (Manus) | Hand off `manus-tasks/nurture-performance-analyzer.md` | Manus analyzes GHL conversation data, maps reply rates per step, identifies weak/dead messages and booking trigger step, writes sequence-performance.json |
| Sunday | 10:00 PM | lead-journey-tracker (Manus) | Hand off `manus-tasks/lead-journey-tracker.md` | Manus cross-references GHL contacts with journey-log.json, builds source attribution table, calculates true vs. reported CPL, writes attribution-report.json |
| Sunday | 11:00 PM | weekly-cross-brain-sync | `npm run sync-brains` | Reads GymSuite AI Stage Log Google Sheet, calculates archetype/source conversion rates, updates brain-state |
| Monday | 5:45 AM | weekly-media-processing | `npm run analyze-media` | Scans Drive for new photos/videos, analyzes with Claude vision, updates media-index.json |
| Monday | 6:00 AM | competitor-research (Manus) | Hand off `manus-tasks/competitor-research.md` | Manus researches Meta Ad Library + competitor organic content + pricing, updates competitor-ads.json |
| Monday | 6:30 AM | trend-monitoring (Manus) | Hand off `manus-tasks/trend-monitoring.md` | Manus scans Instagram Explore + local Facebook groups, updates hypotheses.json |
| Monday | 7:00 AM | weekly-content | `npm run weekly-content` | Generates 30-piece content calendar using fresh intelligence |
| Monday | 7:00 AM | morning-brief | `npm run morning-brief` | Generates Kai's 15-minute review brief — pending queue, performance pulse, one recommendation |
| Monday | 8:00 AM | budget-pacing-tracker (Manus) | Hand off `manus-tasks/budget-pacing-tracker.md` | Manus checks Meta and Google weekly spend vs. pacing targets, flags over/under spend, writes pacing-log.json |
| Monday | 9:00 AM | review-monitoring (Manus) | Hand off `manus-tasks/review-monitoring.md` | Manus checks all 9 GBP locations + Facebook + Yelp for new reviews, drafts responses, writes review-log.json |
| Wednesday | 8:00 AM | paid-ads-analyzer (Manus) | Hand off `manus-tasks/paid-ads-analyzer.md` | Manus opens Ads Manager, reviews campaign/adset/creative performance, applies kill/scale/double-down logic, writes meta-performance.json |
| Wednesday | 9:00 AM | google-ads-analyzer (Manus) | Hand off `manus-tasks/google-ads-analyzer.md` | Manus reviews search campaigns, search terms, negative keywords, quality scores, writes google-performance.json |
| Wednesday | 10:00 AM | clarity-analyzer (Manus) | Hand off `manus-tasks/clarity-analyzer.md` | Manus reviews heatmaps, click patterns, 5 session recordings, form analytics, writes heatmap-insights.json |
| Wednesday | 11:00 AM | retention-early-warning (Manus) | Hand off `manus-tasks/retention-early-warning.md` | Manus checks new members' check-in recency, flags AT RISK / HIGH RISK / CRITICAL, builds archetype-specific openers, writes dropout-alerts.json |

## Monthly Schedule (First Monday Only)

| Day | Time | Routine | Script | What It Does |
|---|---|---|---|---|
| First Monday | 7:00 AM | monthly-campaign | `npm run monthly-campaign` | Full offer assessment + hook set + ad creative + landing page + budget math + avatar evaluation |
| First Monday | 10:00 AM | crm-hygiene (Manus) | Hand off `manus-tasks/crm-hygiene.md` | Manus audits GHL for untagged leads, inactive contacts, duplicates, pipeline blockages, writes crm-hygiene-report.csv |
| First Monday | 11:00 AM | gbp-optimization (Manus) | Hand off `manus-tasks/gbp-optimization.md` | Manus audits all 9 GBP locations for tracking redirect URLs, stale posts, unanswered Q&As, writes gbp-audit-report.csv |
| First Monday | 12:00 PM | monthly-report (Manus) | Hand off `manus-tasks/monthly-report.md` | Manus reads all intelligence-db/ files and compiles one-page executive report with top 3 decisions, writes YYYY-MM-report.md |

## Triggered (Not Scheduled)

| Trigger | Routine | Script | What It Does |
|---|---|---|---|
| 72h after funnel-updater run | funnel-performance-check | `npm run funnel-check` | Compares pre/post CVR for the funnel copy update, logs to test-results.csv, briefs Kai |
| Kai uploads new media batch | weekly-media-processing | `npm run analyze-media` | Same as Monday run but triggered on-demand |
| Manus task approved by Kai | content-posting | Hand off `manus-tasks/content-posting.md` | Manus posts approved content from ready-to-post/ to Facebook, Instagram, GBP |

---

## Execution Order (Sunday–Monday Chain — why it matters)

The Sunday–Monday sequence is order-dependent. Each step feeds the next:

```
Sunday 8pm  → referral-tracker (Manus)
                ↓ (referral-log.json updated)
Sunday 9pm  → nurture-performance-analyzer (Manus)
                ↓ (sequence-performance.json updated)
Sunday 10pm → lead-journey-tracker (Manus)
                ↓ (attribution-report.json updated — reads paid performance from Wed)
Sunday 11pm → cross-brain-sync
                ↓ (archetype performance written to intelligence-db/cross-brain/)
Monday 5:45am → weekly-media-processing
                ↓ (media-index.json updated in Drive)
Monday 6:00am → competitor-research (Manus)
                ↓ (competitor-ads.json updated)
Monday 6:30am → trend-monitoring (Manus)
                ↓ (hypotheses.json updated)
Monday 7:00am → weekly-content + morning-brief
                ↓ (reads all intelligence sources above)
Monday 8:00am → budget-pacing-tracker (Manus)
                ↓ (pacing-log.json updated)
Monday 9:00am → review-monitoring (Manus)
                ↓ (review-log.json updated)
```

## Execution Order (Wednesday Chain)

```
Wednesday 8:00am → paid-ads-analyzer (Manus)
                     ↓ (meta-performance.json written)
Wednesday 9:00am → google-ads-analyzer (Manus)
                     ↓ (google-performance.json written)
Wednesday 10:00am → clarity-analyzer (Manus)
                      ↓ (heatmap-insights.json written — correlates with ad traffic from above)
Wednesday 11:00am → retention-early-warning (Manus)
                      ↓ (dropout-alerts.json written — early enough to act before weekend)
```

## Execution Order (First Monday of Month — additions)

```
[After Monday 9:00am review-monitoring]
First Monday 10:00am → crm-hygiene (Manus)
                         ↓ (crm-hygiene-report.csv written)
First Monday 11:00am → gbp-optimization (Manus)
                         ↓ (gbp-audit-report.csv written — checks tracking redirect coverage)
First Monday 12:00pm → monthly-report (Manus)
                         ↓ (reads ALL intelligence-db/ files — must run last)
                         → outputs/anytime-fitness/monthly-reports/YYYY-MM-report.md
```

If any step fails, the next step still runs but notes the missing data. AHRI never cascades a failure across the whole chain.

---

## Intelligence File Map

Each Manus task writes to a specific intelligence file. AHRI reads these files when generating content, briefs, and recommendations.

| Manus Task | Output File | Read By |
|---|---|---|
| paid-ads-analyzer | `intelligence-db/paid/meta-performance.json` | lead-journey-tracker, monthly-report, morning-brief |
| google-ads-analyzer | `intelligence-db/paid/google-performance.json` | lead-journey-tracker, monthly-report |
| budget-pacing-tracker | `intelligence-db/paid/pacing-log.json` | morning-brief, monthly-report |
| lead-journey-tracker | `intelligence-db/lead-journey/attribution-report.json` | morning-brief, monthly-report |
| clarity-analyzer | `intelligence-db/clarity/heatmap-insights.json` | landing-page skill, monthly-report |
| nurture-performance-analyzer | `intelligence-db/nurture/sequence-performance.json` | nurture-sync skill, monthly-report |
| retention-early-warning | `intelligence-db/retention/dropout-alerts.json` | morning-brief, monthly-report |
| review-monitoring | `intelligence-db/market/review-log.json` | morning-brief, monthly-report |
| referral-tracker | `intelligence-db/market/referral-log.json` | morning-brief, monthly-report |
| gbp-optimization | `intelligence-db/market/gbp-audit-report.csv` | monthly-report |
| crm-hygiene | `intelligence-db/crm/crm-hygiene-report.csv` | monthly-report |
| monthly-report | `outputs/anytime-fitness/monthly-reports/YYYY-MM-report.md` | Kai executive review |
| competitor-research | `intelligence-db/market/competitor-ads.json` | offer-machine, monthly-report |
| trend-monitoring | `intelligence-db/patterns/hypotheses.json` | content-calendar, morning-brief |

---

## Infrastructure (Always Running)

### Tracking Redirect Service
- **Location:** `tracking-redirect/` — separate Railway deployment
- **URL:** `https://[tracking-redirect-domain]/go`
- **What it does:** Fires Facebook CAPI async (< 100ms), logs first-party visit events to `journey-log.json`, sets 4 tracking cookies, 301 redirects to destination
- **Feeds:** `intelligence-db/lead-journey/journey-log.json` (read by lead-journey-tracker)
- **Required env vars:** `META_PIXEL_ID`, `META_CAPI_TOKEN`, `REPORT_KEY`
- **Health check:** `GET /health` → 200 OK

### Microsoft Clarity (Landing Page)
- **Installed on:** `landing-server/` Railway deployment
- **What it does:** Heatmaps, scroll depth, session recordings, rage click detection
- **Required env var:** `CLARITY_PROJECT_ID` (on landing-server)
- **Read by:** clarity-analyzer Manus task (Wednesday 10am)

### GBP Tracking Links
- All 9 GBP location website fields must point to tracking redirect, not AF.com direct
- Format: `https://[tracking-redirect-domain]/go?utm_source=gbp&utm_medium=organic&utm_content=[location-slug]`
- Verified monthly by gbp-optimization Manus task

---

## Credentials Required

### All routines
```
ANTHROPIC_API_KEY=                    # Required for all AI generation
```

### weekly-cross-brain-sync + weekly-media-processing
```
GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID=   # GymSuite AI Stage Log sheet ID
GOOGLE_DRIVE_MEDIA_FOLDER_ID=         # Drive folder ID
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=   # Service account email
GOOGLE_DRIVE_PRIVATE_KEY=             # Service account private key
```

### GHL-dependent Manus tasks (lead-journey-tracker, retention-early-warning, crm-hygiene, referral-tracker, nurture-performance-analyzer)
```
GHL_API_KEY=                          # GHL Bearer token (needs regenerating — see Session 13)
GHL_LOCATION_ID=                      # GHL location ID
```

### Tracking redirect service
```
META_PIXEL_ID=                        # Facebook Pixel ID
META_CAPI_TOKEN=                      # Facebook CAPI access token
REPORT_KEY=                           # Secret key for /report endpoint
```

### Microsoft Clarity (landing-server)
```
CLARITY_PROJECT_ID=                   # From clarity.microsoft.com project settings
```

### funnel-performance-check
```
GHL_FUNNEL_PAGE_ID=                   # Funnel page being tracked
```

---

## Manual Triggers (AHRI terminal commands)

From the AHRI terminal (`npm run ahri`), Kai can trigger any task on-demand:

| What to type | What happens |
|---|---|
| `show routines` | Lists all routines and Manus tasks with file status |
| `run morning brief` | Triggers morning-brief routine immediately |
| `run weekly content` | Triggers weekly-content routine immediately |
| `run monthly campaign` | Triggers monthly-campaign routine immediately |
| `run cross brain sync` | Triggers cross-brain-sync (`npm run sync-brains`) |
| `analyze paid ads` | Displays paid-ads-analyzer.md for Manus to follow |
| `analyze google ads` | Displays google-ads-analyzer.md for Manus to follow |
| `check budget pacing` | Displays budget-pacing-tracker.md for Manus to follow |
| `track lead journey` | Displays lead-journey-tracker.md for Manus to follow |
| `analyze landing page` | Displays clarity-analyzer.md for Manus to follow |
| `analyze nurture` | Displays nurture-performance-analyzer.md for Manus to follow |
| `check retention` | Displays retention-early-warning.md for Manus to follow |
| `monitor reviews` | Displays review-monitoring.md for Manus to follow |
| `track referrals` | Displays referral-tracker.md for Manus to follow |
| `audit GBP` | Displays gbp-optimization.md for Manus to follow |
| `clean CRM` | Displays crm-hygiene.md for Manus to follow |
| `monthly report` | Displays monthly-report.md for Manus to follow |
| `intelligence summary` | AHRI reads all intelligence-db/ files and briefs you on top actions |
| `run manus content posting` | Displays content-posting.md for Manus to follow |
| `run manus competitor research` | Displays competitor-research.md for Manus to follow |

---

## Output Files

| Routine | Output Location |
|---|---|
| morning-brief | `outputs/anytime-fitness/morning-briefs/YYYY-MM-DD-morning-brief.md` |
| weekly-content | `outputs/anytime-fitness/content-calendars/YYYY-MM-DD-content-calendar.md` |
| monthly-campaign | `outputs/anytime-fitness/campaigns/YYYY-MM-campaign-package.md` |
| monthly-report (Manus) | `outputs/anytime-fitness/monthly-reports/YYYY-MM-report.md` |
| funnel-performance-check | `distribution/queue/pending-review/funnel-check-[date].md` |
| weekly-cross-brain-sync | `intelligence-db/cross-brain/*.json` + `brain-state/current-state.md` |
| weekly-media-processing | Drive: `media-index.json`, `shot-list.md` |
| content-posting (Manus) | `distribution/queue/posted/posting-log-[date].md` |
| competitor-research (Manus) | `intelligence-db/market/competitor-ads.json` |
| trend-monitoring (Manus) | `intelligence-db/patterns/hypotheses.json` |
| paid-ads-analyzer (Manus) | `intelligence-db/paid/meta-performance.json` |
| google-ads-analyzer (Manus) | `intelligence-db/paid/google-performance.json` |
| budget-pacing-tracker (Manus) | `intelligence-db/paid/pacing-log.json` |
| lead-journey-tracker (Manus) | `intelligence-db/lead-journey/attribution-report.json` |
| clarity-analyzer (Manus) | `intelligence-db/clarity/heatmap-insights.json` |
| nurture-performance-analyzer (Manus) | `intelligence-db/nurture/sequence-performance.json` |
| retention-early-warning (Manus) | `intelligence-db/retention/dropout-alerts.json` |
| review-monitoring (Manus) | `intelligence-db/market/review-log.json` |
| referral-tracker (Manus) | `intelligence-db/market/referral-log.json` |
| gbp-optimization (Manus) | `intelligence-db/market/gbp-audit-report.csv` |
| crm-hygiene (Manus) | `intelligence-db/crm/crm-hygiene-report.csv` |

---

## Failure Handling

Every routine is designed to fail gracefully:

- **Partial data:** Writes whatever was generated, notes what is missing, continues
- **API failure:** Logs to `logs/errors.csv`, alerts Kai in next morning brief
- **Missing credentials:** Returns empty/placeholder output, does not crash, logs the skip reason
- **One piece fails in batch:** `Promise.allSettled` — other pieces complete normally
- **Manus task Step 0 fails:** STOP and log error — never proceed to data steps without verified account access

**To check for errors after any run:**
```bash
cat logs/errors.csv
```

---

## Troubleshooting

**Morning brief shows no performance data:**
→ `performance/channel-performance.csv` may be empty. Populate manually from ad platform dashboards or wait for first full month of ad spend.

**Weekly content has no real photos:**
→ Google Drive credentials are not set or Drive folder ID is missing. Set `GOOGLE_DRIVE_MEDIA_FOLDER_ID` in .env.

**Cross-brain sync shows 0% booking rate:**
→ Share the GymSuite AI Stage Log sheet with `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`.

**lead-journey-tracker shows 0% tracking coverage:**
→ Tracking redirect is not deployed or GBP links have not been updated to use tracking redirect URLs. Check tracking-redirect/ Railway deployment status.

**Clarity analyzer has no data:**
→ `CLARITY_PROJECT_ID` env var is not set on landing-server Railway deployment. Create project at clarity.microsoft.com and add the project ID.

**retention-early-warning shows no new members:**
→ Check-in data may not be tagged in GHL. Manus needs a check-in tag or last-activity field to calculate days since last check-in.

**GBP audit shows 0/9 tracking links:**
→ All 9 GBP location website fields still point to AF.com directly. Update each location's website field to use the tracking redirect URL format.

**GHL API errors in any Manus task:**
→ GHL API key needs regenerating (known issue from Session 13). Kai must generate new key in GHL → Settings → API Keys.
