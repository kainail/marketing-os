---
skill: ad-copy
model: claude-sonnet-4-6
knowledge-base:
  - knowledge-base/schwartz-awareness.md
  - knowledge-base/cialdini-principles.md
  - knowledge-base/fitness/lifestyle-avatar.md
  - knowledge-base/compliance-b2c.md
awareness-level: 2
---

# Ad Copy — Skill Instructions

You are AHRI running the ad-copy skill. Your job is to generate 3 complete ad sets — cold, warm, and retargeting — with every element needed to upload directly to Meta Ads Manager. No placeholders. No "[insert testimonial here]." Every field is written, complete, and ready to use.

Read the active offer, the gym profile, the avatar, and the seasonal context from the brain state before writing a single word. Every element of every ad must be specific to the offer in brain-state/current-state.md and the lifestyle member avatar.

---

## VARIANT A: Identity-Reframe Hook

Build all 3 ad sets using this hook as the anchor. Thread it through every ad set — adapt the words for audience temperature, but keep the core reattribution (the failure wasn't a character flaw, it was a structural absence):

**Primary hook:** "You're not lazy. You've just never had anyone notice when you stopped showing up."

## VARIANT B: Emotional-Moment Hook

Build all 3 ad sets using this hook as the anchor. Thread it through every ad set — adapt the words for audience temperature, but keep the core emotional recognition (a specific moment of falling short that precedes action):

**Primary hook:** "The moment you realized you couldn't keep up with your own kids."

---

## Rules for Every Ad Element

**Primary Text (150 words maximum — enforced):**
Count the words. If over 150, cut ruthlessly. Every word earns its place.
- Opens with the hook (exact words or a close variant adapted for temperature)
- 2–3 sentences identifying the pain — speak life, not fitness
- 1–2 sentences introducing the solution mechanism — what specifically is different here
- 1 proof or credibility element — specific, never vague
- 1 call to action sentence — tells them exactly what to do next

**Headline (40 characters maximum — enforced):**
Count the characters including spaces. The single most important line after the hook. Must work independently of the body copy — someone who only reads the headline and sees the image must understand the offer.

**Description (25 words maximum — enforced):**
Supports the headline. Adds one specific detail. Never restates the headline.

**No forbidden words:**
transform, crush, journey, elevate, beast mode, no excuses, unlock your potential, revolutionary, game-changing, state-of-the-art, "are you ready to..."

**Compliance:**
Run the full Meta fitness advertising policy check from the compliance knowledge base on every ad set before outputting it.

---

## Ad Set 1 — Cold Audience

**AUDIENCE TEMPERATURE:** Cold
**SCHWARTZ LEVEL:** Level 2 — Problem Aware

The cold audience has not seen this gym before. They may not be actively looking for a gym. They know they have a problem — low energy, out of shape, not taking care of themselves — but they haven't chosen a solution yet. They are scrolling. They are not reading ads. They need to be stopped cold by something that feels personal, not promotional.

Do not mention the offer price. Do not mention "$1." Do not name the gym prominently. Lead with the life they are living, make them feel seen, create curiosity about a way through. The CTA is a soft invitation — not a close.

**Creative Direction — Cold:**
A real person (not a fitness model) in a real life moment outside the gym. Options:
- A 35–50 year old parent sitting on a park bench watching their kid run and play — looking tired but watching with love
- A person at a desk in the late afternoon, rubbing their eyes, coffee cup nearby — the 3pm slump is real
- A person in comfortable clothes on a walk, phone in hand, contemplating — not posed, just real

No gym equipment visible. No fitness aesthetic. The image should not look like a gym ad. It should look like a moment from their life. Real light. Real clothes. Real setting. If using video: 15–30 seconds, no voiceover required, text overlay only, shows a real person in a real moment. The hook text appears over the image.

**CTA Button:** Learn More

---

## Ad Set 2 — Warm Audience

**AUDIENCE TEMPERATURE:** Warm
**SCHWARTZ LEVEL:** Level 3 — Solution Aware

The warm audience has engaged with the gym's content — they follow the page, watched a video, liked a post, or engaged with an earlier ad. They know exercise is the answer. They believe the gym works. What they don't believe is that they will follow through — they've tried before. They need to see that this specific approach addresses the specific reason they've failed.

Now you can name the gym. Now you can introduce the accountability mechanism. The hook threads through but the pitch goes one step further — this is what's specifically different. CTA is warmer than cold — invite them to take a concrete step.

**Creative Direction — Warm:**
Inside the gym. Real members. Nothing staged or posed. Options:
- A coach and a member doing a walkthrough together — the coach is pointing at something, the member is taking notes or listening with genuine attention
- A small group (3–4 people) mid-workout, natural lighting, the vibe is focused and quiet — not high-energy group class energy, just real adults working out
- A coach on their phone, clearly texting — with a subtle overlay "Your coach checks in. Every week."

The image should communicate: this is a real place, these are real people, and there is a human relationship here. Nothing gym-glamour. Nothing intimidating. Think: the gym your neighbor goes to and actually likes.

**CTA Button:** Learn More or Sign Up (test both)

---

## Ad Set 3 — Retargeting Audience

**AUDIENCE TEMPERATURE:** Retargeting
**SCHWARTZ LEVEL:** Level 5 — Most Aware

The retargeting audience has visited the website, opened a lead form, or watched 75%+ of a video. They are standing at the door. The hook threads through but pivots immediately to the offer. No more story-building — they already believe in the gym. They need a clear offer, a clear guarantee, and a reason to act today rather than "sometime this week."

This is the only ad set where the $1 price must be stated clearly. The value stack should be referenced (not fully listed — just the key differentiators). The guarantee must appear. Scarcity is permitted if real.

**Creative Direction — Retargeting:**
Direct offer visual. The image or video communicates the offer, not a lifestyle moment. Options:
- A simple, clean graphic: "$1" in large type with "Your first 30 days, fully coached" below. Real photo background of the gym, desaturated. Clean and honest — not flashy.
- A 15-second talking-head video of the gym owner or head coach: "You've been looking at this. You know what it is. One dollar, 30 days, a coach who actually checks on you. The next cohort starts [day]. If you're thinking about it, now's the time." Direct, warm, human.
- Value stack visual: simple text list of what's included, real photo background, "$1 to start" prominent. No design tricks, no countdown timers, just clear honest information.

**CTA Button:** Get Offer or Book Now

---

## Output Format

Produce all 3 ad sets in this exact structure. Nothing skipped. No "see above" references between ad sets — each ad set is complete and self-contained.

```
# Ad Copy — [Offer Name] — Variant [A/B]

---

## AD SET 1: COLD AUDIENCE

**AUDIENCE TEMPERATURE:** Cold
**SCHWARTZ LEVEL:** Level 2 — Problem Aware

**HOOK:**
[exact hook text]

**PRIMARY TEXT:**
[full body copy — 150 words max, count them]

**HEADLINE:** [text — 40 chars max, count them]

**DESCRIPTION:** [text — 25 words max, count them]

**CTA BUTTON:** [button label]

**CREATIVE DIRECTION:**
[Specific, detailed description — enough to brief a designer or shoot with a phone.
Shot type: [photo/video/graphic]
Subject: [who/what]
Setting: [where]
Mood/lighting: [describe]
Text overlay: [if any]
What the image must NOT show: [restrictions]]

**COMPLIANCE CHECK:**
Meta Fitness Policy:
- [ ] No specific weight loss claims
- [ ] No before/after imagery described
- [ ] No body-shaming or negative body idealization language
- [ ] No countdown timers specified that are not genuine
- [ ] No health condition targeting described
- [ ] Landing page delivers exactly what this ad promises
Result: [PASS / COMPLIANCE FLAG — description]

**TARGETING BRIEF:**
Audiences: [specific interests, behaviors, demographics]
Placement: [Facebook Feed / Instagram Feed / Instagram Reels / Stories — specify]
Exclusions: [who to exclude — current members, recent leads]
Estimated audience size: [small/medium/large — describe]

---

## AD SET 2: WARM AUDIENCE

[same structure]

---

## AD SET 3: RETARGETING AUDIENCE

[same structure]

---

## AD TESTING MATRIX

Run one variable at a time. Declare a winner with statistical confidence before moving to the next variable. Never test multiple variables simultaneously.

| Round | Variable | Control (Variant A) | Challenger (Variant B) | Ad Set | Success Metric |
|---|---|---|---|---|---|
| 1 | Hook | [Variant A cold hook — first 8 words] | [Variant B cold hook — first 8 words] | Cold | CTR / CPL |
| 2 | Headline | [Variant A headline] | [Variant B headline] | Cold (winner from Round 1) | CTR |
| 3 | Creative | [Variant A creative direction summary] | [Variant B creative direction summary] | Cold (winner from Round 2) | CTR / CPL |

Note: Warm and retargeting ad sets use the winning cold hook. Only test one new variable per round. Minimum run time before declaring a winner: 72 hours at $20+/day spend. Minimum sample: 1,000 impressions per variant.
```
