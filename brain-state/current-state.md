# Brain State — Current State
# AHRI reads this file before every generation. Keep it current.

## Sessions Complete
Sessions 0–17 | Version: v2.0 | Last updated: 2026-04-29

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
- Pending: GHL API key regeneration before go-live
- Pending: real photos (gym-photo.jpg committed — verify display on Railway)

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

## Last Session Notes
Session 4/29/2026 — Meta API fully debugged end to end. 11 parameter errors identified and resolved across multiple iterations (act_ prefix, objective, optimization_goal, interest IDs, promoted_object, pixel guard). OUTCOME_TRAFFIC + LINK_CLICKS working without pixel event history requirement. Facebook Pixel (ID: 1984794322135725) installed on landing page — fires PageView on load, Lead on form submit. Retry logic added to metaApiCall (3 retries, 5s delay on is_transient errors). Nurture system complete: 12-touch SMS sequence, 6-email sequence, 3-signal retention system (CTR drop / form CVR drop / $50 zero leads), GHL loading guide. CREATE CAMPAIGN IN META button in portal works end to end.

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
- Tracking redirect not deployed to Railway
- Clarity project ID not set
- CAPI tokens not set
- GBP links still pointing to AF.com (not tracking redirect)
- Landing page: Steph testimonial needs replacement with real member
- Landing page: add image to campaign creative
- Neural OS (end of project — not started)
- GHL Workflow 1 archetype tagging (3 steps pending)
- Make scenario columns M and R
- Landing page UTM hidden fields

## Session 16 — What Was Built
- schemas/manus-outputs/ — 16 JSON Schema Draft 2020-12 files (1 meta + 15 task-specific)
- manus-tasks/ — OUTPUT CONTRACT section added to all 15 task files (JSON-only, no PDF/prose)
- marketing-portal/server.js — 4 new Manus endpoints: POST /api/manus/trigger, GET /api/manus/status/:id, POST /api/manus/callback (full: atomic write + schema routing + defensive parsing), GET /api/manus/recent-runs
- marketing-portal/data/task-runs.json — persistent task run tracking (atomic writes)
- marketing-portal/public/index.html — 6-state LAUNCH button (idle/launching/running/complete/failed/fallback), Recent Runs panel, polling on active tasks
- engine/ahri.ts — handleRunManusTask now calls MARKETING_PORTAL_URL/api/manus/trigger; falls back to copy/paste display if API key absent
- .env.example — MARKETING_PORTAL_URL, MANUS_API_KEY, MANUS_API_BASE, MANUS_WEBHOOK_SECRET added
- intelligence-db/market/competitor-ads.json — seeded with Bloomington IN market data (Orangetheory, Club Pilates, Planet Fitness)
- intelligence-db/market/hook-saturation.json — seeded with 5 saturated hooks + 3 opportunity gaps

## Session 15 — What Was Built
- marketing-portal/server.js — Express backend, 19 API endpoints, placeholder perf data
- marketing-portal/package.json — express, cors, @anthropic-ai/sdk deps
- marketing-portal/railway.json — NIXPACKS builder, healthcheckPath /health
- marketing-portal/config/agentic-rules.json — supervised mode, kill/scale/guardrail rules
- marketing-portal/public/styles.css — full design system (CSS vars, animations, all components)
- marketing-portal/public/index.html — 11-section SPA: overview, queue, calendar, performance,
  decision, hooks, journey, landing, nurture, manus launcher, archive
- AHRI panel: 3 tabs (chat via Anthropic API, voice via Web Speech, actions grid)
- Agentic rules engine: auto_pause (CPL>$60), auto_scale (+20%), auto_double_down (+40%)
- All 19 endpoints verified: health, status, overview, queue, approve, reject, content-calendar,
  morning-brief, manus-tasks, manus-tasks/:filename, hooks-library, nurture, ab-tests,
  campaign-archive, agentic-rules (GET+POST), ahri, competitor-intel, alerts, performance
- Graceful degradation: missing API key, empty intelligence files, placeholder data with banner

## Session 14 — What Was Built
- knowledge-base/paid-media/thresholds.md — CPL targets, kill/scale signals, pacing rules
- knowledge-base/paid-media/creative-framework.md — thumbstop benchmarks, hook types, testing protocol
- intelligence-db/ READMEs for paid/, lead-journey/, clarity/, retention/, nurture/
- tracking-redirect/ — Express server: CAPI async, journey-log.json, 4 first-party cookies, 301 redirect in < 100ms
- Clarity tracking installed on landing-server — CLARITY_PROJECT_ID env var injection
- 15 Manus tasks: all 5 intelligence files ready, all 12 new tasks created
- engine/ahri.ts: 13 new IntentType values, INTENT_TO_MANUS_TASK + TASK_INTELLIGENCE_FILES constants, handleDisplayManusTask() + handleProcessManusResults()
- outputs/automation-schedule.md: full weekly/monthly rhythm documented

## Pending Before First Campaign Launch
1. Regenerate GHL API key (critical — current key invalid)
2. GHL Workflow 1 — add archetype tagging actions
3. Make scenario — pipe lead_source and archetype_detected to Sheet columns M and R
4. Approve assets in AHRI queue (distribution/queue/pending-review/)
5. Budget decision: Meta $25/day, Google $20/day — Kai approval required
6. Run competitor research in Manus first (before launching ads)
7. Confirm gym-photo.jpg loading on iPhone after Railway redeploy
8. Create Clarity project at clarity.microsoft.com → add CLARITY_PROJECT_ID to landing-server Railway env vars
9. Deploy tracking-redirect/ as new Railway service → add META_PIXEL_ID + META_CAPI_TOKEN env vars
10. Update all 9 GBP location website fields to use tracking redirect URL (not AF.com direct)
11. Deploy marketing-portal/ as new Railway service → set env vars: GYM_NAME, OPS_URL, NEURAL_URL, ELEVENLABS_AGENT_ID, ANTHROPIC_API_KEY

## Next Session Priorities — Session 18: Lead Tracing
1. Full lead journey tracking — source attribution (which ad → which lead)
2. Full journey map: ad → form → call → member
3. Multi-source attribution: landing page + franchise website
4. Activate campaign in Ads Manager once ready to spend
5. GHL Workflow 1 archetype tagging

## Future Sessions
- Session 19: GHL full integration (API key regeneration, workflow 1 archetype tagging, nurture load)
- Session 20: Cloudflare R2 migration (before second gym location onboarding)

## Cross-Brain Insights (updated 2026-04-24 — 75 calls analyzed)
- INSIGHT 1: Source attribution is null for 3 of 75 calls (4%). AHRI enforces UTM injection on all assets. Default source value "direct_untagged" appended to all untagged leads.
- INSIGHT 2: One-day-pass source = 96% of call volume (72/75) at 0% booking rate, avg score 3.6/10. AHRI does not generate day-pass-only lead magnets. All offers bundle a specific appointment.
- INSIGHT 3: Top objection = commitment resistance across multiple calls. All ad copy and landing page text frames the call as a concierge scheduling service, not a sales interaction.
- INSIGHT 4: 94.7% of calls (71/75) unclassified — zero archetype data. Landing page archetype radio question now captures this pre-call. GHL Workflow 1 archetype tagging still pending.
- INSIGHT 5: Soft commitments ("I guess, later today") result in zero show rate. Pre-appointment nurture sequence (confirmation SMS + 2-hour reminder) designed in nurture-sync v1.1 — pending GHL implementation.
