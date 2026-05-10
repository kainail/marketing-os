# Manus Task: Google Search Term Harvest
**Trigger:** Weekly — every Monday at 7:00 AM
**Estimated time:** 15-20 minutes
**Output:** Decision Layer negative queue + keyword recommendations

## Objective
Pull the search term report from Google Ads via the AHRI Marketing OS API,
identify wasting terms and converting terms, and surface recommendations
in the Decision Layer for one-click action.

## Prerequisite
Google Ads API must be connected and campaigns must be active.
If API returns no data, log "no_data" and exit gracefully.

## Tasks

### 1. Pull Search Term Report
Call GET /api/google-ads/search-terms?location={location}
This returns all search terms that triggered ads in the past 7 days.

### 2. Identify Wasting Terms
Flag any term where:
- Clicks >= 15 AND conversions = 0
These are burning budget with zero return. Queue as negative keywords.

### 3. Identify Converting Terms
Flag any term where:
- Conversions >= 3 AND CPL <= target CPL
These are proven performers. Queue as exact match keyword additions.

### 4. Build Recommendations
For each wasting term:
{ term, type: "negative", reason: "X clicks, 0 conversions", clicks, conversions, cpl: null }

For each converting term:
{ term, type: "keyword", reason: "X conversions at $Y CPL", clicks, conversions, cpl }

### 5. Write Output
Append recommendations to intelligence-db/{location}/paid/google-keywords.json
under "harvest_recommendations" array. Do not overwrite existing recommendations —
append only.

### 6. Summary
Log a summary: X wasting terms found, Y converting terms found,
written to keywords file.

## Frequency
Weekly. Run Monday morning after weekend data is complete.
Weekend typically brings highest search volume for fitness keywords.
