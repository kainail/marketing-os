# Brain State — Current State
# AHRI reads this file before every generation. Keep it current.

## Sessions Complete
Sessions 0–23 | Version: v2.0 | Last updated: 2026-05-01

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
Early May — post-spring motivation, Mother's Day window

## Active Script Version
nurture-sync v1.1 — No-Risk Comeback (2026-04-24)
Full package: nurture-sync-20260424-A-IO8L (Variant A) and nurture-sync-20260424-B-498R (Variant B)
Status: pending GHL and ElevenLabs implementation — Kai approval required before live

## Landing Page Status
- LIVE at: no-risk-comeback-landing-page-production.up.railway.app
- Railway server: Node.js with env var injection — all {{custom_values.x}} and {{PORTAL_URL}} placeholders resolved at request time
- Both forms working: hero form + final CTA form — archetype radio question on both
- Form submission: POST /api/leads/submit on marketing-portal — GHL v1 API (Location API Key)
- Facebook Pixel (ID: 1984794322135725) installed — fires PageView on load, Lead on form submit
- GHL tags on submit: no-risk-comeback, landing-page, archetype-[type]
- Debug endpoints live: /debug (env var check), /health
- Pending: remove console.log debug statements after confirmation tests pass
- Pending: real photos (gym-photo.jpg committed — verify display on Railway)
- Pending: Steph testimonial replacement with real member

## Session 20 — Goal Status

Goal 4 — Attribution Pipeline: FULLY CONFIRMED ✅
  All 5 confirmation tests passed (Session 20)

Goal 5 — Marketing OS Campaigns: FULLY CONFIRMED ✅
  All 5 confirmation tests passed (Session 20)

LTV Correction: COMPLETE ✅
  Changed $975 → $2,000 throughout OPS Dashboard server.js
  Updated intelligence-phases.html Revenue section
  MEMBER_LTV now env-var overridable (add MEMBER_LTV=2000 to Railway OPS Dashboard)
  Marketing-portal was already using $2,000

Goal 6 — R2 Migration: FULLY COMPLETE ✅ (verified Session 21 — 2026-05-01)
  Step 1 ✅ @aws-sdk/client-s3 installed in both projects
  Step 2 ✅ lib/r2.js created in both projects (7 functions: r2Get/r2Put/r2List/r2Delete/r2GetShared/r2PutShared/r2Exists)
  Step 3 ✅ GET /api/admin/r2-test endpoint added to both servers
  Step 4 ✅ Marketing OS: all PERSISTENT_DATA_DIR/SESSIONS_DIR/ATTRIBUTION_REPORT ops migrated to R2
    - Sessions (all CRUD): R2 at {locationId}/attribution/sessions/{sessionId}.json
    - Attribution report: R2 at {locationId}/attribution/attribution-report.json
    - Manus task outputs: R2 via persistentPathToR2Key() helper
    - Task runs: R2 at bloomington/intelligence-db/queue/task-runs.json (async)
    - Campaign: R2 at {locationId}/intelligence-db/paid/active-campaign.json
    - Rules/cooldowns: R2 at bloomington/intelligence-db/rules/{rule.id}.json
    - Seed data: R2 at bloomington/intelligence-db/market/competitor-ads.json
    - Agentic rule checks: async, read from R2
  Step 5 ✅ OPS Dashboard: R2 archive writes added (fire-and-forget)
    - After Vision run: r2Put(locationId, 'intelligence-db/vision/{runId}.json', result)
    - After Jarvis run: r2Put(locationId, 'intelligence-db/jarvis/{timestamp}.json', report)
    - After script optimization: r2Put(locationId, 'intelligence-db/scripts/{timestamp}.json', result)
  Step 6 ✅ migrateVolumeToR2() function added — runs on startup, idempotent (checks migration-complete.json)
  Step 7 ✅ Deployed to Railway and all verification checks passed
    Check 1 ✅ GET /api/admin/r2-test on both servers → { success: true }
    Check 2 ✅ Intelligence task file confirmed in Cloudflare R2 dashboard
    Check 3 ✅ Vision run file confirmed in bloomington/intelligence-db/vision/ in R2 dashboard

Goal 7 — Three-Tier Portal: FULLY COMPLETE ✅ (verified Session 22 — 2026-05-01)
  JWT issued by OPS Dashboard only, validated by both services
  User database at shared/users/users.json in R2 (60s in-memory cache with stale fallback)
  Two roles: admin (all locations) and owner (scoped to assigned locations)
  Dashboard toggle visible only when user has both hasOPS + hasAHRI
  Login pages on both OPS Dashboard and AHRI Marketing OS
  AHRI always defers to OPS Dashboard for token issuance
  Neural OS references fully removed from all services
  Default admin seeded from ADMIN_EMAIL + ADMIN_DEFAULT_PASSWORD env vars on startup
  Password reset via Resend (onboarding@resend.dev) — confirmed working
  All 6 checks passed:
    Check 1 ✅ Admin login works, token issued, dashboard loads
    Check 2 ✅ AHRI login gate (hasAHRI permission check) enforced
    Check 3 ✅ Dashboard toggle appears with both permissions, absent with one
    Check 4 ✅ User management UI — admin can create/edit/delete users
    Check 5 ✅ Password reset email delivered via Resend
    Check 6 ✅ Owner scoping — 403 on admin routes, locations array enforced in token

Goal 8 — Handbook Export: FULLY COMPLETE ✅ (2026-05-01)
  Part A ✅ All 5 fixes applied (Phase 6, Phase 7, Appendix C, Appendix D, Appendix E)
  Part B ✅ 4 new chapters written (Two Dashboards, AI Team, 16 Tasks, Weekly Routine)
  Part C ✅ PDF exported → C:\Users\kaial\gymsuite-onboarding-playbook.pdf (1.3MB, Version 1.0)

## Pending Manual Fixes
- "that's Adam" → "that's Jessica" in GHL SMS
- CLARITY_PROJECT_ID not set in landing server Railway service
- Call recording webhook not configured in GHL:
    URL: https://gymsuiteai-dashboard-production.up.railway.app/api/webhooks/ghl/bloomington/call-recording
    Event: Call Recording
- Make scenarios still need disabling in Make (do not delete — 30-day reference window)
- Switch to OUTCOME_LEADS after 50+ pixel events
- META_ACCESS_TOKEN renewal deadline: 2026-05-29

## Next Session Starts With
1. Onboard Eaton OH — use gymsuite-onboarding-playbook.pdf as the guide
2. Manual: Delete Neural OS Railway service in Railway dashboard (no longer needed)

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
- META_ACCESS_TOKEN_BLOOMINGTON expires 2026-05-29
- Renew before that date
- Renew via Graph API Explorer → exchange for long-lived token → update META_ACCESS_TOKEN_BLOOMINGTON in Railway (marketing-os service)

## Architecture Decisions Locked
- GHL lead submission: POST /api/leads/submit on marketing-portal — GHL v1 API — Location API Key in GHL_BLOOMINGTON_API_KEY
- Attribution: /go writes session to R2 at {locationId}/attribution/sessions/{sessionId}.json; form submit reads session from R2 by session_id; matchContactToSession is location-aware
- All email via Resend (HTTP, not SMTP) — Railway blocks Gmail SMTP
- Long tasks fire-and-forget: respond 200 immediately, run async with .catch()
- MP3 hosted at ./data/reports/, served via GET /reports/:filename?token=JWT_SECRET
- R2 is primary persistent storage for Marketing OS (volume retired)
- R2 is archive layer for OPS Dashboard (Sheets is still primary)
- LTV = $2,000 per member (set via MEMBER_LTV env var in Railway OPS Dashboard)

## Cross-Brain Insights (updated 2026-04-24 — 75 calls analyzed)
- INSIGHT 1: Source attribution is null for 3 of 75 calls (4%). AHRI enforces UTM injection on all assets. Default source value "direct_untagged" appended to all untagged leads.
- INSIGHT 2: One-day-pass source = 96% of call volume (72/75) at 0% booking rate, avg score 3.6/10. AHRI does not generate day-pass-only lead magnets. All offers bundle a specific appointment.
- INSIGHT 3: Top objection = commitment resistance across multiple calls. All ad copy and landing page text frames the call as a concierge scheduling service, not a sales interaction.
- INSIGHT 4: 94.7% of calls (71/75) unclassified — zero archetype data. Landing page archetype radio question now captures this pre-call. GHL Workflow 1 archetype tagging still pending.
- INSIGHT 5: Soft commitments ("I guess, later today") result in zero show rate. Pre-appointment nurture sequence (confirmation SMS + 2-hour reminder) designed in nurture-sync v1.1 — pending GHL implementation.

## R2 Credentials (in Railway — both services)
R2_ACCOUNT_ID — Cloudflare account ID
R2_ACCESS_KEY_ID — R2 API token access key
R2_SECRET_ACCESS_KEY — R2 API token secret key
R2_BUCKET_NAME = gymsuiteai-storage
R2_ENDPOINT = https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com

## Future Sessions
- Session 21: Goal 6 deployed and fully verified ✅
- Session 22: Goal 7 Three-Tier Portal ✅ Complete
- Session 23: Goal 8 Handbook Export ✅ Complete
- Session 24+: Second gym location live (Eaton) — playbook ready
- Session 24+: Vision + Syndra cross-brain data sharing (once both systems have meaningful data)
