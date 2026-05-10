# Google Ads Agentic System — Build Spec
# GymSuite AI — Created: May 2026

## Overview
Full agentic Google Ads system integrated into AHRI Marketing OS.
Runs parallel to Meta system. Both channels feed into GHL and report
into the Marketing OS dashboard. Read skills/google-ads-agent/SKILL.md
before any Google Ads work.

---

## Build Order

### Phase 1 — Foundation
- [ ] Google Ads API connection — OAuth, Customer ID, Developer Token
- [ ] Add Google Ads credentials to onboarding Step 3B
- [ ] Google Ads env vars in Railway per location
- [ ] Conversion tracking — GTM tags, thank-you page trigger, call tracking
- [ ] GHL → Google Ads offline conversion import via webhook

### Phase 2 — Intelligence (fires during onboarding)
- [ ] Manus task: keyword intelligence — seed keywords, competitor gap, CPC benchmarks, search volume by city
- [ ] Manus task: negative keyword seed list — employment, free intent, DIY, wrong location
- [ ] Manus task: competitor ad presence score for that market
- [ ] Output writes to intelligence-db/{location}/paid/google-keywords.json

### Phase 3 — Campaign Creation Engine
- [ ] AHRI generates campaign structure from keyword intelligence output
- [ ] Campaign types: Non-Branded Search, Branded Search, Remarketing Display
- [ ] Ad group structure: one theme per group, 3-5 keywords each
- [ ] Decision Layer: show proposed structure for Kai approval before creation
- [ ] POST /api/google-ads/create-campaign — creates campaign PAUSED via API
- [ ] POST /api/google-ads/create-ad-group — creates ad groups within campaign
- [ ] POST /api/google-ads/add-keywords — adds keywords to each ad group
- [ ] Campaign confirmation writes to intelligence-db/{location}/paid/google-performance.json

### Phase 4 — RSA Copy Engine
- [ ] AHRI generates 15 headlines per ad group across 6 categories
- [ ] AHRI generates 4 descriptions per ad group
- [ ] AHRI generates 2 display URL paths per ad group
- [ ] Pinning strategy documented per ad group
- [ ] RSA output goes to approval queue before pushing to Google Ads API
- [ ] POST /api/google-ads/create-rsa — pushes approved copy to Google
- [ ] AHRI tracks BEST/GOOD/LOW ratings weekly
- [ ] LOW headlines retired after 14 days, challengers generated
- [ ] All changes logged to intelligence-db/{location}/paid/google-rsa-log.json

### Phase 5 — Bidding Intelligence
- [ ] Launch on Manual CPC + Enhanced CPC
- [ ] Auto-switch recommendation to Target CPA at 30 conversions in 30 days
- [ ] Automated rule: CPL > 2x target for 7 days → pause keyword, flag for review
- [ ] Automated rule: QS drops below 5 → flag for copy and landing page fix
- [ ] Automated rule: search term 3+ conversions below target CPL → add as exact match
- [ ] Automated rule: search term 15+ clicks zero conversions → add as negative
- [ ] Automated rule: campaign hits daily budget before 6pm → flag for budget increase
- [ ] Budget allocation: Non-Branded 60% / Branded 20% / Remarketing 20%

### Phase 6 — Negative Keyword System
- [ ] Permanent negative list loaded on campaign creation (see SKILL.md)
- [ ] Weekly Manus task: pull search term report, harvest negatives and new keywords
- [ ] POST /api/google-ads/add-negatives — adds negatives via API
- [ ] All harvested negatives surface in Decision Layer for review before adding
- [ ] Log all negative additions to intelligence-db/{location}/paid/google-keywords.json

### Phase 7 — Conversion Tracking Verification
- [ ] Pre-launch checklist in Decision Layer (9 items)
- [ ] GTM installed on landing page
- [ ] Conversion linker tag active
- [ ] Form submission trigger firing on thank-you page
- [ ] Call tracking number active
- [ ] GHL offline conversion import webhook active
- [ ] Test conversion fired and confirmed in Google Ads UI
- [ ] Block campaign activation until all 7 items confirmed

### Phase 8 — Performance Max (after 30 conversions)
- [ ] Asset library: 5 headlines, 5 long headlines, 5 descriptions
- [ ] Asset library: 10 images (square, landscape, portrait), 2 logos, 1 video
- [ ] AHRI generates all text assets from avatar and offer data
- [ ] Image compliance check — no before/after body transformation images
- [ ] Audience signals: website visitors, customer list from GHL, similar audiences
- [ ] Budget reallance across all 4 campaign types on launch
- [ ] Weekly asset performance review — retire LOW, generate replacements

### Phase 9 — Decision Layer Integration
- [ ] Google Ads tab added to existing Decision Layer page
- [ ] Create Campaign button (parallel to Meta's)
- [ ] Keyword recommendation queue with one-click add
- [ ] Negative keyword queue with approve/reject
- [ ] Search term harvest view — converting terms and wasting terms
- [ ] QS alert queue — ad groups needing copy attention
- [ ] Budget reallocation recommendations
- [ ] Supervised / Autonomous toggle (same as Meta)

### Phase 10 — Full Dashboard Integration
- [ ] Real data flowing into Google Ads page (replace placeholder)
- [ ] Google CPL live in Overview KPI card
- [ ] Google channel live in Performance Per Channel table
- [ ] Google campaigns live in Attribution tab Lead Journey table
- [ ] GET /api/google-ads/sync — scheduled daily sync from API to intel DB
- [ ] node-cron job: sync runs at 6am daily per active location

---

## API Endpoints (full list)
- GET  /api/google-ads/performance — dashboard data
- GET  /api/google-ads/search-terms — search term report
- GET  /api/google-ads/quality-scores — QS by ad group
- POST /api/google-ads/create-campaign — create campaign PAUSED
- POST /api/google-ads/create-ad-group — create ad group
- POST /api/google-ads/create-rsa — push RSA copy
- POST /api/google-ads/add-keywords — add keywords
- POST /api/google-ads/add-negatives — add negatives
- POST /api/google-ads/sync — full sync to intel DB

---

## Onboarding Additions Required (Step 3B)
- Google Ads Customer ID (format: xxx-xxx-xxxx)
- Google Ads Developer Token
- Google Cloud OAuth Client ID
- Google Cloud OAuth Client Secret
- Google Ads Conversion Action ID
- Call tracking phone number
- Target radius in miles
- Primary keyword themes (branded / non-branded / competitor / all)
- Sitelink destinations (landing page, about, schedule)

---

## Google Ads vs Meta — Key Differences for AHRI
| Factor | Meta | Google |
|---|---|---|
| Intent | Interruption | Active search |
| Copy style | Emotional, identity, pain | Relevant, specific, offer-match |
| Creative | Visual-first | Copy-first |
| Targeting | Audience-based | Keyword-based |
| Structure | Campaign → Ad Set → Ad | Campaign → Ad Group → Keywords → RSA |
| Testing | Separate ads | Headlines within RSA |
| QS equivalent | Relevance score | Quality Score (affects CPC directly) |
| Conversion tracking | Pixel | GTM + Offline import from GHL |

---

## Reference Files
- skills/google-ads-agent/SKILL.md — full agent identity and rules
- intelligence-db/{location}/paid/google-performance.json — live data
- intelligence-db/{location}/paid/google-keywords.json — keyword intel
- intelligence-db/{location}/paid/google-rsa-log.json — RSA history
- public/index.html — Google Ads dashboard UI (section-google-ads)
- server.js — /api/google-ads/* route handlers
