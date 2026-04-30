# Brain State — Current State
# AHRI reads this file before every generation. Keep it current.

## Sessions Complete
Sessions 0–18 | Version: v2.0 | Last updated: 2026-04-30

## Active Offer
The No-Risk Comeback — 30 Days Coached, $1 to Start

## Active Avatar
lifestyle-member

## Active Business
anytime-fitness

## Live Ads
Campaign created in Meta as PAUSED — Bloomington TEST account
- Objective: OUTCOME_TRAFFIC (temporary — switch to OUTCOME_LEADS after 50+ pixel events)
- Budget: $25/day ($15 cold, $10 warm)
- Status: PAUSED — activate in Ads Manager when ready to spend
- Ad destination URLs now route through /go ghost redirect (redirect=landing)

## Current Tests
nurture-sync A/B variants loaded — pending GHL implementation

## Winning Hooks (last 3)
1. "The moment you realized you couldn't keep up with your own kids." — COLD LEAD (Variant B, Level 2, parent/child angle) — AHRI recommendation: lead with this
2. "You're not lazy. You've just never had anyone notice when you stopped showing up." — COLD LEAD (Variant A, Level 2, identity reframe) — use for warm/retargeting
3. "We built this entire first month around the specific reason you quit last time." — RETARGETING (Level 5, offer-specific) — strongest for people who've seen the offer

## Top Objection This Month
Commitment resistance — leads ask to use the pass without scheduling, prefer to call back or book online themselves, or are too busy to commit on the call.

## Seasonal Context
Late April — spring motivation window

## Active Script Version
nurture-sync v1.1 — No-Risk Comeback (2026-04-24)
Full package: nurture-sync-20260424-A-IO8L (Variant A) and nurture-sync-20260424-B-498R (Variant B)
Status: pending GHL and ElevenLabs implementation — Kai approval required before live

## Landing Page Status
- LIVE at: no-risk-comeback-landing-page-production.up.railway.app
- Railway server: Node.js with env var injection — all {{custom_values.x}} placeholders resolved at request time
- Both forms working: hero form + final CTA form — archetype radio question on both
- Form submission: wired to GHL API via submitForm() JS handler
- Facebook Pixel (ID: 1984794322135725) installed — fires PageView on load, Lead on form submit
- Pending: GHL API key regeneration before go-live
- Pending: real photos (gym-photo.jpg committed — verify display on Railway)
- Pending: Steph testimonial replacement with real member
- Pending: add image to campaign creative

## Skills Complete: 15 of 15
offer-machine, hook-writer, ad-copy, landing-page, email-sequence, nurture-sync,
content-calendar, reactivation, referral-campaign, review-engine, funnel-updater,
workflow-updater, vsl-script, flyer-generator, image-generator, seo-content,
google-ads, partnership-outreach

## Routines Active: 6 automated + 15 Manus tasks
Automated:
- Daily 7am: morning-brief (npm run morning-brief)
- Monday 5:45am: weekly-media-processing (npm run analyze-media)
- Monday 7am: weekly-content (npm run weekly-content)
- Sunday 11pm: weekly-cross-brain-sync (npm run sync-brains)
- First Monday 7am: monthly-campaign (npm run monthly-campaign)
- Triggered 72h after funnel update: funnel-performance-check (npm run funnel-check)

Manus tasks (weekly):
- Sunday 8pm: referral-tracker | Sunday 9pm: nurture-performance-analyzer | Sunday 10pm: lead-journey-tracker
- Monday 6am: competitor-research | Monday 6:30am: trend-monitoring | Monday 8am: budget-pacing-tracker | Monday 9am: review-monitoring
- Wednesday 8am: paid-ads-analyzer | Wednesday 9am: google-ads-analyzer | Wednesday 10am: clarity-analyzer | Wednesday 11am: retention-early-warning

Manus tasks (first Monday of month):
- 10am: crm-hygiene | 11am: gbp-optimization | 12pm: monthly-report

Manus tasks (on-demand):
- content-posting (after Kai approves queue)

## Manus Tasks Ready: 16 of 16
- manus-tasks/content-posting.md
- manus-tasks/competitor-research.md
- manus-tasks/trend-monitoring.md
- manus-tasks/paid-ads-analyzer.md
- manus-tasks/google-ads-analyzer.md
- manus-tasks/budget-pacing-tracker.md
- manus-tasks/lead-journey-tracker.md
- manus-tasks/clarity-analyzer.md
- manus-tasks/nurture-performance-analyzer.md
- manus-tasks/retention-early-warning.md
- manus-tasks/review-monitoring.md
- manus-tasks/crm-hygiene.md
- manus-tasks/referral-tracker.md
- manus-tasks/gbp-optimization.md
- manus-tasks/monthly-report.md
- manus-tasks/paid-ads-setup.md (task #16 — added Session 17)

## Session 18 — What Was Built
- marketing-portal/server.js — 3 path constants (ATTRIBUTION_DIR, SESSIONS_DIR, ATTRIBUTION_REPORT)
- marketing-portal/server.js — safeReadJSONAsync helper (returns null for missing files)
- marketing-portal/server.js — GET /go ghost redirect (captures fbclid+UTMs, writes session file, redirects <50ms)
- marketing-portal/server.js — GET /api/attribution/session/:sessionId (session lookup)
- marketing-portal/server.js — POST /api/ghl/contact-created (GHL webhook receiver)
- marketing-portal/server.js — POST /api/ghl/contact-updated (member conversion tracker)
- marketing-portal/server.js — GET /api/attribution/report (dynamic session counting from SESSIONS_DIR)
- marketing-portal/server.js — fireCAPIEvent() sends Lead/Purchase events to Facebook CAPI
- marketing-portal/server.js — matchContactToSession() matches GHL contacts to /go sessions
- marketing-portal/server.js — confirmMemberConversion() fires CAPI Purchase + updates report
- marketing-portal/server.js — updateAttributionReport() maintains attribution-report.json
- marketing-portal/server.js — initAttributionStore() creates dirs + initializes report on startup
- marketing-portal/server.js — ad URLs updated to route through /go ghost redirect (redirect=landing)
- marketing-portal/public/index.html — Lead Journey dashboard (4 summary cards, 4 data tables, 60s auto-refresh)
- marketing-portal/public/index.html — Performance attribution tab (hook ranking, days-to-convert, revenue by campaign)
- marketing-portal/public/index.html — Decision Layer attribution intelligence cards (scale signal, low match rate, abandoned cart)
- marketing-portal/public/index.html — Overview attribution widget (ad clicks, match rate, GHL leads, members)
- engine/ahri.ts — check_attribution intent + handleCheckAttribution() function
- knowledge-base/nurture/ghl-webhook-setup.md — step-by-step GHL webhook config guide

## Session 17 — What Was Built
- 14 scheduled tasks wired (cron-based automated routines)
- 3 agentic rules engine (auto_pause CPL>$60, auto_scale +20%, auto_double_down +40%)
- Queue persistence (task-runs.json, atomic writes)
- Manus launcher with 6-state button (idle/launching/running/complete/failed/fallback)
- Recent Runs panel with polling on active tasks

## Session 18 Commits
- 6f01456 — Session 18 attribution system (ghost redirect, session store, GHL webhooks, CAPI, attribution matcher)
- 9ee4a94 — fix: attribution report dynamically counts session files from SESSIONS_DIR
- 526961d — fix: campaign ad URLs route through /go with redirect=landing
- 323886b — wire attribution data into portal UI (Lead Journey, Performance tab, Decision Layer, Overview)

## OUTCOME_LEADS Upgrade Checklist
Switch from OUTCOME_TRAFFIC → OUTCOME_LEADS once pixel has event history:
1. Monitor Events Manager for 50+ PageView events on pixel 1984794322135725
2. Wait for 10+ Lead events (form fills)
3. Update marketing-portal/server.js:
   - objective: 'OUTCOME_LEADS'
   - optimization_goal: 'LEAD_GENERATION'
   - promotedObject: { page_id: META_PAGE_ID, pixel_id: META_PIXEL_ID, custom_event_type: 'LEAD' }
4. Redeploy → create new campaign via portal

## Token Renewal Schedule
- META_ACCESS_TOKEN long-lived token expires ~2026-06-28
- Set calendar reminder: 2026-05-29
- Renew via Graph API Explorer → exchange for long-lived token → update META_ACCESS_TOKEN in Railway (marketing-os service)

## Outstanding Issues
- Campaign needs to be activated in Ads Manager (currently PAUSED — Kai must enable spend)
- fal.ai balance needs top-up (image generation disabled)
- GHL API key regeneration (critical — old key exposed/invalid)
- GHL webhooks not yet configured — see knowledge-base/nurture/ghl-webhook-setup.md
- META_CAPI_TOKEN (META_ACCESS_TOKEN) needs to be set in marketing-os Railway env for CAPI to fire
- Clarity project ID not set
- GBP links still pointing to AF.com (not through /go redirect)
- Landing page: Steph testimonial needs replacement with real member
- Landing page: add image to campaign creative
- Neural OS (end of project — not started)
- GHL Workflow 1 archetype tagging (3 steps pending)
- Tracking redirect deployment (tracking-redirect/ service not yet deployed to Railway)
- Dashboard rendering bug (unresolved)
- Token renewal calendar reminder: 2026-05-29

## Architecture Decisions Locked
- **Make scenarios REPLACED**: All 6 Make scenarios will be replaced with Railway-native webhook handlers in Session 19. Reason: Railway already handles GHL webhooks natively — Make adds latency, cost, and a failure point. No net new functionality.
- **Session 19 prerequisite**: Full GymSuite AI system map transcript + GHL workflow screenshots + Make scenario configurations + Google Sheets column structure + Railway env vars for OPS dashboard required BEFORE any Session 19 code is written.
- **Onboarding SOP first**: Complete new club onboarding SOP (PDF) must be built before Eaton location code is written. SOP documents every manual step so it can be executed without an engineer.

## Session 19 — Scope (next conversation)
1. Replace all 6 Make scenarios with Railway-native handlers
2. Build location config system (multi-location support)
3. Portal location switcher UI
4. Complete new club onboarding SOP (PDF)
5. Add Eaton as second location
6. Cloudflare R2 migration (before additional gym onboarding)

## Session 19 — What New Conversation Needs Before Building
1. Full GymSuite AI transcript (for accurate SOP — covers all 17 system phases)
2. GHL workflow screenshots (Workflow 1 + all active workflows)
3. Make scenario configurations (all 6 scenarios — inputs, outputs, column mappings)
4. Google Sheets column structure (columns M and R + full sheet layout)
5. Railway env vars for OPS dashboard (current values to port into location config)
6. Then: build complete onboarding SOP PDF
7. Then: build Session 19 code

## Cross-Brain Insights (updated 2026-04-24 — 75 calls analyzed)
- INSIGHT 1: Source attribution is null for 3 of 75 calls (4%). AHRI enforces UTM injection on all assets. Default source value "direct_untagged" appended to all untagged leads.
- INSIGHT 2: One-day-pass source = 96% of call volume (72/75) at 0% booking rate, avg score 3.6/10. AHRI does not generate day-pass-only lead magnets. All offers bundle a specific appointment.
- INSIGHT 3: Top objection = commitment resistance across multiple calls. All ad copy and landing page text frames the call as a concierge scheduling service, not a sales interaction.
- INSIGHT 4: 94.7% of calls (71/75) unclassified — zero archetype data. Landing page archetype radio question now captures this pre-call. GHL Workflow 1 archetype tagging still pending.
- INSIGHT 5: Soft commitments ("I guess, later today") result in zero show rate. Pre-appointment nurture sequence (confirmation SMS + 2-hour reminder) designed in nurture-sync v1.1 — pending GHL implementation.

## Future Sessions
- Session 20: Second gym location live (Eaton) — after SOP complete and R2 migrated
- Session 21+: Vision + Syndra cross-brain data sharing (once both systems have meaningful data)
