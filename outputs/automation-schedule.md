# AHRI Automation Schedule
# Master reference for all automated routines and Manus tasks
# Last updated: 2026-04-25

---

## Weekly Schedule

| Day | Time | Routine | Script | What It Does |
|---|---|---|---|---|
| Monday | 5:45 AM | weekly-media-processing | `npm run analyze-media` | Scans Drive for new photos/videos, analyzes with Claude vision, updates media-index.json, generates shot list gaps |
| Monday | 6:00 AM | competitor-research (Manus) | Hand off `manus-tasks/competitor-research.md` | Manus researches Meta Ad Library + competitor organic content, updates competitor-ads.json |
| Monday | 6:30 AM | trend-monitoring (Manus) | Hand off `manus-tasks/trend-monitoring.md` | Manus scans Instagram Explore + local Facebook groups, updates hypotheses.json |
| Monday | 7:00 AM | weekly-content | `npm run weekly-content` | Generates 30-piece content calendar using fresh intelligence from previous 3 runs |
| Monday | 7:00 AM | morning-brief | `npm run morning-brief` | Generates Kai's 15-minute review brief — pending queue, performance pulse, one recommendation |
| Sunday | 11:00 PM | weekly-cross-brain-sync | `npm run sync-brains` | Reads GymSuite AI Stage Log Google Sheet, calculates archetype/source conversion rates, updates brain-state |

## Monthly Schedule (First Monday Only)

| Day | Time | Routine | Script | What It Does |
|---|---|---|---|---|
| First Monday | 7:00 AM | monthly-campaign | `npm run monthly-campaign` | Full offer assessment + hook set + ad creative + landing page + budget math + avatar evaluation |

## Triggered (Not Scheduled)

| Trigger | Routine | Script | What It Does |
|---|---|---|---|
| 72h after funnel-updater run | funnel-performance-check | `npm run funnel-check` | Compares pre/post CVR for the funnel copy update, logs to test-results.csv, briefs Kai |
| Kai uploads new media batch | weekly-media-processing | `npm run analyze-media` | Same as Monday run but triggered on-demand |
| Manus task approved by Kai | content-posting | Hand off `manus-tasks/content-posting.md` | Manus posts approved content from ready-to-post/ to Facebook, Instagram, GBP |

---

## Execution Order (Monday — why it matters)

The Monday sequence is order-dependent. Each step feeds the next:

```
Sunday 11pm → cross-brain-sync
                ↓ (archetype performance written to intelligence-db/)
Monday 5:45am → weekly-media-processing
                ↓ (media-index.json updated in Drive)
Monday 6:00am → competitor-research (Manus)
                ↓ (competitor-ads.json updated)
Monday 6:30am → trend-monitoring (Manus)
                ↓ (hypotheses.json updated)
Monday 7:00am → weekly-content
                ↓ (reads all 4 intelligence sources above)
Monday 7:00am → morning-brief
                ↓ (reads the content calendar + brain-state + asset-log)
```

If any step fails, the next step still runs but notes the missing data. AHRI never cascades a failure across the whole Monday sequence.

---

## Credentials Required

Each routine requires the following `.env` variables to be set:

### All routines
```
ANTHROPIC_API_KEY=                    # Required for all AI generation
```

### weekly-cross-brain-sync + weekly-media-processing
```
GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID=   # GymSuite AI Stage Log sheet ID
GOOGLE_DRIVE_MEDIA_FOLDER_ID=         # Drive folder containing raw/ approved/ releases/
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=   # Service account email
GOOGLE_DRIVE_PRIVATE_KEY=             # Service account private key
```

### funnel-performance-check
```
GHL_API_KEY=                          # GHL Bearer token
GHL_LOCATION_ID=                      # GHL location ID
GHL_FUNNEL_PAGE_ID=                   # Funnel page being tracked
```

**Check credentials are set before first Monday run:**
```bash
npm run check-env
```
(If this script doesn't exist yet, manually verify each variable in .env is populated.)

---

## Manual Triggers (AHRI terminal commands)

From the AHRI terminal (`npm run ahri`), Kai can trigger any routine on-demand:

| What to type | What happens |
|---|---|
| `show routines` | Lists all routines, their schedule, and whether the file exists |
| `run morning brief` | Triggers morning-brief routine immediately |
| `run weekly content` | Triggers weekly-content routine immediately |
| `run monthly campaign` | Triggers monthly-campaign routine immediately |
| `run cross brain sync` | Triggers cross-brain-sync (= `npm run sync-brains`) |
| `run manus content posting` | Displays content-posting.md for Manus to follow |
| `run manus competitor research` | Displays competitor-research.md for Manus to follow |
| `run manus trend monitoring` | Displays trend-monitoring.md for Manus to follow |

---

## Output Files

Each routine writes to a predictable location:

| Routine | Output location |
|---|---|
| morning-brief | `outputs/anytime-fitness/morning-briefs/YYYY-MM-DD-morning-brief.md` |
| weekly-content | `outputs/anytime-fitness/content-calendars/YYYY-MM-DD-content-calendar.md` |
| monthly-campaign | `outputs/anytime-fitness/campaigns/YYYY-MM-campaign-package.md` |
| funnel-performance-check | `distribution/queue/pending-review/funnel-check-[date].md` |
| weekly-cross-brain-sync | `intelligence-db/cross-brain/*.json` + `brain-state/current-state.md` |
| weekly-media-processing | Drive: `media-index.json`, `shot-list.md`, `approved/` subfolder |
| content-posting (Manus) | `distribution/queue/posted/posting-log-[date].md` |
| competitor-research (Manus) | `intelligence-db/market/competitor-ads.json` |
| trend-monitoring (Manus) | `intelligence-db/patterns/hypotheses.json` |

---

## Failure Handling

Every routine is designed to fail gracefully:

- **Partial data:** Writes whatever was generated, notes what is missing, continues
- **API failure:** Logs to `logs/errors.csv` (timestamp, operation, model, error, resolved: false), alerts Kai in next morning brief
- **Missing credentials:** Returns empty/placeholder output, does not crash, logs the skip reason
- **One piece fails in batch:** `Promise.allSettled` — other pieces complete normally

**To check for errors after any run:**
```bash
cat logs/errors.csv
```

---

## Troubleshooting

**Morning brief shows no performance data:**
→ `performance/channel-performance.csv` may be empty. Populate manually from ad platform dashboards or wait for first full month of ad spend.

**Weekly content has no real photos:**
→ Google Drive credentials are not set or Drive folder ID is missing. Set `GOOGLE_DRIVE_MEDIA_FOLDER_ID` in .env and run `npm run analyze-media`.

**Cross-brain sync shows 0% booking rate across all archetypes:**
→ The Stage Log may not have the service account added as a viewer. Share the sheet with `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`.

**Manus task says "MANUS BLOCKED — personal account":**
→ Kai must manually log into the gym's Facebook/Instagram/GBP before handing off the task to Manus.

**GHL funnel check returns "metrics unavailable":**
→ The GHL Analytics API may require a specific scope. Verify the API key has analytics read access in GHL settings.
