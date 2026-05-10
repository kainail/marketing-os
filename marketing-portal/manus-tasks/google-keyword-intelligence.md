# Manus Task: Google Keyword Intelligence
**Trigger:** On-demand — run at onboarding Step 3B completion
**Estimated time:** 25-30 minutes
**Output:** intelligence-db/{location}/paid/google-keywords.json

## Objective
Research the Google Ads keyword landscape for a new gym location.
Produce a complete keyword intelligence file that AHRI uses to build
the first campaign structure. This is pure web research — no Google
Ads API access required.

## Inputs
- location: city name (e.g. Bloomington, IL)
- gym_name: official gym name (e.g. Anytime Fitness Bloomington)
- target_radius_miles: from onboarding
- primary_keyword_themes: from onboarding

## Research Tasks

### 1. Seed Keyword List
Build the core keyword list for this location:
- "gym near me"
- "gym near {city}"
- "fitness center {city}"
- "fitness center near me"
- "30 day fitness challenge {city}"
- "weight loss gym {city}"
- "women's gym {city}"
- "{gym_name}"
- "anytime fitness {city}"
- "24 hour gym {city}"

### 2. Competitor Research
Find the top 3-5 competing gyms within the target radius.
For each competitor document:
- Gym name
- Website URL
- Are they running Google Ads? (search their name and primary keywords)
- What ad copy are they using?
- What keywords are they likely targeting?

### 3. Keyword Gap Analysis
Based on competitor research, identify keywords competitors are
targeting that we should also bid on. Look for gaps — keywords
with decent volume that competitors are missing.

### 4. CPC Benchmarks
Research average CPC for fitness keywords in this specific market.
Fitness industry benchmarks:
- Small market (under 50k population): $0.80-$1.20
- Medium market (50k-200k): $1.20-$1.80
- Large market (200k+): $1.80-$2.50
Bloomington IL population ~80k — expect $1.20-$1.60 CPC range.

### 5. Search Volume Estimates
Estimate monthly search volume for top 10 keywords in this market.
Use Google Trends data and industry benchmarks to estimate.

### 6. Recommended Ad Group Structure
Group all keywords into tightly themed ad groups.
One theme per ad group. 3-5 keywords per group.
Example structure:
- Ad Group: Gym Near Me → gym near me, gym near me open now, fitness center near me
- Ad Group: 30 Day Challenge → 30 day fitness challenge, 30 day gym trial, 30 day kickstart
- Ad Group: Weight Loss → weight loss gym, gym for weight loss, fitness for weight loss
- Ad Group: Women's Fitness → women's gym, ladies fitness center, gym for women
- Ad Group: Branded → {gym_name}, anytime fitness {city}

### 7. Location-Specific Negatives
Identify any negatives specific to this market beyond the permanent list:
- Nearby city names (if people search for gyms in neighboring cities)
- Local competitor names (if running non-conquest campaigns)
- Any local slang or terminology to exclude

## Output Format
Return a JSON object with this exact structure:
{
  "location": "{city}",
  "generated": "{date}",
  "status": "complete",
  "seed_keywords": [],
  "competitor_research": [],
  "keyword_gap": [],
  "cpc_benchmarks": { "low": 0.00, "high": 0.00, "expected_avg": 0.00 },
  "search_volume_estimates": [],
  "recommended_ad_groups": [
    {
      "theme": "Ad Group Name",
      "keywords": [],
      "match_types": {},
      "suggested_headlines": []
    }
  ],
  "location_specific_negatives": []
}

Write this to intelligence-db/{location}/paid/google-keywords.json
