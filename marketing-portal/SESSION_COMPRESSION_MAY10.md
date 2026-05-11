# GymSuite AI — Session Compression
# Date: May 10, 2026
# Portal: marketing-os-production-2b85.up.railway.app
# Landing: no-risk-comeback-landing-page-production.up.railway.app

## What Was Built This Session

### Marketing OS — New Features
- Meta token expiry banner (orange/red based on days remaining)
- Monthly goal tracker on Overview (CPL, leads, spend, members)
- Attribution tab wired to real data — Lead Journey by Campaign + Match Rate Analysis
- Nurture & Retention fully rebuilt — sequence health, pipeline drop-off, SMS intelligence
- Creative Performance section in Hook Library
- Google Ads full dashboard page — 7 KPIs, campaigns, keywords, search terms, RSA, pacing, AHRI recommendation
- Google Ads nav item enabled in sidebar

### Google Ads Agentic System
- services/googleAds.js — 12-method GoogleAdsService class
- 11 new API routes (lines 5357-5599 in server.js)
- Daily 6AM cron sync job
- Decision Layer — 4 Google Ads cards (Campaign Builder, Conversion Tracking, Keyword Intelligence, Negative Queue)
- Manus tasks: google-keyword-intelligence.md + google-search-term-harvest.md
- Both Manus tasks added to Agent Tasks UI (on-demand + weekly buckets)
- Both tasks auto-fire at onboarding session completion (setImmediate block)
- SKILL.md — skills/google-ads-agent/SKILL.md
- BUILD_SPEC.md — GOOGLE_ADS_BUILD_SPEC.md

### Onboarding Improvements
- Railway checklist enriched — descriptions, format hints, direct GET links per credential
- Google Ads section added to checklist with separator
- MCC ID added as shared credential
- OAuth Playground instruction on Refresh Token row
- doOps bug fixed — portal vars always render regardless of tier
- State bug fixed — hidden input now populated from session data
- dismissRailwayChecklist fixed — correct DOM selector
- Keyword Intelligence auto-fires at session completion
- Paid Ads Setup auto-fires at session completion
- Google Ads keyword confirmation step added to provision flow

### Agent Tasks (renamed from Manus Tasks)
- UI label changed from "Manus Tasks" to "Agent Tasks"
- Header changed to "Agent Intelligence Tasks"
- google-keyword-intelligence added to on-demand bucket
- google-search-term-harvest added to weekly bucket
- Launch auth header fixed

### Landing Server
- GTM-PS8DPLLB installed on testimonials.html (head + body)

## Credentials Added to Railway (Marketing OS)
- GOOGLE_ADS_CLIENT_ID
- GOOGLE_ADS_CLIENT_SECRET
- GOOGLE_ADS_REFRESH_TOKEN_BLOOMINGTON
- GOOGLE_ADS_CUSTOMER_ID_BLOOMINGTON=9417041648
- GOOGLE_ADS_MANAGER_CUSTOMER_ID=4178630195
- GOOGLE_ADS_DEVELOPER_TOKEN (pending Basic Access approval)

## Google Ads Account Setup
- Manager Account: GymSuiteAI — 417-863-0195
- Client Account: Anytime Fitness Bloomington — 941-704-1648
- Accounts linked in MCC
- OAuth credentials under afanytimefitnessgyms@gmail.com
- Basic Access application submitted — pending Google approval (1-3 days)
- GTM Container: GTM-PS8DPLLB — installed on testimonial page

## Pending (external)
- Google Ads Developer Token Basic Access — submitted, awaiting approval
- Facebook Pixel ID — collect at first club launch
- Meta live data connection — at first club launch
- Google Ads API live connection — after token approved

## At Bloomington Launch (one session)
1. Connect Meta live data (CPL, spend, reach, frequency)
2. Add Facebook Pixel ID to testimonial page
3. Activate Google Ads API connection
4. Run Manus keyword intelligence for Bloomington
5. Create conversion action in Google Ads
6. Verify GTM firing on testimonial page
7. Flip campaigns PAUSED → ACTIVE

## Key Values
- GTM Container ID: GTM-PS8DPLLB
- Google Ads MCC: 417-863-0195 (GymSuiteAI)
- Google Ads Bloomington Customer ID: 941-704-1648
- Meta token expires: May 29, 2026
- Analytics API Key: ahri_ak_mKz9xQpR7wN2vL4sJtY8bFhD3gCeXuA6
- OPS Provision Key: ops_pk_7xK3mN9qT2vW4bL5sX8hD2cPjAeRg6F
- Clarity Project ID: wnuv63irsu
- Bloomington Club ID: 2822

## Commits This Session
- cf108ad — backend routes + frontend additions
- d6aac29 — Google Ads agentic system full build
- ab46c56 — fix Google Ads login-customer-id header
- 9503a38 — fix Manus task metadata + expand specs
- (landing server) — GTM installed on testimonials.html
