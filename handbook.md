# Marketing OS — Engineering Handbook

This document captures architectural decisions, security rules, and lessons learned for the marketing-os system.

---

## Appendix D — Attribution Pipeline & Secure Lead Submission

### Problem
The original landing page submitted forms directly to the GHL API from client-side JavaScript using a hardcoded Bearer token (`pit-...`). Any visitor who opened DevTools could read the key, replay form submissions, create junk contacts, or extract the credential for other uses.

### Cause
The initial build prioritized speed and simplicity. The landing page was a static HTML file with no server of its own, so the GHL API call was made directly from the browser.

### Fix
A dedicated backend endpoint `POST /api/leads/submit` was added to the `marketing-portal` service. The landing page now POSTs form data to this endpoint. The marketing-portal backend holds the GHL API key in Railway env vars and calls GHL server-side. No credential ever reaches the browser.

**Route:** `POST /api/leads/submit`
**Auth:** none (public endpoint; rate limiting via Railway)
**Body fields:**
- `locationId` — resolved from URL param at page load; falls back to `'bloomington'`
- `sessionId` — resolved from `/go` redirect URL; used for direct attribution match
- `firstName`, `phone` — required
- `archetype_answer` — raw radio value (`social`, `analytical`, `supportive`, `independent`)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_string`

**Archetype mapping** (raw → GHL tag):
| Form value | GHL tag |
|---|---|
| `social` | `archetype:Social` |
| `analytical` | `archetype:Analytical` |
| `supportive` | `archetype:Supportive` |
| `independent` | `archetype:Independent` |

**Attribution flow:**
1. Visitor clicks a Meta ad → `/go` handler creates a session file (`{sessionId}.json`) and redirects to `/?location={id}&session_id={sessionId}`
2. Landing page reads `session_id` from URL at page load
3. Form submit POSTs `sessionId` to `/api/leads/submit`
4. Backend calls `matchContactToSession` with `sessionId` for direct file lookup (fastest path)
5. If no sessionId match, falls back to phone → email → fbclid scan

---

## Appendix E — API Key Security Rule

### Rule
**Never put API keys, Bearer tokens, or any credential in client-side code.**

### Why
Client-side JavaScript is fully readable by anyone who opens the browser's DevTools. Credentials embedded in HTML or JavaScript are effectively public. They can be:
- Extracted by a competitor or bad actor
- Replayed to create junk data in your CRM
- Used to exhaust API quotas or incur charges
- Cached by browser extensions, proxies, or crawlers

### How to apply
All third-party API calls (GHL, Meta, ElevenLabs, Anthropic) must be made from a backend service that holds the credential as an environment variable. The browser sends data to your own backend; your backend forwards to the third party.

The only client-side credential permitted is a **public pixel ID** (Meta Pixel, Google Analytics measurement ID) — these are designed to be public and carry no write access to sensitive systems.

**Checklist before any landing page or frontend ships:**
- [ ] `view-source` contains no `Bearer ` strings
- [ ] `view-source` contains no `pit-` strings (GHL private integration tokens)
- [ ] `view-source` contains no API keys matching patterns `sk-`, `EAA`, or similar
- [ ] All form submissions go to your own backend domain, not directly to a third-party API

---

## Appendix F — Google Ads Agentic System (Added May 10, 2026)

### Architecture
- services/googleAds.js — 12-method GoogleAdsService class
- 11 API routes in server.js (lines 5357–5599)
- Daily 6AM cron sync writes to intelligence-db/{location}/paid/google-performance.json
- Placeholder data returns when API not connected — dashboard always renders

### Credential Structure
Google Ads uses a split credential model:
- Shared (set once): GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, 
  GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_MANAGER_CUSTOMER_ID
- Per location: GOOGLE_ADS_CUSTOMER_ID_{K}, GOOGLE_ADS_REFRESH_TOKEN_{K},
  GOOGLE_ADS_CONVERSION_ACTION_ID_{K}, GOOGLE_ADS_CALL_TRACKING_PHONE_{K},
  GOOGLE_ADS_TARGET_RADIUS_{K}

### MCC Architecture
All gym client accounts link under the GymSuiteAI Manager Account (417-863-0195).
One Developer Token and one OAuth credential set covers all locations.
Each gym gets a unique Customer ID and Refresh Token only.

### login_customer_id Requirement
Google Ads API requires the MCC ID in the login-customer-id header when 
accessing client accounts. Set via login_customer_id field in _getCustomer().
Without this, API returns "User doesn't have permission" error regardless 
of whether credentials are valid.

### Refresh Token Generation
Must be generated from the Google account that owns the MCC (afanytimefitnessgyms@gmail.com).
Use OAuth Playground (developers.google.com/oauthplayground) with scope:
https://www.googleapis.com/auth/adwords
Token starts with 1// — store as GOOGLE_ADS_REFRESH_TOKEN_{LOCATION}.

### Developer Token Access Levels
- Test access: API works only with test accounts, not real accounts
- Basic access: required for real accounts — apply at ads.google.com/aw/apicenter
- Standard access: required for >15k API operations/day (not needed yet)
Applied for Basic Access May 10, 2026 — pending approval.

### Onboarding Integration
Two Manus tasks auto-fire at session completion (setImmediate block, non-blocking):
1. google-keyword-intelligence.md — researches keyword landscape for the market
2. paid-ads-setup.md — sets up Meta ad structure
Both use Promise.allSettled — one failure never blocks the other.
Keyword confirmation step renders above Railway checklist after provisioning.

### Railway Checklist
buildRailwayChecklist() updated May 10, 2026:
- Data structure changed from [varName, label] tuples to enriched objects
  { key, label, description, link, hint }
- Shared Google Ads vars use ...gadsVars spread — single source of truth
- GET → direct links open credential source in new tab
- Format hints in amber monospace show expected token format
- doOps bug fixed — portalVars always renders regardless of tier
- dismissRailwayChecklist fixed — uses btn.closest('[id^="prov-form-"]')

### GTM Installation
GTM-PS8DPLLB installed on landing-server/testimonials.html
- Script tag: first child of <head>
- Noscript iframe: first child of <body>
Used for Google Ads conversion tracking — fires on form submission thank-you page.
Conversion Action ID to be created at Bloomington launch.

### Decision Layer — Google Ads Cards
Four cards added to Decision Layer section:
1. Campaign Builder — connection status + campaign creation
2. Conversion Tracking — 7-item pre-launch checklist
3. Keyword Intelligence — shows Manus research output, launch button
4. Negative Keyword Queue — harvest recommendations with approve/reject

### Agent Tasks (renamed from Manus Tasks)
UI labels updated May 10, 2026:
- Sidebar nav: "Manus Tasks" → "Agent Tasks"  
- Page header: "Manus Intelligence Tasks" → "Agent Intelligence Tasks"
google-keyword-intelligence → on-demand bucket
google-search-term-harvest → weekly bucket

### Known Pending Items
- Google Ads Basic Access approval — submitted May 10, 2026
- Facebook Pixel ID — collect at Bloomington launch
- Meta live data — connect at Bloomington launch
- Automated OAuth flow for Refresh Token — build when scaling beyond 3 gyms/month
- Performance Max module — build after 30 conversions post-launch

---

## Appendix G — Google Ads vs Meta — System Differences

### Intent Model
Meta: interruption-based. Stop the scroll. Person wasn't looking for you.
Google: intent-based. Person searched. They raised their hand.
This changes everything about copy strategy — Google copy matches the search,
Meta copy speaks to identity and pain.

### Campaign Structure Complexity
Meta: Campaign → Ad Set → Ad (3 levels)
Google: Campaign → Ad Group → Keywords → RSA (4 levels)
Ad group theme discipline is critical — one theme per group or Quality Score suffers.

### RSA vs Static Creative
Meta: one ad = one image/video + one copy block
Google RSA: 15 headlines + 4 descriptions — Google mixes and matches
AHRI tracks BEST/GOOD/LOW ratings per headline and retires LOW after 14 days

### Quality Score
No Meta equivalent. QS 10 pays ~50% less per click than QS 5 for same position.
Three components: Expected CTR, Ad Relevance, Landing Page Experience.
AHRI monitors QS weekly and queues copy rewrites when QS drops below 6.

### Bidding Strategy Progression
Launch: Manual CPC + Enhanced CPC (no conversion history yet)
After 30 conversions in 30 days: switch to Target CPA
After Performance Max launch: rebalance budget across all 4 campaign types

### Conversion Tracking Depth
Meta: pixel fires on page load / event
Google: GTM → conversion action → offline import from GHL
Offline import is the key differentiator — when GHL marks a lead as member,
that event imports back to Google Ads. Google then optimizes to member 
acquisition, not just lead acquisition.

### Negative Keywords
No Meta equivalent. Google wastes 20-30% of budget on irrelevant searches
without active negative management. AHRI runs weekly search term harvest
to identify and queue wasting terms for removal.

---

## Appendix H — Onboarding Flow (Current State as of May 10, 2026)

### Full Sequence
1. Send intake form → owner fills out before call
2. Create AHRI session → Manus prospect-research fires automatically
3. AHRI interview → 8 questions → session complete
   - On completion (non-blocking): Google Keyword Intelligence fires
   - On completion (non-blocking): Paid Ads Setup fires
   - On completion (non-blocking): Google Drive folder structure created
   - On completion (non-blocking): Onboarding creative generated
   - On completion (non-blocking): Content schedule generated
4. Collect credentials → Step 3 Railway checklist → 17 credentials with 
   direct links, descriptions, format hints
5. Provision → Account Access → tier selection → testimonial page generated
   → keyword confirmation step shows Manus research results
   → Railway checklist renders below
6. GHL webhooks → stage change + call recording URLs added in GHL
7. Google Sheets → copy master sheet → share with service account
8. Meta setup → pixel ID, campaign clone, destination URL
9. Google Ads setup → customer ID, refresh token via OAuth Playground,
   conversion action created, GTM verified firing
10. Go live → active: true → campaigns activated

### Credential Collection (Step 3 Railway Checklist)
17 credentials across two Railway services (OPS Dashboard + Marketing Portal):

GHL: Location ID, API Key v1, API Key v2
Meta: Ad Account ID, Page ID, Access Token, Pixel ID
ElevenLabs: API Key, Voice ID
Google Ads (shared): Developer Token, Client ID, Client Secret, Manager Customer ID
Google Ads (per location): Customer ID, Refresh Token, Conversion Action ID,
  Call Tracking Phone, Target Radius

### Auto-Firing Manus Tasks at Session Completion
Both fire via Promise.allSettled in a setImmediate block — fully non-blocking:
- google-keyword-intelligence.md: researches keyword landscape, CPC benchmarks,
  competitor gap, recommended ad group structure
- paid-ads-setup.md: sets up Meta campaign structure

Output from keyword intelligence populates:
- intelligence-db/{location}/paid/google-keywords.json
- Decision Layer → Keyword Intelligence card
- Keyword confirmation step in provision flow

### Pending Onboarding Additions
- Automated OAuth flow for Google Ads Refresh Token (manual via OAuth Playground for now)
- Conversion Action creation guide (instructional card)
