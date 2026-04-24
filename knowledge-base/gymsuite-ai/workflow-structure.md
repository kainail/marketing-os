# GymSuite AI — GHL Workflow Structure
# AHRI reads this before generating any nurture-sync update package.
# This is the live architecture of the 5-workflow nurture system that runs in GHL.

---

## System Overview

GymSuite AI runs inside GoHighLevel (GHL). When a lead enters GHL from any AHRI-generated
campaign, Jessica — the ElevenLabs AI voice layer — and a 5-workflow SMS sequence run in
parallel. AHRI's job is to get the lead into GHL. Jessica and the SMS sequences handle
everything after that.

The system is architected around one core insight: different people need different language
to feel understood. A one-size-fits-all nurture sequence converts at 20–30% of its potential.
A hyperpersonalized sequence that speaks to the individual's psychology converts at 3–5x that.
The A/B/C/D archetype detection in Workflow 1 is the key to this.

---

## GHL Custom Values (All Workflows Use These)

These merge fields must be preserved exactly — never alter them in generated copy.

| Merge Field | What It Resolves To |
|---|---|
| `{{contact.first_name}}` | Lead's first name |
| `{{custom_values.gym_name}}` | Anytime Fitness (franchise location name) |
| `{{custom_values.coach_name}}` | Assigned coach's first name |
| `{{custom_values.gym_phone}}` | Direct gym line |
| `{{custom_values.booking_link}}` | Online booking / orientation scheduling link |
| `{{custom_values.offer_name}}` | Active offer name (updated per offer cycle) |
| `{{custom_values.cohort_start_date}}` | Next cohort start date (updated per cohort) |
| `{{custom_values.spots_remaining}}` | Current open spots in cohort (Kai updates manually) |

`{{custom_values.offer_name}}` and `{{custom_values.cohort_start_date}}` and
`{{custom_values.spots_remaining}}` are updated manually by Kai each offer cycle.
AHRI must not hardcode offer names or dates into script copy — always use the merge fields.

---

## Workflow 1: Hyperpersonalization Filter

**Purpose:** Identify lead source, send a context-appropriate opener, detect archetype,
route to the correct archetype nurture workflow.

**Triggers:**
- New contact added to GHL with tag `source: facebook-ad`
- New contact added with tag `source: free-pass`
- New contact added with tag `source: lost-join`
- (All other lead sources get `source: facebook-ad` by default until more tags are configured)

**Flow:**

```
Lead enters GHL
  ↓
[Delay: 2 minutes]
  ↓
[Condition: lead source tag]
  ├── source: facebook-ad    → Send Facebook Opener
  ├── source: free-pass      → Send Free Pass Opener
  └── source: lost-join      → Send Lost Join Opener
  ↓
[Delay: 30 minutes — wait for reply]
  ↓
[Condition: reply contains A, B, C, or D]
  ├── Reply = A → Add tag: archetype-social   → Trigger Workflow 2
  ├── Reply = B → Add tag: archetype-analytical → Trigger Workflow 3
  ├── Reply = C → Add tag: archetype-supportive → Trigger Workflow 4
  ├── Reply = D → Add tag: archetype-independent → Trigger Workflow 5
  └── No reply / unclear → [Delay: 4 hours] → Re-send A/B/C/D prompt (once) → Route C if still no reply
```

**Archetype Key:**
- **A = Social:** Motivated by community, group energy, belonging. Wants friends at the gym.
- **B = Analytical:** Motivated by tracking, data, visible progress. Wants to see numbers move.
- **C = Supportive:** Motivated by guidance, safety, being seen. Wants a coach who checks in.
- **D = Independent:** Motivated by autonomy, no pressure, self-directed. Wants access, not hand-holding.

**Jessica parallel trigger:** Outbound call to all new leads fires within 30 minutes of lead entry,
regardless of workflow stage. SMS and voice run simultaneously. Jessica does not wait for archetype
detection — she uses her own verbal detection protocol on the call.

---

## Workflow 2: Social Archetype Nurture (30 Days)

**Trigger:** Tag `archetype-social` applied
**Voice:** Warm, community-forward, "you're going to love the people here"
**Primary fear:** Loneliness, showing up somewhere where nobody knows them
**Primary desire:** Belonging, being part of something, social energy around fitness

**Day cadence:**

| Day | Timing | Message Label | Evergreen? |
|---|---|---|---|
| 0 | Evening (within 4h of archetype detection) | Archetype welcome + differentiator | UPDATE with offer |
| 1 | 8am | Energy / identity message | UPDATE with offer |
| 2 | 10am | Community proof message | EVERGREEN |
| 3 | 4pm | Real member social proof | EVERGREEN |
| 4 | 6pm | "Still with you" / proof | UPDATE with offer |
| 5 | 10am | Content / fun fact | EVERGREEN |
| 6 | 3pm | Light engagement | EVERGREEN |
| 7 | 9am | Visit suggestion | UPDATE with offer |
| 10 | 9am | Re-engagement | EVERGREEN |
| 14 | 9am | Two-week check-in | EVERGREEN |
| 18 | 9am | Objection address | EVERGREEN |
| 22 | 9am | Social proof | EVERGREEN |
| 26 | 10am | Soft urgency | EVERGREEN |
| 30 | 9am | Final / cohort close | EVERGREEN |

---

## Workflow 3: Analytical Archetype Nurture (30 Days)

**Trigger:** Tag `archetype-analytical` applied
**Voice:** Specific, data-forward, results-oriented
**Primary fear:** Investing time and seeing no measurable change
**Primary desire:** Visible, trackable progress with clear metrics

**Day cadence:** (Same day timing as Workflow 2)

| Day | Timing | Message Label | Evergreen? |
|---|---|---|---|
| 0 | Evening | Archetype welcome + differentiator | UPDATE with offer |
| 1 | 8am | Progress / tracking message | UPDATE with offer |
| 2 | 10am | Program structure / what to expect | EVERGREEN |
| 3 | 4pm | Result-specific social proof | EVERGREEN |
| 4 | 6pm | "What you'll notice by week 2" | UPDATE with offer |
| 5 | 10am | Mechanism explanation | EVERGREEN |
| 6 | 3pm | FAQ / process | EVERGREEN |
| 7 | 9am | Visit suggestion | UPDATE with offer |
| 10 | 9am | Progress check-in | EVERGREEN |
| 14 | 9am | Two-week milestone | EVERGREEN |
| 18 | 9am | Data / proof | EVERGREEN |
| 22 | 9am | Progress framing | EVERGREEN |
| 26 | 10am | Results urgency | EVERGREEN |
| 30 | 9am | Final / tracking frame | EVERGREEN |

---

## Workflow 4: Supportive Archetype Nurture (30 Days)

**Trigger:** Tag `archetype-supportive` applied
**Voice:** Warm, reassuring, "we've got you every step of the way"
**Primary fear:** Being left alone to figure it out, embarrassment, failure
**Primary desire:** Consistent guidance, someone who notices them, safety net

**Day cadence:** (Same day timing as Workflow 2)

| Day | Timing | Message Label | Evergreen? |
|---|---|---|---|
| 0 | Evening | Archetype welcome + differentiator | UPDATE with offer |
| 1 | 8am | "We're here" / coach relationship | UPDATE with offer |
| 2 | 10am | Orientation / onboarding process | EVERGREEN |
| 3 | 4pm | Coach social proof | EVERGREEN |
| 4 | 6pm | Accountability / still with you | UPDATE with offer |
| 5 | 10am | Small win framing | EVERGREEN |
| 6 | 3pm | Reassurance / low bar | EVERGREEN |
| 7 | 9am | Visit suggestion | UPDATE with offer |
| 10 | 9am | Check-in | EVERGREEN |
| 14 | 9am | "Still here for you" | EVERGREEN |
| 18 | 9am | Objection / fear address | EVERGREEN |
| 22 | 9am | Coach relationship proof | EVERGREEN |
| 26 | 10am | Gentle urgency | EVERGREEN |
| 30 | 9am | Final / invitation | EVERGREEN |

---

## Workflow 5: Independent Archetype Nurture (30 Days)

**Trigger:** Tag `archetype-independent` applied
**Voice:** Respectful, no-pressure, "here when you want it"
**Primary fear:** Being pushed, followed up on too aggressively, losing control
**Primary desire:** Self-determination, access without obligation, privacy

**Day cadence:** (Same day timing as Workflow 2)

| Day | Timing | Message Label | Evergreen? |
|---|---|---|---|
| 0 | Evening | Archetype welcome + differentiator | UPDATE with offer |
| 1 | 8am | Freedom / access message | UPDATE with offer |
| 2 | 10am | How to use the gym on your terms | EVERGREEN |
| 3 | 4pm | Independent member social proof | EVERGREEN |
| 4 | 6pm | "No pressure / here when ready" | UPDATE with offer |
| 5 | 10am | App / self-service resources | EVERGREEN |
| 6 | 3pm | Light touch | EVERGREEN |
| 7 | 9am | Visit suggestion | UPDATE with offer |
| 10 | 9am | No-pressure check-in | EVERGREEN |
| 14 | 9am | Two-week light touch | EVERGREEN |
| 18 | 9am | Resource / value | EVERGREEN |
| 22 | 9am | Proof from independent members | EVERGREEN |
| 26 | 10am | Soft deadline | EVERGREEN |
| 30 | 9am | Final / open door | EVERGREEN |

---

## Technical Notes for AHRI

**A/B split testing in GHL:**
Split nodes in GHL can be added at any step of a workflow. When AHRI generates A/B variants
for individual messages, Kai adds a split node in the workflow at that step, routes 50% to
each variant, and tracks conversion (booking booked = conversion event) in GHL reporting.

**The Syndra attribution connection:**
Syndra reads GHL conversion data weekly. When cross-brain sync is live, AHRI will receive
booking rate by message, by archetype, by offer. Until then, Kai reports A/B results manually.

**Evergreen vs. offer-specific:**
Messages marked EVERGREEN do not reference the active offer and do not need to be updated
when the offer changes. AHRI only generates updated copy for messages marked UPDATE.
Evergreen messages remain in GHL unchanged across offer cycles.

**Compliance in GHL:**
GHL merge fields are used as-is. AHRI must never substitute literal values for merge fields
in generated copy — the merge field must appear exactly as documented above.

**Message length target:**
SMS messages: 160 characters or under (one SMS segment). If over 160, mark [2-segment].
GHL can send multi-segment SMS but cost doubles. Flag any message over 160 chars.
