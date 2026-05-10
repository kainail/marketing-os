# Manus Task: Google Keyword Intelligence
# Trigger: Onboarding Step 3B completion
# Output: intelligence-db/{location}/paid/google-keywords.json

## Objective
Research the Google Ads keyword landscape for a new gym location.
Produce a complete keyword intelligence file that AHRI uses to build
the first campaign structure.

## Inputs
- location: city name
- gym_name: official gym name
- target_radius_miles: from onboarding
- primary_keyword_themes: from onboarding

## Research Tasks
1. Seed keyword list — "gym near {city}", "fitness center {city}",
   "30 day fitness {city}", "weight loss gym {city}",
   "women's gym {city}", "{gym_name}"

2. Competitor research — find top 3-5 competing gyms in radius.
   For each competitor: name, website, are they bidding on Google Ads

3. Keyword gap analysis — what keywords are competitors ranking for
   that we should be bidding on

4. CPC benchmarks — average CPC for "gym near me" in this market.
   Fitness industry benchmark: $0.80-$2.50 depending on market size.

5. Search volume estimates — monthly searches for top 10 keywords

6. Recommended ad group structure — group keywords into themes.
   One theme per ad group. 3-5 keywords per group.

7. Negative keyword additions — any location-specific negatives
   beyond the permanent list (e.g., competing city names nearby)

## Output Format
Write results to intelligence-db/{location}/paid/google-keywords.json
following the schema in that file. Set status to "complete".
