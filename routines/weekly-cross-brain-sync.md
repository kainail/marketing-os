# Weekly Cross-Brain Sync Routine

**Schedule:** Every Sunday at 11:00 PM
**Trigger:** Automated — no Kai input required
**Engine:** engine/cross-brain-sync.ts
**Script:** npm run sync-brains

---

## Purpose

Reads the GymSuite AI Stage Log Google Sheet — the live record of every lead who has moved through the nurture system — and calculates conversion rates by archetype and lead source. Writes the results to intelligence-db/cross-brain/ and updates brain-state/current-state.md with the latest insights. This is the self-improvement loop: AHRI sees what actually converted, updates her intelligence, and generates better content next week.

This runs Sunday night so the Monday 7 AM content calendar generation has fresh cross-brain data to guide avatar selection, hook choice, and offer emphasis.

---

## What It Does — Step by Step

**1. Read the Stage Log**
Reads the GymSuite AI Stage Log Google Sheet via the Sheets API (GOOGLE_SHEETS_GYMSUITE_ID). The Stage Log contains one row per lead with columns for: archetype, lead source, booking status, show status, conversion status, and lead date.

The column names are detected dynamically — the sync is resilient to minor changes in column naming as long as the column contains one of the expected name variants.

**2. Calculate archetype performance**
Groups leads by archetype (social, analytical, supportive, independent). For each archetype:
- Booking rate: leads who booked / total leads (as %)
- Show rate: leads who showed / leads who booked (as %)
- Conversion rate: leads who converted / leads who showed (as %)
- Total leads, bookings, shows, conversions (raw counts)

**3. Calculate source performance**
Groups leads by lead source (facebook_cold, instagram_warm, google_search, referral, free_pass, lost_join). Same metrics per source.

**4. Generate insights**
Sends the performance data to claude-opus-4-6 with a prompt to generate 3–5 actionable insights. Examples:
- "Social archetype is booking at 3× the rate of Independent — consider weighting content toward community themes next week"
- "Google Search leads are converting at 2× Facebook cold — consider shifting 15% of Meta budget to Google"
- "Free pass leads show at the highest rate but book at the lowest — the issue is getting them to book, not to show"

**5. Write to intelligence-db/cross-brain/**
Updates three files:
- `archetype-performance.json` — full archetype conversion metrics + insights
- `hook-to-conversion.json` — source performance data (pipeline: from hook source to conversion)
- `offer-to-ltv.json` — offer attribution data (which leads on which offer sources converted)

**6. Update brain-state/current-state.md**
Replaces the ## Cross-Brain Insights section with the latest 3–5 insights. These insights are visible in the AHRI status display and inform every skill that reads brain state.

**7. Log the sync**
Appends a row to performance/asset-log.csv with sync timestamp, rows processed, and whether insights were generated.

---

## Required .env Variables

```
GOOGLE_SHEETS_GYMSUITE_ID=          # Google Sheets ID of the GymSuite AI Stage Log
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL= # service account email (same as Drive auth)
GOOGLE_DRIVE_PRIVATE_KEY=           # service account private key
ANTHROPIC_API_KEY=                  # for claude-opus-4-6 insight generation
```

---

## Failure Behavior

- GOOGLE_SHEETS_GYMSUITE_ID not set: writes placeholder JSONs to intelligence-db/cross-brain/ with explanatory insights telling AHRI what data is missing. Logs `success: false`. Does not crash.
- Sheets API auth fails: logs to errors.csv, alerts Kai, writes last-known data to brain state. The previous week's insights remain active.
- No rows in Stage Log: writes metrics with all zeros, generates the insight "Stage Log has no data yet — share the GymSuite AI service account email with the GymSuite AI sheet to begin receiving cross-brain data."
- Insight generation fails (API error): logs the error, skips the insight block, writes raw metrics only. The metrics are still valuable without AI-generated narrative.
- Individual cell parse errors: logs which rows failed to parse, continues processing valid rows. Never lets a malformed row block the entire sync.

---

## Column Name Detection

The sync looks for these column name variants (case-insensitive):

| Data Field   | Accepted Column Names                           |
|--------------|------------------------------------------------|
| Archetype    | archetype, type, lead_type, persona            |
| Lead Source  | source, lead_source, channel, origin           |
| Booking      | booked, booking, booking_status, appointment   |
| Show         | showed, show, show_status, attended            |
| Conversion   | converted, joined, conversion, member          |
| Lead Date    | date, lead_date, created, created_at           |

[KAI — if your Stage Log uses different column names, add them to the arrays in cross-brain-sync.ts colIndex().]

---

## Archetype Mapping

Leads are grouped into four archetypes based on the value in the archetype column:

| Archetype    | Matched Values                                          |
|--------------|---------------------------------------------------------|
| Social       | social, s, community, outgoing                          |
| Analytical   | analytical, a, data, detail, thinker                    |
| Supportive   | supportive, b, support, nurture, caring                 |
| Independent  | independent, d, solo, autonomous, self-directed         |

---

## Source Mapping

Lead sources map to these channels:

| Channel         | Matched Values                                   |
|-----------------|--------------------------------------------------|
| facebook_cold   | facebook, fb, meta, cold, cold_facebook          |
| instagram_warm  | instagram, ig, warm, instagram_warm              |
| google_search   | google, search, google_search, sem               |
| referral        | referral, ref, referred, word_of_mouth           |
| free_pass       | free_pass, free, pass, guest_pass                |
| lost_join       | lost_join, lost, cancel, churn                   |

---

## Integration with Other Routines

The Monday 7 AM weekly-content routine reads intelligence-db/cross-brain/archetype-performance.json before generating the content calendar. If Social archetype is outperforming, the content calendar will weight social proof hooks. If Google Search leads are converting better, the content calendar will include more SEO-adjacent content.

The offer-machine (first Monday of month) reads offer-to-ltv.json before recommending next month's offer. Offers with higher lifetime value per lead receive higher weight in the recommendation.

AHRI reports the top 3 cross-brain insights in her weekly brief to Kai every Monday.
