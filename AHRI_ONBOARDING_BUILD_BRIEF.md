# AHRI Voice Onboarding — Build Brief
## For Claude Code | GymSuite AI Marketing OS

---

## What We Are Building

A standalone voice-powered onboarding interview system that runs during the sales call
with a new gym owner. AHRI speaks, the owner answers, and their complete marketing
system is configured in real time — live on the call.

This is simultaneously:
- The sales demo (closes the deal)
- The marketing onboarding (configures AHRI)
- The first product moment (owner sees their system working)

By the end of the call the owner has a fully configured AHRI knowledge base, their
first hooks generated, and their competitor intelligence captured — before technical
setup even begins.

---

## Existing System Context

GymSuite AI has two live Railway services relevant to this build:

**Marketing OS (marketing-portal service)**
URL: marketing-os-production-2b85.up.railway.app
This is where AHRI lives. The onboarding system extends this service.

**OPS Dashboard (gymsuiteai-dashboard service)**
URL: gymsuiteai-dashboard-production.up.railway.app
Admin-only. Not involved in this build directly.

**Existing infrastructure we are reusing:**
- ElevenLabs API — already integrated for weekly reports and Jarvis reports
  Variables: ELEVENLABS_API_KEY_[GYMID], ELEVENLABS_VOICE_ID_[GYMID]
- Anthropic API — already integrated for all AHRI generation
  Variables: ANTHROPIC_API_KEY_[GYMID]
- Google Places API — already integrated per gym
  Variables: GOOGLE_PLACES_API_KEY_[GYMID]
- Manus — already integrated for 16 intelligence tasks
  Variables: MANUS_API_BASE, MANUS_API_KEY_[GYMID]
- Cloudflare R2 — already integrated for persistent storage
  Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
- GHL — already integrated for CRM
  Variables: GHL_[GYMID]_API_KEY, GHL_[GYMID]_LOCATION_ID
- RESEND — already integrated for email
  Variables: RESEND_API_KEY

**Existing AHRI skills we are using (read these files before building):**
- hook-writer skill — generates hooks from the knowledge base
- offer-machine skill — scores and structures the offer
- All skills read from: brain-state/current-state.md, knowledge-base/fitness/lifestyle-avatar.md,
  knowledge-base/fitness/objection-vault.md, knowledge-base/compliance-b2c.md

---

## Architecture Decision

**This lives as a new standalone page within the marketing-os service.**

Route: /onboard
Full URL: marketing-os-production-2b85.up.railway.app/onboard

Reasons:
- No new Railway service needed — extends existing infrastructure
- ElevenLabs and Anthropic API already available in this service
- Can eventually be given its own subdomain (onboard.gymsuiteai.com) via Railway
- Owner never sees the full portal sidebar during the call — clean focused experience

**NOT inside the OPS Dashboard** — that is admin-only and shows other gyms' data.

---

## The Three Screens

### Screen 1 — Marcus's View (shared screen)
Route: /onboard/session/[sessionId]
What the gym owner sees during the call via screen share.

Design direction: Clean, premium, dark background. AHRI's voice visualized as a
subtle waveform or pulsing indicator when she speaks. The gym's name prominent at
the top. Two panels side by side — left panel shows the active conversation/question,
right panel shows the knowledge base files populating in real time as answers are
captured. When Manus research returns, it appears as cards with findings. When hooks
generate at the end, they appear one by one with animation.

This screen must be visually impressive. It is a product demo and a sales tool.
The owner should feel like they are watching something being built specifically for them.

### Screen 2 — Host Control Panel (Kai's view, not shared)
Route: /onboard/host/[sessionId]
What Kai sees in a separate browser tab during the call.

Shows everything Marcus sees PLUS:
- Pause/Resume AHRI button
- "Probe deeper" button — triggers AHRI to ask a follow-up on the current answer
- "Skip question" button — moves to next section if already covered conversationally
- "Flag weak answer" button — marks the answer for review, AHRI asks for more detail
- Live transcript of everything spoken
- Raw knowledge base file contents as they build
- Manual trigger for hook generation (don't wait for interview to complete)
- Session notes field — Kai can type notes that get saved to the gym's record

Design direction: Functional and dense. This is a control room, not a showpiece.
Information density over aesthetics. Monospace font for the live transcript.

### Screen 3 — Solo Mode (build placeholder, activate later)
Route: /onboard/solo/[token]
Sent directly to the gym owner via email link. No Kai present.
AHRI runs the full interview autonomously. Closing sequence added at the end.
BUILD PLACEHOLDER ONLY — do not build the full solo flow now. Create the route
and a "coming soon" state. Architecture should support it without a rebuild later.

---

## The Full Session Flow

### Phase 0 — Session Creation (before the call)
Kai creates a new session from the host panel.
Inputs: gym name, owner name, owner email, city, state, zip, franchise/independent.
System generates a sessionId and two URLs:
- Share URL (Marcus's view): /onboard/session/[sessionId]
- Host URL (Kai's view): /onboard/host/[sessionId]
Session state saved to R2: onboarding/sessions/[sessionId]/session.json

GHL pre-population: if GHL_API_KEY is available, pull the contact record
from GHL by email and pre-populate the session with any existing data.

### Phase 1 — Research (Manus runs immediately on session start)
The moment Kai opens /onboard/host/[sessionId], Manus Prospect Research task runs.

This is a NEW Manus task called "prospect-research". It does not exist yet.
Build it as task 17 in the Manus task system.

Prospect Research task collects:
1. Google Places API — reviews (up to 10), rating, review count, hours, photos,
   address confirmation, business category
2. Facebook page scrape — about section, recent posts, any visible offers,
   follower count (public data only, no auth required)
3. Meta Ad Library scan — all active ads from competitors within 15 miles.
   Competitors identified by gym-related business categories in the same city.
   For each competitor: ad count, ad themes, offer types, creative direction.
4. Website scrape — if website URL provided: homepage copy, about page,
   any existing offer language, testimonials
5. Market gap analysis — based on competitor ad themes, identify what nobody
   in this market is saying. This becomes AHRI's positioning foundation.

Manus output written to R2:
onboarding/sessions/[sessionId]/prospect-research.json

Structure:
{
  "gymName": "",
  "city": "",
  "googleReviews": [{ "text": "", "rating": 5, "date": "" }],
  "googleRating": 4.8,
  "googleReviewCount": 127,
  "competitors": [
    { "name": "", "adCount": 0, "adThemes": [], "offerType": "" }
  ],
  "marketGaps": [],
  "websiteCopy": "",
  "existingOfferLanguage": "",
  "franchiseType": ""
}

Manus runs in background. Marcus's view shows a subtle "AHRI is preparing..."
state. Host panel shows live Manus progress. When complete, Marcus's view
transitions to the opening state.

### Phase 2 — Research Reveal (Minutes 3-6)
AHRI speaks the research findings to Marcus.
This is the first wow moment — AHRI knows things about his gym without being told.

AHRI voice script (generated dynamically from prospect-research.json):
"Before we talk about your gym, let me show you what I already found.
I looked at [X] competitors in [city] running ads right now.
[Competitor 1] is running [X] ads — all focused on [theme].
[Competitor 2] is running [X] ads — all about [theme].
Nobody in [city] is talking about [market gap].
That's where we're going to play."

Then AHRI reads 2-3 real Google reviews from their profile:
"Your members are already telling the story. Here's what they're saying:
[review 1 text] — [rating] stars.
[review 2 text] — [rating] stars.
This is the language we're going to use."

Screen shows: competitor cards appearing, review cards appearing, market gap
highlighted. All animated, all specific to this gym.

### Phase 3 — First Hooks Generated (Minutes 6-8)
AHRI runs a lightweight version of hook-writer using ONLY the prospect research data.
No knowledge base files yet — pure market intelligence.

Generate 3 hooks maximum. These are the "without telling us anything" hooks.
Display them one by one on Marcus's screen as AHRI reads them aloud.

AHRI voice:
"This is what I can write about your gym right now — from public information alone.
[Hook 1 text]
[Hook 2 text]
[Hook 3 text]
Imagine what I build after we talk."

Save these to R2 as: onboarding/sessions/[sessionId]/preview-hooks.json

### Phase 4 — Transition to Interview (Minute 8)
AHRI transitions:
"Now I want to learn from you. I'm going to ask you some questions.
The better your answers, the sharper everything gets.
Watch the panel on the right — you'll see your marketing system being built
as we talk. Let's start."

### Phase 5 — The Voice Interview (Minutes 8-28)
AHRI conducts the interview using voice input and output.

**Voice input:** Web Speech API (browser-native, no additional cost) for transcription.
Fallback: text input field always visible for when speech recognition fails or
Marcus prefers to type.

**Voice output:** ElevenLabs API using AHRI's designated voice.
Use a consistent AHRI voice across all sessions — not per-gym voice.
Suggested: a warm, direct, professional female voice.
Store as AHRI_VOICE_ID in Railway environment variables (shared, not per-gym).

**Interview structure — 8 sections:**

SECTION 1: The Offer (feeds brain-state/current-state.md)
Questions AHRI asks:
Q1: "Walk me through your current offer — what does someone get, what do they pay,
     and what happens if it doesn't work for them?"
     [If vague, probe: "Be specific — what's the price, what's included day by day,
     what's the exact guarantee?"]
Q2: "What's the one thing in your offer that makes people say 'wait, that's included?'
     The thing you don't talk about enough."
Q3: "When does your next group start and how many spots are left?"

SECTION 2: The Avatar (feeds knowledge-base/fitness/lifestyle-avatar.md)
Q4: "Tell me about the last person who joined and made you think — this is exactly
     who we're built for. What was their life like before they walked in?"
     [AHRI generates 3 suggested avatars from research if Marcus struggles.
     Display as cards on screen. Marcus picks one.]
Q5: "What's the specific moment — the situation — when your ideal member finally
     decides to do something? For some gyms it's when they can't keep up with their
     kids. For others it's the doctor visit. What's yours?"
Q6: "What does their life look like 60 days after joining? Not fitness improvements
     — what actually changes day to day?"

SECTION 3: The Differentiator (feeds brain-state/current-state.md → mechanism)
Q7: "Based on what I found in your market, nobody in [city] is talking about [gap].
     What do you do specifically that fills that gap? Walk me through what happens
     in someone's first 30 days with you."
     [Generate 3 differentiator options from research if Marcus struggles]
Q8: "What would a member lose if your gym closed tomorrow that they couldn't
     get anywhere else?"

SECTION 4: Objections (feeds knowledge-base/fitness/objection-vault.md)
Q9:  "What's the most common reason someone doesn't sign up after hearing your offer?
      Say it exactly how they say it — in their words."
Q10: "What do you say that changes their mind?"
Q11: "What's the second most common objection? Again — their exact words."
Q12: "And the third?"

SECTION 5: Member Voice (feeds hook-writer with real VoC)
Q13: "I need you to think of 3 things members have actually said to you —
      word for word — about why they almost didn't come in."
      [AHRI pre-loads 2-3 review quotes found by Manus as examples:
      "I found these in your reviews — are any of these close to what you hear?"]

SECTION 6: Manager Voice (feeds reactivation + nurture sequences)
Q14: "When [manager name] is on the phone with a prospect, how do they actually talk?
      Not the pitch — how do they naturally speak? Three words."
Q15: "What does [manager name] always say that gets people to come in?"
Q16: "What should messages from your gym never sound like?"

SECTION 7: Compliance (feeds knowledge-base/compliance-b2c.md)
Q17: "Are there things you can't say or show in your advertising?
      Franchise rules, things that feel wrong for your gym, anything off-limits?"
      [If franchise detected from research, AHRI pre-populates known franchise
      restrictions and asks Marcus to confirm + add anything specific]

SECTION 8: Local Context (feeds seasonal + competitor context)
Q18: "Is there anything happening in [city] right now — events, school calendar,
      local news — that your ideal member is thinking about?"
Q19: "I found your Google reviews. Which 2 or 3 feel most like what you'd
      want new members to read?" [Show the reviews from Manus research on screen]

**When Marcus struggles with any question:**
AHRI generates 3 suggested answers using:
- Manus research data for this gym
- AHRI's fitness industry knowledge base
- The avatar and market context already established in this session

Display options as cards on Marcus's screen. He picks one, refines it verbally,
or says "none of these" and AHRI asks a more specific follow-up.

**Knowledge base updates in real time:**
After each section completes, the corresponding file panel on Marcus's screen
updates with a visible "writing..." animation and then shows the populated content.
This is the right panel of Screen 1 — Marcus watches his marketing brain being built.

### Phase 6 — Final Hook Generation (Minutes 28-32)
Interview complete. All four knowledge base files written.
AHRI immediately runs the full hook-writer skill against the complete knowledge base.

Generate 5 hooks (up from 3 at the start — now far more specific).
Display them one by one on Marcus's screen as AHRI reads them aloud.

AHRI voice:
"Remember the first three hooks I generated from public data alone?
Here's what I build now that I know your story."

[Hook 1 appears with animation, AHRI reads it]
[Hook 2 appears, AHRI reads it]
[etc.]

Then AHRI says:
"These are ready to run. Your first campaign brief is being prepared now."

Run offer-machine skill in background and save output.
Save all hooks to R2: onboarding/sessions/[sessionId]/hooks.json

### Phase 7 — Session Complete (Minutes 32-35)
AHRI:
"Your marketing system is configured. Here's what we built today:
- Your avatar: [one sentence summary]
- Your market position: [the gap identified]
- Your offer: [offer name and price]
- Your guarantee: [guarantee one line]
- Five hooks ready to run.
The technical setup begins today. You'll be live within 3 days."

Screen shows: Summary card with everything built. Status indicators.
"What happens next" section with the 3-day timeline.

Session state updated in R2: status: "complete"
Trigger: send Kai a notification email via Resend with session summary.
Trigger: create GHL contact record for the new gym owner if not already exists.

---

## Knowledge Base File Formats

Files written to R2 at: onboarding/sessions/[sessionId]/knowledge-base/

### brain-state/current-state.md
```
# Brain State — [Gym Name]
# Generated: [date] | Session: [sessionId]

## Active Offer
Name: [offer name]
Price: [price]
Duration: [duration]
Included: [what's included]
Guarantee: [guarantee word for word]
Post-trial price: [ongoing price]
Cohort start: [date]
Spots remaining: [number]

## Active Avatar
Primary: [avatar name/description]
Age range: [range]

## Market Context
City: [city]
Franchise: [type or independent]
Market gap: [the positioning opportunity]
Top competitor: [name and why]

## Winning Hooks (initial)
[Hook 1]
[Hook 2]
[Hook 3]

## Mechanism
[The one specific differentiator AHRI will thread through everything]

## Seasonal Context
[Current month and what's emotionally true for the avatar right now]
```

### knowledge-base/fitness/lifestyle-avatar.md
```
# Lifestyle Avatar — [Gym Name]
# Generated: [date]

## Who They Are
[Narrative description from Q4 answer]
Age range: [from Q4]
Day in the life: [from Q5 answer]

## The Moment
[The specific triggering situation from Q5]

## Previous Failures
[What they've tried that didn't work — from Q4]

## Dream Outcome
[What changes 60 days after joining — from Q6]

## VoC Phrases (exact words)
[From Q13 answers — word for word]
[From Google reviews pulled by Manus]

## What Makes Them Different
[The insight from Q8 — what they'd lose if the gym closed]
```

### knowledge-base/fitness/objection-vault.md
```
# Objection Vault — [Gym Name]
# Generated: [date]

## Objection 1 (most common)
Their exact words: "[Q9 answer]"
Response that works: "[Q10 answer]"

## Objection 2
Their exact words: "[Q11 answer]"
Response that works: [to be filled in follow-up or assumed from context]

## Objection 3
Their exact words: "[Q12 answer]"
Response that works: [to be filled in follow-up or assumed from context]
```

### knowledge-base/compliance-b2c.md
```
# Compliance Rules — [Gym Name]
# Generated: [date]

## Franchise Rules
[Franchise type]: [known restrictions for this franchise type]
[Any specific rules Marcus confirmed in Q17]

## Gym-Specific Rules
[Anything Marcus added in Q17]

## Brand Voice
Manager personality: [3 words from Q14]
What always works: "[Q15 answer]"
Never sound like: "[Q16 answer]"

## FTC/Meta Standard Rules
- No before/after body transformation images
- No specific weight loss claims without substantiation
- No guaranteed result language
- No body shaming
- SMS requires explicit consent
- All lead capture forms include privacy policy
```

---

## New Manus Task — Prospect Research (Task 17)

Add to the existing Manus task system in marketing-portal.

```javascript
// Task definition
{
  id: "prospect-research",
  name: "Prospect Research",
  description: "Pre-interview research for new gym onboarding",
  schedule: "on-demand", // never scheduled — always triggered by session creation
  category: "onboarding",
  
  // Inputs required
  inputs: {
    gymName: String,
    city: String,
    state: String,
    zip: String,
    franchiseType: String, // "franchise" | "independent" | "boutique"
    websiteUrl: String // optional
  },
  
  // Steps
  steps: [
    "google_places_lookup",    // Reviews, rating, hours, photos
    "facebook_page_scrape",    // Public page data
    "meta_ad_library_scan",    // Competitor ads in market
    "website_scrape",          // Existing copy (if URL provided)
    "market_gap_analysis"      // AHRI synthesizes gaps from competitor data
  ]
}
```

The market_gap_analysis step calls Claude Haiku with the competitor ad data
and asks: "What marketing angles are NOT being used by any competitor in this market?
What is nobody saying about gym membership in [city]?"

Output written to R2: onboarding/sessions/[sessionId]/prospect-research.json

---

## Voice Integration

### AHRI Speaking (ElevenLabs)
Use existing ElevenLabs integration pattern from weekly reports.
Add new env variable: AHRI_VOICE_ID (shared across all sessions — AHRI's consistent voice)
Add new env variable: AHRI_ELEVENLABS_API_KEY (can reuse existing key or separate)

AHRI speaks:
- Every question
- Every suggested answer option (brief intro before displaying cards)
- All research findings in Phase 2
- All hook reveals
- Section transitions
- Session complete summary

Streaming: Stream ElevenLabs audio using their streaming API so AHRI starts
speaking before the full audio is generated. This reduces perceived latency.

### Owner Speaking (Web Speech API)
Use browser-native Web Speech API for transcription.
This requires no API key and no additional cost.

Implementation:
```javascript
const recognition = new webkitSpeechRecognition() || new SpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = 'en-US';
```

Show live transcription on screen as Marcus speaks — the text appears in real time.
When speech ends (silence detected), lock the transcript and send to AHRI for processing.

Fallback: text input field always visible below the voice interface.
Toggle button: "Switch to typing" / "Switch to voice"

AHRI processing of answer:
1. Receive transcript
2. Evaluate if answer is sufficient for the question's purpose
3. If sufficient: extract structured data, update knowledge base file, move to next question
4. If insufficient: generate a follow-up probe question and ask it
5. Maximum 2 follow-up probes per question before moving on

---

## New Railway Environment Variables Required

Add to marketing-portal service:

```
AHRI_VOICE_ID                    # ElevenLabs voice ID for AHRI (shared)
AHRI_ELEVENLABS_API_KEY          # ElevenLabs API key for AHRI voice
ONBOARDING_SESSION_SECRET        # JWT secret for session URL signing
GOOGLE_PLACES_API_KEY_SHARED     # Places API key for prospect research (pre-gym)
META_AD_LIBRARY_ACCESS_TOKEN     # For competitor ad scanning (shared)
```

Note: GOOGLE_PLACES_API_KEY_SHARED is needed because the prospect research
runs BEFORE a gym has its own per-gym API key. Use a shared key for onboarding,
then the per-gym key takes over after setup.

---

## R2 Storage Structure for Onboarding

```
onboarding/
  sessions/
    [sessionId]/
      session.json              # Session metadata and status
      prospect-research.json    # Manus research output
      preview-hooks.json        # First 3 hooks (from research only)
      transcript.json           # Full interview transcript
      knowledge-base/
        brain-state/
          current-state.md
        knowledge-base/
          fitness/
            lifestyle-avatar.md
            objection-vault.md
          compliance-b2c.md
      hooks.json                # Final 5 hooks (from full knowledge base)
      offer-machine.json        # Offer Machine skill output
      session-complete.json     # Summary sent to Kai on completion
```

---

## Session State Machine

Session progresses through these states:
```
created → researching → research_complete → interview_started →
section_[1-8]_complete → interview_complete → generating_hooks →
hooks_complete → session_complete
```

State saved to R2: onboarding/sessions/[sessionId]/session.json

State is the source of truth — if the owner closes the browser and comes back,
the session resumes from where they left off. AHRI says:
"Welcome back. We were in the middle of [section]. Ready to continue?"

---

## Build Phases

### Phase 1 — Foundation (build first)
- [ ] New route /onboard in marketing-portal
- [ ] Session creation endpoint: POST /api/onboarding/sessions
- [ ] Session state storage in R2
- [ ] Basic two-screen layout (Marcus view + host panel)
- [ ] Prospect Research Manus task (task 17)
- [ ] Manus trigger on session creation

### Phase 2 — Research Display
- [ ] Research results display on Marcus's screen (competitor cards, review cards, gap)
- [ ] AHRI voice reads research findings (ElevenLabs integration)
- [ ] Preview hook generation (lightweight hook-writer against research only)
- [ ] Hooks displayed and spoken on Marcus's screen

### Phase 3 — Interview Engine
- [ ] Voice input (Web Speech API) with text fallback
- [ ] 8-section interview flow with all 19 questions
- [ ] AHRI generates 3 suggestions when owner struggles (per section)
- [ ] Answer evaluation logic (sufficient vs needs follow-up)
- [ ] Follow-up probe question generation

### Phase 4 — Knowledge Base Builder
- [ ] Real-time knowledge base file population as answers come in
- [ ] Live file panel on Marcus's screen showing files being written
- [ ] R2 write for each section as it completes (not all at end)
- [ ] Final knowledge base validation before hook generation

### Phase 5 — Final Generation & Close
- [ ] Full hook-writer skill run against complete knowledge base
- [ ] Offer-machine skill run in background
- [ ] Hook reveal — animated, spoken one by one
- [ ] Session complete screen with full summary
- [ ] Kai notification email via Resend
- [ ] GHL contact creation for new gym owner

### Phase 6 — Host Control Panel
- [ ] Pause/Resume AHRI
- [ ] Probe deeper trigger
- [ ] Skip question trigger
- [ ] Flag weak answer trigger
- [ ] Live transcript display
- [ ] Raw knowledge base file view
- [ ] Manual hook generation trigger
- [ ] Session notes field

### Phase 7 — Solo Mode Placeholder
- [ ] Route /onboard/solo/[token] created
- [ ] "Coming soon" state with placeholder UI
- [ ] Architecture documented for future autonomous close sequence

---

## Design Direction

**Marcus's view (Screen 1):**
Dark, premium, focused. Think: mission control for their marketing.
- Background: very dark navy or near-black (#0D0F14 range)
- AHRI speaking indicator: subtle animated waveform in purple/violet
- Gym name prominent at top in light text
- Two-panel layout: conversation on left, knowledge base building on right
- Fonts: a distinctive geometric sans for headings, clean mono for data
- Hooks reveal: each hook slides in from the bottom with a brief fade
- Status indicators: green when a file section is complete
- Overall feeling: this owner is watching their business's marketing brain
  be configured in real time. It should feel significant.

**Host panel (Screen 2):**
Functional, information-dense, control room aesthetic.
- Light or dark — whichever makes the controls most readable
- Monospace font for transcript
- Clear button hierarchy: Pause is always most prominent
- Real-time indicators for Manus status, AHRI processing state
- Log view for all background operations

---

## Critical Rules

1. AHRI never generates content with forbidden words:
   transform, crush, journey, elevate, beast mode, no excuses,
   unlock your potential, revolutionary, game-changing, state-of-the-art,
   "are you ready to..."

2. Every hook generated passes the compliance check from AHRI.md before display.
   If a hook fails compliance, regenerate — never display a non-compliant hook.

3. ElevenLabs streaming must start within 1 second of AHRI beginning to speak.
   Pre-generate the first sentence of each question while the previous answer
   is being processed to eliminate perceived latency.

4. The Web Speech API fallback (text input) must ALWAYS be visible.
   Never force voice-only. Some owners will prefer to type.

5. Session state is written to R2 after every single answer.
   If the browser crashes, the session is recoverable.

6. The META_AD_LIBRARY_ACCESS_TOKEN for competitor research must NEVER
   appear in any client-side code. All Meta API calls go through the
   marketing-portal backend.

7. The /onboard/session/[sessionId] route requires no login.
   It is secured by the sessionId itself (treat as a token — make it unguessable).
   Use crypto.randomUUID() or equivalent for sessionId generation.

8. The /onboard/host/[sessionId] route requires admin login (Kai only).
   Use existing JWT_SECRET authentication from the marketing-portal.

---

## Files to Read Before Building

Read these existing files in the codebase to understand patterns before building:

In marketing-portal:
- server.js — existing route patterns and middleware
- config/locations.js — how gym configs are structured
- Any existing ElevenLabs integration code (search for ELEVENLABS)
- Any existing Manus task code (search for manus or MANUS)
- R2 storage helpers (search for R2 or cloudflare)

AHRI skill files (in .claude/marketing-os/ or wherever skills live):
- AHRI.md — AHRI's identity and rules
- hook-writer SKILL.md — inputs and outputs expected
- offer-machine SKILL.md — inputs and outputs expected

---

## Start Here

Read the existing server.js and identify:
1. How existing routes are structured
2. How ElevenLabs is currently called (weekly report / Jarvis pattern)
3. How Manus tasks are currently triggered and polled
4. How R2 reads and writes are currently handled
5. How authentication is currently checked

Then begin Phase 1: create the /onboard route and session creation endpoint.
Build the simplest possible version first — a page that creates a session,
stores it in R2, and returns the two URLs (Marcus view + host panel).
Get that working end to end before adding voice or interview logic.

---

*Build Brief version 1.0 | GymSuite AI | May 2026*
*Prepared for Claude Code handoff*
