# Brain State — Current State
# AHRI reads this file before every generation. Keep it current.

## Sessions Complete
Sessions 0–19 | Version: v2.0 | Last updated: 2026-04-30

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
- Railway server: Node.js with env var injection — all {{custom_values.x}} and {{PORTAL_URL}} placeholders resolved at request time
- Both forms working: hero form + final CTA form — archetype radio question on both
- Form submission: POST /api/leads/submit on marketing-portal — GHL v1 API (Location API Key)
- Facebook Pixel (ID: 1984794322135725) installed — fires PageView on load, Lead on form submit
- GHL tags on submit: no-risk-comeback, landing-page, archetype-[type]
- Debug endpoints live: /debug (env var check), /health
- Pending: remove console.log debug statements after confirmation tests pass
- Pending: real photos (gym-photo.jpg committed — verify display on Railway)
- Pending: Steph testimonial replacement with real member

## Session 19 — Goal Status

Goal 1 — Location Config System: COMPLETE ✅
Goal 2 — Replace Make Scenarios: COMPLETE ✅
Goal 3 — OPS Compute Functions Location-Aware: COMPLETE ✅
Goal 4 — Attribution Pipeline: COMPLETE ✅
  Code complete and deployed.
  Form submission working end to end.
  5 confirmation tests still needed next session:
    Test 2: Railway logs show [LeadSubmit] correctly
    Test 3: GHL contact has correct archetype tags
    Test 4: No API key visible in page source
    Test 5: Session ID flows through /go correctly
    Test 6: Attribution matches session end to end
Goal 5 — Marketing OS Campaigns: COMPLETE ✅
  Code complete and deployed.
  Needs same confirmation tests as Goal 4.
Goal 6 — R2 Migration: NOT STARTED
Goal 7 — Three-Tier Portal: NOT STARTED
Goal 8 — Handbook Export: NOT STARTED

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
1. Run 5 confirmation tests for Goals 4 and 5
2. Then begin Goal 6 — R2 Migration

R2 credentials needed from Kai before Session 20:
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_NAME = gymsuiteai-storage
  R2_ENDPOINT = https://{account_id}.r2.cloudflarestorage.com

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
- Attribution: /go writes session file with session_id; landing page URL receives session_id; form submit passes sessionId to matchContactToSession for direct file lookup
- All email via Resend (HTTP, not SMTP) — Railway blocks Gmail SMTP
- Long tasks fire-and-forget: respond 200 immediately, run async with .catch()
- MP3 hosted at ./data/reports/, served via GET /reports/:filename?token=JWT_SECRET

## Cross-Brain Insights (updated 2026-04-24 — 75 calls analyzed)
- INSIGHT 1: Source attribution is null for 3 of 75 calls (4%). AHRI enforces UTM injection on all assets. Default source value "direct_untagged" appended to all untagged leads.
- INSIGHT 2: One-day-pass source = 96% of call volume (72/75) at 0% booking rate, avg score 3.6/10. AHRI does not generate day-pass-only lead magnets. All offers bundle a specific appointment.
- INSIGHT 3: Top objection = commitment resistance across multiple calls. All ad copy and landing page text frames the call as a concierge scheduling service, not a sales interaction.
- INSIGHT 4: 94.7% of calls (71/75) unclassified — zero archetype data. Landing page archetype radio question now captures this pre-call. GHL Workflow 1 archetype tagging still pending.
- INSIGHT 5: Soft commitments ("I guess, later today") result in zero show rate. Pre-appointment nurture sequence (confirmation SMS + 2-hour reminder) designed in nurture-sync v1.1 — pending GHL implementation.

## Future Sessions
- Session 20: Confirmation tests → Goal 6 R2 Migration (needs R2 credentials from Kai)
- Session 21: Goal 7 Three-Tier Portal + Goal 8 Handbook Export
- Session 22+: Second gym location live (Eaton) — after SOP complete and R2 migrated
- Session 23+: Vision + Syndra cross-brain data sharing (once both systems have meaningful data)
