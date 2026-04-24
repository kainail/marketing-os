# GymSuite AI — Workflow Structure
# knowledge-base/gymsuite-ai/workflow-structure.md
#
# ACCURATE MAP — reflects actual GHL build
# Last updated: corrected after Kai confirmed structure
# Key correction: Workflow 1 is one large combined workflow handling
# all lead source detection, segmentation, and archetype routing.
# One-day pass, lost joins, and immediate FB messages are all INSIDE Workflow 1.

---

## ACTUAL WORKFLOW MAP

| # | Workflow Name | Type | Purpose |
|---|---|---|---|
| 1 | Hyperpersonalization Filter | Master entry workflow | Lead source detection + segmentation + archetype tagging + routing |
| 2 | Social Archetype Nurture | Archetype-specific | 30-day cadence for Social (A) leads |
| 3 | Analytical Archetype Nurture | Archetype-specific | 30-day cadence for Analytical (B) leads |
| 4 | Supportive Archetype Nurture | Archetype-specific | 30-day cadence for Supportive (C) leads |
| 5 | Independent Archetype Nurture | Archetype-specific | 30-day cadence for Independent (D) leads |

---

## WORKFLOW 1 — HYPERPERSONALIZATION FILTER (THE BIG ONE)

This is one large GHL workflow that handles everything at the entry point.
All new leads enter here regardless of source.

### What Workflow 1 does — in sequence:

**Step 1 — Lead source detection**
GHL detects where the lead came from and fires the correct opening SMS:
- Facebook ad lead → Facebook ad opener
- Free pass / tour lead → Free pass opener
- Lost join / abandoned checkout → Abandoned checkout opener
- General / referral / other → Default opener

All openers end the same way — with the A/B/C/D segmentation question.

**Step 2 — A/B/C/D segmentation**
The segmentation SMS fires immediately after the source-specific opener.
Every lead gets the same four options regardless of source.

**Step 3 — AI reads response and tags archetype**
When the prospect replies, the AI:
- Reads the response
- Maps it to the correct archetype (Social / Analytical / Supportive / Independent)
- If they reply with words instead of A/B/C/D — maps their language to closest archetype
- Tags the contact with the archetype label in GHL

**Step 4 — Routes to archetype workflow**
Once tagged, the lead is moved out of Workflow 1 and into the correct archetype workflow:
- Social tag → Workflow 2
- Analytical tag → Workflow 3
- Supportive tag → Workflow 4
- Independent tag → Workflow 5

### Key insight for AHRI — nurture-sync skill:

One-day pass leads and lost join leads are NOT in separate workflows.
They enter Workflow 1 with a different opening SMS, go through the same
A/B/C/D detection, get tagged, and move into the same archetype workflows as everyone else.

The ONLY thing different about these lead types is their opening message in Step 1.
Everything after that is identical to any other lead of the same archetype.

---

## WORKFLOWS 2-5 — ARCHETYPE NURTURE SEQUENCES

Each archetype workflow handles the full 30-day nurture cadence
for leads that have been tagged and routed from Workflow 1.

### Structure per archetype workflow:

**Week 1 (Day 0-7): 1 SMS per day + outbound call attempts**
Day 0 Evening, Day 1 Morning, Day 2 Evening, Day 3 Morning,
Day 4 Evening, Day 5 Morning, Day 6 Evening, Day 7 Morning

**Weeks 2-4 (Day 10-30): 2 SMS per week**
Day 10, Day 14, Day 18, Day 22, Day 26, Day 30

**Email: 3-email sequence runs parallel to SMS cadence**

**Outbound calls: tied to key SMS days throughout the sequence**

---

## WHAT AHRI UPDATES IN EACH WORKFLOW

### Workflow 1 updates (when offer changes):

AHRI rewrites the source-specific opening messages to reference the active offer:
- Facebook ad opener: updated to reference the offer the ad was promoting
- Free pass opener: updated to connect the pass to the active offer
- Lost join opener: updated to reference what they almost joined

AHRI does NOT change:
- The A/B/C/D segmentation question (this is universal)
- The archetype detection and routing logic
- Any GHL conditional logic or branching

### Workflows 2-5 updates (when offer changes):

AHRI rewrites offer-referencing messages in the Day 0-7 sequence.
Weeks 2-4 messages are mostly evergreen — AHRI only rewrites ones that
reference the offer, a specific result, or a specific differentiator.

AHRI generates the update as a labeled package:

[WORKFLOW 1 UPDATE — Step 1 Facebook opener]
[paste new message here]

[WORKFLOW 2 UPDATE — Day 0 Evening]
[paste new message here]

[WORKFLOW 3 UPDATE — Day 0 Evening]
[paste new message here]

etc.

So you know exactly which GHL workflow, which step, and what to paste in.

---

## A/B SPLIT TEST — SETUP PLAN (WHEN READY)

Current status: NOT SET UP
Kai is open to implementing this.

When ready, add a random split node INSIDE each archetype workflow
(Workflows 2, 3, 4, 5) at the Day 0 Evening message:

Split configuration per workflow:
- Path A (50%): current evergreen script
- Path B (50%): AHRI-generated offer-aligned script

Data capture required:
- GHL custom field: script_variant (value: A or B — set at the split node)
- GHL custom field: offer_id (set when lead enters from Workflow 1)
- Both fields feed into master call log in Google Sheets for Syndra to analyze

Syndra reads these fields weekly:
- Booking rate: Path A vs Path B per archetype
- Show rate: Path A vs Path B per archetype
- Conversion rate: Path A vs Path B per archetype

Winner promoted to control at end of 30-day window.
AHRI generates new challenger based on winning patterns.

Note: The split node in each archetype workflow, NOT in Workflow 1.
Workflow 1 always runs the same — the split happens after archetype routing.

---

## GHL CUSTOM FIELDS — REQUIRED FOR FULL INTELLIGENCE LOOP

| Field Name | Type | Set by | Purpose |
|---|---|---|---|
| utm_string | Text | Landing page form | Full UTM from the ad that generated the lead |
| lead_source_hook | Text | AHRI via UTM | Which hook generated the click |
| lead_source_offer | Text | AHRI via UTM | Which offer was active when lead captured |
| lead_source_variant | Text | AHRI via UTM | Landing page variant (COLD-FB, WARM-IG, SEARCH) |
| archetype | Text | Workflow 1 AI | Social / Analytical / Supportive / Independent |
| offer_id | Text | Workflow 1 | Which offer was active when lead entered |
| script_variant | Text | Split node (future) | A or B — for split test tracking |

---

## OFFER-ALIGNED SCRIPT UPDATE PROCESS

When AHRI generates a new offer via the offer-machine skill,
the nurture-sync skill generates a complete update package:

1. Workflow 1 opening messages updated
   — Facebook opener, free pass opener, lost join opener
   — All rewritten to reference the active offer

2. Workflow 2-5 Day 0-7 messages updated per archetype
   — Offer-specific angle embedded in each archetype's tone
   — Weeks 2-4 messages updated only where offer-specific

3. ElevenLabs outbound prompt opening section updated
   — New offer-specific opening line per archetype
   — Visit suggestion reframed around offer differentiator

4. A/B variant generated for every updated message

5. Complete update package delivered to:
   distribution/queue/pending-review/[SCRIPT-UPDATE-offer-name].md

6. Package is formatted as a GHL step-by-step guide:
   "Go to Workflow 1 → Step 1 → Facebook opener → replace with this:"
   [new message]
   "Go to Workflow 2 → Day 0 Evening → replace with this:"
   [new message]

7. Kai reviews, approves, updates GHL and ElevenLabs manually
   Marks package as implemented in distribution queue

8. Syndra begins tracking performance of updated scripts
   Vision reads results at month end
   AHRI generates improved version for next cycle
