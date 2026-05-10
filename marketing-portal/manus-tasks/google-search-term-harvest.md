# Manus Task: Google Search Term Harvest
# Trigger: Weekly, every Monday at 7AM
# Output: Decision Layer negative queue + keyword recommendations

## Objective
Pull the search term report from Google Ads, identify wasting terms
and converting terms, and surface recommendations in the Decision Layer.

## Tasks
1. Call GET /api/google-ads/search-terms for each active location
2. Identify wasting terms: 15+ clicks, zero conversions
3. Identify converting terms: 3+ conversions at CPL below target
4. For wasting terms: queue as negative keyword recommendations
5. For converting terms: queue as exact match keyword recommendations
6. Write recommendations to intelligence-db/{location}/paid/google-keywords.json
   under "harvest_recommendations" array
7. Each recommendation: { term, type: 'negative'|'keyword', reason, clicks, conversions, cpl }

## Frequency
Weekly. Run after weekend data is complete.
