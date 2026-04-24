# GymSuite AI — Current SMS Scripts
# knowledge-base/gymsuite-ai/current-sms-scripts.md
# 
# This file contains ALL current GHL SMS scripts organized by workflow.
# AHRI reads this file when running the nurture-sync skill.
# Do not edit the scripts in this file — edit in GHL directly after AHRI generates updates.
# Last updated: Session 8 build

---

## JESSICA — MASTER SMS BOT IDENTITY

Jessica is a digital assistant for the local manager {{custom_values.manager_name}} 
at {{custom_values.gym_name}}.

Core behavioral rules:
- Always address user by first name using {{first_name}}
- Keep messages under 3 short sentences
- Never send large paragraphs
- Sound conversational
- Do not list features unless directly asked
- Focus on users goals, not the gym
- Always end messages with a question unless: confirming a time, handling opt-out, answering a direct question that does not require follow-up

Conversation states (tracked internally):
STATE 1 — Discovery
STATE 2 — Clarification
STATE 3 — Fit Confirmation
STATE 4 — Visit Suggestion
STATE 5 — Scheduling

Four archetypes (detected from A/B/C/D response):
- SOCIAL (A) — fun, classes, community, people, energy
- ANALYTICAL (B) — clear plan, results, numbers, program, pricing
- SUPPORTIVE (C) — accountability, support, consistency, nervous, intimidated
- INDEPENDENT (D) — 24/7 access, on my own, browsing, flexible

---

## WORKFLOW 1 — HYPERPERSONALIZATION FILTER
## The universal entry point — all new leads start here

### SMS 1 — Day 0 Immediate (all lead sources)

**Facebook Ad Lead:**
Hey {{first_name}}, it's Jessica from {{custom_values.gym_name}}. You requested info from our Facebook ad, so quick question so I send the right stuff: when you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll send the best next step.

**Appointment Booked — Confirmation:**
Hey {{first_name}}, it's Jessica from {{custom_values.gym_name}}. I've got you booked for {{appointment_time}} at {{custom_values.gym_name}}. If anything changes just text me here.

**Appointment Booked — Segmentation (sent after confirmation):**
Quick thing so we make your {{appointment_time}} visit useful, {{first_name}}: when you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll tailor what we cover.

**Free Pass / Tour Lead:**
Hey {{first_name}}, it's Jessica from {{custom_values.gym_name}}. Saw you grabbed a free pass or tour on our site and we want to personalize it for you. When you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll send the best way to use your pass.

**Abandoned Checkout:**
Hey {{first_name}}, it's Jessica from {{custom_values.gym_name}}. I saw you were close to joining online but didn't finish, so quick question so I don't send random info: when you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll send the most relevant next step.

### A/B/C/D Response handling

**A — Social response:**
"Love that, {{first_name}}… sounds like the vibe matters.
Just curious… what got you interested in the gym?"

**B — Analytical response:**
"Got it… having a clear plan is big
Out of curiosity… what kind of results are you hoping for?"

**C — Supportive response:**
"That makes sense… accountability helps a lot of people stay consistent.
Just curious… what made you start looking for a gym right now?"

**D — Independent response:**
"Gotcha… flexibility is important.
Just curious… are you mainly exploring or looking to start soon?"

**If lead does not reply A/B/C/D (example — price question):**
"Good question — we've got a few options.
Just curious… are you mainly looking for simple gym access or something with more guidance?"

---

## WORKFLOW 2 — SOCIAL ARCHETYPE SEQUENCE
## For leads who answered A (fun people, classes, community)

### Week 1 — Day 0 through Day 7 (1 per day)

**Day 0 Evening:**
Hey {{contact.first_name}}, it's Jessica at {{custom_values.gym_name}} again. We've got a pretty fun crowd in tonight's sessions and it reminded me of what you picked. Would it help to swing by this week just to see if the vibe feels like your people?

**Day 1 Morning:**
Morning {{contact.first_name}}! Quick tip: most of our social members book the same class time each week so they see the same faces and it feels more like a friend group than a workout. If you did join a gym, what time of day would feel easiest for you to show up?

**Day 2 Evening:**
Quick story, {{contact.first_name}}: Sarah joined last month not knowing anyone and now she has a regular crew in our evening class who text each other to stay consistent. Does having people expecting you make it easier for you to follow through, or do you mostly rely on yourself right now?

**Day 3 Morning:**
Just checking in, {{contact.first_name}}. A lot of people tell me they're nervous about being the 'new person,' but usually after one visit they realize everyone started that way. Would a quick no-pressure tour help you decide if it feels welcoming enough?

**Day 4 Evening:**
Hey {{contact.first_name}}, we're always doing a fun workout where members can bring a friend and hang out after. If you could pop in for 15-20 minutes to see it, would that feel less intimidating than a normal gym visit?

**Day 5 Morning:**
Small tip from members who stay consistent: they treat workouts like a standing hangout with friends instead of a chore. When you picture enjoying the gym, do you see yourself more in a class with people or lifting and chatting between sets?

**Day 6 Evening:**
Out of curiosity, {{contact.first_name}}... are you mostly exploring gyms for 'sometime this year,' or thinking about actually starting something in the next few weeks?

**Day 7 Morning:**
Honestly the easiest way to know if {{custom_values.gym_name}} is your kind of crowd is to stop by and meet a few people. Would it make sense to swing by for a quick look around sometime this week?

### Weeks 2-4 — 2 texts per week

**Day 10 Evening:**
Hey {{contact.first_name}}, quick social tip: pick one friend or coworker and make a 'gym date' so it feels like catching up, not just exercising. If you did start, do you already have someone in mind you'd want to bring with you?

**Day 14 Evening:**
Win from this week: Jamie hit 20 straight check-ins and our evening crew stayed after to celebrate. When people join we also do a New Member Orientation and free Evolt body scan so they can see progress, but most say the community is what keeps them coming. Would being in that kind of group make it easier for you to stay consistent?

**Day 18 Morning:**
Most people quit when workouts feel lonely; our most consistent members say the group energy is what keeps them coming even on tired days. Do you think having that kind of built-in support would make it more realistic for you to stick with it this time?

**Day 22 Evening:**
{{contact.first_name}}, we've got a 'First Timer' class coming up where lots of newer folks come in together and we keep things extra beginner-friendly. If I saved you a spot just to watch or join lightly, would that feel like a good first step?

**Day 26 Evening:**
Quick check-in, {{contact.first_name}}... are you still thinking about getting back into a gym with a fun group, or did something else take priority for now?

**Day 30 Evening:**
Hey {{contact.first_name}}, I don't want to bug you, just wanted to close the loop. Do you want me to keep you posted on fun events and beginner-friendly classes here, or should I pause texts for now?

### Social Archetype Email Sequence

**Email 1 — "Meet the crew" (Week 1)**
Subject: Want to meet your future workout crew?
Body: [Community-focused, introduces the concept of workout crews, low-pressure visit CTA]

**Email 2 — "Events & bring-a-friend" (Week 2)**
Subject: Low-pressure way to check us out
Body: [First-timer events, bring a friend angle, no expectations framing]

**Email 3 — "First visit jitters" (Week 3)**
Subject: Nervous about being the "new person"?
Body: [Addresses new person anxiety, social proof that everyone starts nervous, tour CTA]

---

## WORKFLOW 3 — ANALYTICAL ARCHETYPE SEQUENCE
## For leads who answered B (clear plan, results, tracking)

### Week 1 — Day 0 through Day 7 (1 per day)

**Day 0 Evening:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}}. Most people who pick clear plan & results like knowing exactly what they'd be doing on day one, so would a quick 15-20 minute visit to map that out be helpful for you?

**Day 1 Morning:**
Morning {{contact.first_name}}... a lot of our members get better results once they have a simple 2-3 day routine that actually fits their week, so when you picture working out, which days usually make the most sense for you?

**Day 2 Evening:**
Quick thought for you, {{contact.first_name}}... most people overestimate what they can do in a week and underestimate what they can do in 12 weeks, so if we built a 90-day plan together, what would you want to see change the most by then?

**Day 3 Morning:**
Just so I'm sending the right info, {{contact.first_name}}... are you more focused on changing how you look (weight, inches, shape) or how you feel (energy, health markers, strength) right now?

**Day 4 Evening:**
Short story: one member started with a simple 3-day plan and over 3 months dropped 12 lbs and cut his resting heart rate by 8 points once we tracked his sessions, so would seeing a clear starting plan like that make it easier for you to decide if this is worth it?

**Day 5 Morning:**
When people join we do a New Member Orientation and a free Evolt body scan so they have real numbers to track instead of guessing, so would having that kind of baseline data make it feel more in control for you?

**Day 6 Evening:**
Out of curiosity {{contact.first_name}}, are you mostly comparing gyms and gathering info right now, or are you hoping to get a plan in place and start within the next few weeks?

**Day 7 Morning:**
Honestly the easiest way to see if {{custom_values.gym_name}} can give you the structure you want is to stop by once so we can sketch out a simple game plan, so would it make sense to swing by for a quick tour and chat sometime this week?

### Weeks 2-4 — 2 texts per week

**Day 10 Evening:**
Hey {{contact.first_name}}, quick tip for results-focused people: schedule your workouts in your calendar like meetings so they don't get pushed, so if we built a plan around your actual schedule, what time of day tends to be most realistic for you?

**Day 14 Evening:**
Recent win: a member who came twice a week for 8 weeks lost 9 lbs and dropped a notch on their belt once we set a simple plan and tracked sessions, so if we set up a visit where you could see how we plan and track for you, would that help you decide faster?

**Day 18 Morning:**
Most people stall because they keep restarting random programs instead of following one simple plan long enough to see the numbers move, so would it be helpful to sit down once and map out what your first 30 days would actually look like?

**Day 22 Evening:**
{{contact.first_name}}, we've got a low-key intro time this week where we walk through how we build plans and you can see the space without any pressure to join, so if I found a 15-20 minute slot that matched your usual workout time would you want me to hold it for you?

**Day 26 Evening:**
Quick check-in, {{contact.first_name}}... are you still thinking about getting a proper plan in place at a gym, or has that dropped down the priority list for now?

**Day 30 Evening:**
Hey {{contact.first_name}}, I'll pause the follow-ups after this one, so before I do would you like me to keep you in the loop on plan-focused tips and any low-pressure times to come in, or should I stop texting you for now?

### Analytical Archetype Email Sequence

**Email 1 — "Your 90-Day Plan Snapshot" (Day 0-1)**
Subject: Your 90-day gym plan in plain English
Body: [Plain text from manager, 3 bullets on workout structure, tracking, booking CTA]

**Email 2 — "Numbers & Proof" (Day 3-4)**
Subject: What 8-12 weeks actually looks like here
Body: [Case study with specific numbers, Evolt scan as baseline data, booking CTA]

**Email 3 — "How to Choose a Gym by the Numbers" (Day 10-14)**
Subject: A simple checklist to compare gyms
Body: [Comparison checklist: commute, structure, tracking, support — positions gym well]

---

## WORKFLOW 4 — SUPPORTIVE ARCHETYPE SEQUENCE
## For leads who answered C (accountability, support, consistency)

### Week 1 — Day 0 through Day 7 (1 per day)

**Day 0 Evening:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}}. A lot of people who pick support & accountability are a little nervous starting on their own. Would it feel easier if you came in once to meet the team and see how we support you before you decide anything?

**Day 1 Morning:**
Morning {{contact.first_name}}... totally normal to feel a bit unsure getting back into a routine. When you think about having support, what do you feel like you need most to actually stay consistent this time?

**Day 2 Evening:**
Quick check-in, {{contact.first_name}}. Most members tell me they've tried doing it alone and keep falling off, so what usually gets in the way for you when you start something new?

**Day 3 Morning:**
When someone is there to encourage you and check in, it usually feels a lot less overwhelming, so would having a coach or team keeping an eye on you help you feel more confident starting?

**Day 4 Evening:**
Short story for you, {{contact.first_name}}... one member said she almost didn't come because she was embarrassed, but after her first visit she said "everyone was so kind, I actually felt relieved." Would a no-pressure visit like that help you see if you'd feel comfortable here?

**Day 5 Morning:**
When people join we do a New Member Orientation and a free Evolt body scan to help them understand where they're starting, not to judge them. Would knowing we walk you through everything like that make it feel a bit safer to come in?

**Day 6 Evening:**
Out of curiosity, {{contact.first_name}}... are you mostly thinking "I know I need to do something, just scared to start," or is it more about timing and being busy right now?

**Day 7 Morning:**
Honestly the easiest way to see if we're the right kind of supportive environment is to stop by once, meet us, and ask your questions. Would it make sense to swing by for a quick, zero-pressure visit sometime this week?

### Weeks 2-4 — 2 texts per week

**Day 10 Evening:**
Hey {{contact.first_name}}, a lot of people think they have to be "in shape" before they come to a gym, but the truth is most of our members started out of shape and a bit nervous. Does it help to know we're used to starting people slowly and at their own pace?

**Day 14 Evening:**
Win from this week: one member who almost quit in week 2 said the only reason she kept going was because people here kept checking in on her. If you had that kind of accountability, what would you hope to feel different about yourself in the next few months?

**Day 18 Morning:**
Most people don't fall off because of the workouts; they fall off because they feel alone or judged. If we could make it feel calm, encouraging, and judgment-free for you, would that remove most of what's holding you back?

**Day 22 Evening:**
{{contact.first_name}}, we've got a very beginner-friendly time this week where we keep things slower and walk people through everything step by step. If I found a 15-20 minute window there for you just to see it and chat, would you want me to hold it?

**Day 26 Evening:**
Quick check-in, {{contact.first_name}}... are you still thinking about finding some support to get back into a routine, or has that taken a back seat for now?

**Day 30 Evening:**
Hey {{contact.first_name}}, I'll stop the follow-ups after this so I don't crowd you. Do you want me to keep you in the loop on beginner-friendly times and supportive options here, or should I pause texts for now?

### Supportive Archetype Email Sequence

**Email 1 — "We'll walk with you, not push you"**
Subject: We'll walk with you, not push you
Body: [Addresses not feeling lost or judged, what a guided start looks like, booking CTA]

**Email 2 — "What support actually looks like here"**
Subject: What support actually looks like here
Body: [Concrete support mechanics: 2-3 check-ins per week, team notices if you slip, booking CTA]

**Email 3 — "Worried you'll quit again?"**
Subject: Worried you'll quit again?
Body: [Addresses start-stop pattern, win-first 30-day plan, low-pressure visit CTA]

---

## WORKFLOW 5 — INDEPENDENT ARCHETYPE SEQUENCE
## For leads who answered D (24/7 access, do their own thing)

### Week 1 — Day 0 through Day 7 (1 per day)

**Day 0 Evening:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}}. Since you like doing your own thing, would it help to swing by once, see the space and equipment, and then decide quietly if it feels right for you?

**Day 1 Morning:**
Morning {{contact.first_name}}... most people who like to train solo care a lot about crowd levels. Do you usually prefer lifting when it's quieter or when there's a bit more energy around?

**Day 2 Evening:**
Quick question, {{contact.first_name}}... when you picture using a gym, are you thinking more "get in, hit my workout, get out," or do you like to take your time and hang a bit?

**Day 3 Morning:**
We've got options for both quick solo sessions and longer ones. Would a simple 15-20 minute visit to walk the floor and see if it matches your style be useful?

**Day 4 Evening:**
Some people just want to know they can get in, find the equipment they need, and not be bothered. Does having that kind of no-pressure environment matter most for you right now?

**Day 5 Morning:**
When people join, we can do a New Member Orientation and a free Evolt body scan if they want more structure, but it's optional. Would you rather just have access first and decide on extras later?

**Day 6 Evening:**
Out of curiosity, {{contact.first_name}}... are you mainly browsing gyms in case you feel like starting, or are you actually thinking of picking a place in the next few weeks?

**Day 7 Morning:**
Easiest way to know if {{custom_values.gym_name}} works for you is to see it once in person and check the vibe. Would it make sense to stop by for a quick look around so you can decide without any pressure?

### Weeks 2-4 — 2 texts per week

**Day 10 Evening:**
Hey {{contact.first_name}}, most independent lifters stick to a few key lifts and just need the right setup and freedom. Is having enough racks, weights, and space the main thing you're checking for in a gym?

**Day 14 Evening:**
Some members tell me they like knowing our hours and busy times so they can train when it's quieter. Would it be helpful if you came in once and we showed you the best times for solo training?

**Day 18 Morning:**
Most people who prefer "on my own" still like having the option to ask a quick question if they ever get stuck. Does having that as a backup matter to you, or are you totally self-sufficient with your workouts?

**Day 22 Evening:**
{{contact.first_name}}, if I found a 15-20 minute window that lines up with when you'd normally work out, would you want to swing by, walk the floor, and see if it feels like a spot you'd actually use?

**Day 26 Evening:**
Quick check-in, {{contact.first_name}}... are you still thinking about finding a gym you can use on your own terms, or has that dropped on the priority list for now?

**Day 30 Evening:**
Hey {{contact.first_name}}, I'll pause the follow-ups after this so I don't crowd you. Do you want me to keep you in the loop in case we have flexible access deals or should I stop texting you for now?

### Independent Archetype Email Sequence

**Email 1 — "Simple access, on your terms"**
Subject: Prefer to just do your own thing?
Body: [Respects autonomy, no hovering, first visit is just a floor walk, booking CTA]

**Email 2 — "Check the gym out without any commitment"**
Subject: Check the gym out without any commitment
Body: [No hard close, no same-day decision, they control the timeline]

**Email 3 — "A practical first step when you are ready"**
Subject: For when you actually feel ready to start
Body: [For people who don't want to start until they know they can stick with it]

---

## WORKFLOW 6 — ONE-DAY PASS LEADS

**Day 0 SMS 1:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}}. Saw you grabbed a free pass or tour on our site and we want to personalize it for you. When you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll send the best way to use your pass.

**Day 1 SMS 2:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}} again. Your free pass is ready whenever you are - we usually recommend booking a quick time so someone can greet you and show you around. Do mornings or evenings usually work better for you?

**Day 3 SMS 3:**
Quick heads up, {{contact.first_name}}... most first visits are just 15-20 minutes to get you checked in, look around, and answer questions before you use your pass. Would a quick after-work stop or a weekend visit be easier for you?

**Day 6 SMS 4:**
Hey {{contact.first_name}}, just a reminder your free pass is active for about two weeks, so it's a good time to use it if you still want to check us out. Would it make more sense to swing by in the next few days or push it to next week?

**Day 10 SMS 5:**
Quick thought, {{contact.first_name}}... even one focused visit can help you see if a gym's layout, people, and schedule actually fit your life. No pressure to join when you use your pass - it's just a chance to see how it feels. Want me to find a time that lines up with your usual day?

**Day 14 SMS 6:**
Hey {{contact.first_name}}, I'll pause the follow-ups about this free pass after this so I don't bug you. Do you want me to keep you in the loop on future free intro times and beginner-friendly options, or should I stop texting for now?

### One-Day Pass Email Sequence

**Email 1 — "Here's how to actually use your pass" (Day 0-2)**
Subject: Your free pass at {{custom_values.gym_name}}
Body: [Practical rundown of how to use the pass, booking link, walk-in option noted]

**Email 2 — "Is this still on your radar?" (Day 5)**
Subject: Still planning to use your free pass?
Body: [Low-pressure check-in, 3 things a single visit helps them figure out, booking CTA]

---

## WORKFLOW 7 — ABANDONED CHECKOUT (LOST JOIN LEADS)

**Day 0 SMS 1:**
Hey {{contact.first_name}}, it's Jessica from {{custom_values.gym_name}}. I saw you were close to joining online but didn't finish, so quick question so I don't send random info: when you think about joining a gym now, what matters most?
A) Fun people & classes
B) Clear plan & results
C) Support & accountability
D) 24/7 access to do your own thing
Reply A-D and I'll send the most relevant next step.

**Day 1 SMS 2:**
Hey {{contact.first_name}}, sometimes people stop the online join because of timing or a question that pops up. Would it be easier if I sent you a quick link to finish on your phone, or would you rather pop in and have us set it up in person?

**Day 3 SMS 3:**
Just checking in, {{contact.first_name}}... you were really close to getting started the other day. Usually once someone joins they get a simple plan and we walk them through the basics so they're not guessing. Would it help more to talk through things by text first or book a short visit?

**Day 5 SMS 4:**
Out of curiosity, {{contact.first_name}}... was there something specific that made you pause on the join screen (timing, price, questions), or did life just get busy?

**Day 9 SMS 5:**
Hey {{contact.first_name}}, if you're still thinking about joining, we can get everything wrapped up in 1-2 minutes either online or when you stop by. Would you like me to resend the join link, or would you prefer to schedule a quick in-club visit to handle it?

**Day 14 SMS 6:**
Hey {{contact.first_name}}, I'll pause the follow-ups about your membership after this so I don't crowd you. Do you want me to keep you posted on simple ways to get started later, or should I stop texting for now?

### Abandoned Checkout Email Sequence

**Email 1 — "You were almost in" (Day 0-1)**
Subject: You were close to joining {{custom_values.gym_name}}
Body: [3 reasons people stop (timing, confusing, had a question), two paths: finish online or book visit]

**Email 2 — "Want us to just handle it for you?" (Day 5-7)**
Subject: Want help getting this finished?
Body: [Simple: finish online or come in, reply "online" or "in person" routing]

---

## WORKFLOW 8 — TWO-MESSAGE BOOKING SYSTEM
## Used across all archetype workflows after discovery is complete

**Part 1 — Soft Visit Suggestion:**
"Honestly the easiest way to see if the gym would fit what you're looking for is to stop by and check it out"
Then: "Would it make sense to swing by and take a quick look around?"

**Part 2 — Scheduling:**
"When you picture working out, what days/times usually work best?"
Then: "Nice… would evenings or afternoons be better?"

---

## GLOBAL FAQ RESPONSES (used across all workflows)

1. Where are you located? → {{custom_values.complete_gym_address}}
2. What hours are you open? → {{custom_values.hours_of_operation}}
3. What is this about? → Follow-up from {{custom_values.business_full_name}} to help schedule a free club tour
4. Who is this? → With {{custom_values.gym_name}}
5. Why am I getting this? → Likely from a referral or Facebook form
6. How long is the tour? → 15-20 minutes, customized to your schedule
7. Do I have to sign up if I come in? → Not at all, zero pressure
8. Is the tour free? → Yes, 100% free
9. Can I walk in instead? → We recommend scheduling so someone is available
10. What if I can't make it this week? → Want me to follow up next week instead?
11. Can I bring a friend? → Absolutely, bring a buddy or partner
12. What equipment do you have? → Cardio, weights, turf, recovery tools
13. Do you offer coaching or personal training? → {{custom_values.personal_training}}
14. Is it beginner friendly? → 100%, team helps you feel comfortable right away
15. How much is membership? → Flexible plans, best to talk about what you're looking for
16. Any current specials? → {{custom_values.special_promo}}
17. What is the transformation challenge? → {{custom_values.transformation_challenge}}
18. How much does the transformation challenge cost? → Free if you show up to sessions
19. 14-day challenge or PT kickstart → 14-day coaching start, map out a simple plan, coached sessions, earn credit back

---

## NOTES FOR AHRI — NURTURE-SYNC SKILL

When generating offer-aligned script updates, AHRI rewrites the content of each SMS
while preserving:
- The GHL variable syntax exactly: {{contact.first_name}}, {{custom_values.gym_name}}, etc.
- The timing and sequence structure (Day 0, Day 1, Day 3, etc.)
- The archetype-specific tone (Social = warmer, Analytical = clearer, Supportive = reassuring, Independent = shorter)
- The two-message booking system format
- The 3-sentence maximum rule
- The single question per message rule

AHRI changes:
- The offer reference (from generic gym visit to the active offer)
- The pain point angle (aligned to the offer's positioning)
- The proof references (aligned to the offer's guarantee and differentiator)
- The CTA angle (aligned to the offer's urgency mechanism)

AHRI never changes:
- GHL variable syntax
- Timing structure
- Compliance language
- FAQ responses (these are factual, not offer-specific)
