# GymSuite AI — Current SMS Scripts (All Workflows)
# AHRI reads this before generating any nurture-sync update package.
# These are the CURRENT scripts running in GHL. They are generic (not offer-specific).
# The nurture-sync skill identifies which messages need offer-specific updates and rewrites them.

---

## How to Read This File

Each message is labeled:
- [GENERIC — UPDATE] = References a generic gym visit, result, or CTA. Will be stronger offer-aligned.
- [EVERGREEN — KEEP] = Pure discovery, archetype detection, scheduling, or social content. No update needed.

GHL merge fields appear exactly as used in GHL. Do not alter them.

Character counts are approximate. Messages over 160 chars are marked [2-segment].

---

## WORKFLOW 1 — HYPERPERSONALIZATION FILTER

### Facebook Ad Opener [GENERIC — UPDATE]

```
Hey {{contact.first_name}}! 👋 Saw you were interested in {{custom_values.gym_name}} — excited you reached out!

Quick question to make sure we point you in the right direction. What matters most to you right now when it comes to working out? Reply with the letter:

A) Being around a supportive community / group energy
B) Tracking real progress and seeing results
C) Having a coach guide and support you every step
D) Total flexibility — going at your own pace, no pressure

Just reply A, B, C, or D 🙂
```
[2-segment]

---

### Free Pass Opener [GENERIC — UPDATE]

```
Hey {{contact.first_name}}! 👋 Your free pass for {{custom_values.gym_name}} is ready — so glad you're checking us out.

Before you come in, quick question so we can make your visit actually useful. What matters most right now?

A) Community and group energy
B) Tracking progress and seeing results
C) Coach guidance and personal support
D) Flexibility — on your own terms

Just reply A, B, C, or D 😊
```
[2-segment]

---

### Lost Join Opener [GENERIC — UPDATE]

```
Hey {{contact.first_name}} — it's {{custom_values.coach_name}} from {{custom_values.gym_name}}. I see you were this close to joining a little while back. Totally understand life gets in the way.

Checking in to see if anything's changed. Quick question — what matters most to you when it comes to working out?

A) Community / group energy
B) Tracking real results
C) Coach support and guidance
D) Your own pace, no pressure

Reply A, B, C, or D — I'll send you something actually useful 🙂
```
[2-segment]

---

## WORKFLOW 2 — SOCIAL ARCHETYPE NURTURE

### Day 0 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, you sound like someone who thrives with others around. Good news — that's exactly what {{custom_values.gym_name}} is built for. 

We have members who started strangers and now hold each other accountable every week. The community here is genuinely one of the things people say they didn't expect.

We'd love to show you around. Any questions before you come in? 🙌
```
[2-segment]

---

### Day 1 Morning [GENERIC — UPDATE]

```
Morning {{contact.first_name}}! Thinking about you today.

A lot of people tell us the thing they were missing wasn't motivation — it was people. A place where someone notices if you haven't shown up.

That's what we've built at {{custom_values.gym_name}}. You don't have to go it alone. Come see what that feels like 💪
```

---

### Day 2 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, one of our members Sarah told us last week: "I came here because it's close to my house. I stayed because of the people."

That's what we hear a lot. The proximity gets people in the door. The community keeps them coming back.

What would getting started look like for you? 😊
```

---

### Day 3 Afternoon [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — quick one. We have a 6am Tuesday/Thursday group that started 8 months ago. Three of them met here. Now they carpool.

I'm not promising you'll find your best friends here. But I'm not not promising that either 😄

{{custom_values.gym_name}} is open whenever you're ready.
```

---

### Day 4 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, still thinking about {{custom_values.gym_name}}?

Here's what I want you to know: a lot of people who come here have tried gyms before and stopped. That's not unusual. What's different here is that when people go quiet, we notice. And we reach out.

You don't have to have it all figured out to start. We'll figure it out together. Any questions? 🙏
```
[2-segment]

---

### Day 5 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, did you know that people who work out with at least one other person are 95% more likely to still be training at 6 months vs. people going it alone?

Accountability is the system. Community is the accountability.

Just a thought 😊 — {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

### Day 6 Afternoon [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — no pressure at all. Just wanted to check in.

If there's anything that's been on your mind about joining — questions, concerns, "I'm not sure if..." — I'm genuinely happy to answer. Just reply back.

{{custom_values.coach_name}} 🙂
```

---

### Day 7 Morning [GENERIC — UPDATE]

```
{{contact.first_name}}, honestly — the easiest way to know if {{custom_values.gym_name}} is right for you is just to come in once.

Not a sales thing. Just come and see the gym, meet whoever's there, and see how it feels. No commitment. Your schedule, your call.

Book a time here: {{custom_values.booking_link}} — or just reply and we'll figure something out 👋
```

---

### Day 10 Morning [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — just checking in. Life gets busy, I get it.

The gym is here when you're ready. If there's a specific day or time that works for a first visit, I can make sure someone's around to meet you.

What does your week look like? 😊 — {{custom_values.coach_name}}
```

---

### Day 14 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — two weeks since we connected. Hope you're doing well.

Genuinely no pressure here, just didn't want you to feel like we forgot about you. We didn't.

If you want to come in and see what the community's like before committing to anything — that's always an option. Just say the word. 🙌
```

---

### Day 18 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, a thought:

The hardest part of starting the gym isn't the workouts. It's getting in the door the first time. Once you've done that once, it gets dramatically easier.

Is there anything specific that's made it hard to take that step? I'm asking because I genuinely want to help — not to sell you anything.

— {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```
[2-segment]

---

### Day 22 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, I want to share something a member said last month:

"I thought everyone here would be super fit and I'd be embarrassed. The first person I met was a 52-year-old guy who'd never worked out in his life. We've been going every Tuesday for six months."

You'd fit right in. 😊 — {{custom_values.gym_name}}
```

---

### Day 26 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — our next new member group starts soon.

If community-driven fitness is what you're looking for, it's a good time to join — the energy when a group starts together is something you can't recreate once it's underway.

Spot still open if you want it: {{custom_values.booking_link}} 🙌
```

---

### Day 30 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — last message from me, I promise.

If you ever want to come in, the door is always open. And if now just isn't the right time — genuinely, no problem. I hope you find something that works for you.

We're here if you change your mind. 🙏 — {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

## WORKFLOW 3 — ANALYTICAL ARCHETYPE NURTURE

### Day 0 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, you sound like someone who wants to see real, measurable progress — not just "feel better." That's exactly what we're set up for.

At {{custom_values.gym_name}}, your coach tracks your attendance, your personal records, and your early wins from day one. You'll always know where you stand.

Any questions about how the program is structured? 📊
```
[2-segment]

---

### Day 1 Morning [GENERIC — UPDATE]

```
Morning {{contact.first_name}}!

Quick data point: our members who complete their first 12 sessions in 30 days are 4x more likely to still be training at 6 months than those who don't.

The first 30 days are everything. That's why we built a system specifically around those first 30 days — to make sure they happen.

{{custom_values.gym_name}} is ready when you are 📈
```
[2-segment]

---

### Day 2 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, here's what your first 30 days at {{custom_values.gym_name}} look like:

Week 1: Orientation + first 3 sessions + baseline measurements
Week 2: Coaching check-in + program adjustment if needed
Week 3–4: Build the habit, track the progress

Nothing is vague. Everything is measurable. Sound like a plan? 🙂
```

---

### Day 3 Afternoon [EVERGREEN — KEEP]

```
{{contact.first_name}} — one of our members, a project manager, told us: "I needed to see the process before I could commit. Once I saw how structured the onboarding was, it was an easy yes."

We're organized here. The system is visible and trackable. 

Want to see the full breakdown? Just ask 📋
```

---

### Day 4 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, here's an honest number: most new gym members stop going between day 12 and day 18.

That's why we have a specific check-in built into week 2 at {{custom_values.gym_name}}. Not a generic automated message — an actual review of your attendance and what's working.

We've designed the dropout window out of the program. Any questions? 📊
```
[2-segment]

---

### Day 5 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, the research on fitness habits is pretty clear: the biggest predictor of long-term consistency isn't motivation or genetics — it's having a structured first 30 days.

That window is what separates people who become gym-goers from people who tried the gym.

{{custom_values.gym_name}} is built around that window specifically. Whenever you're ready 🙂
```

---

### Day 6 Afternoon [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — any questions about how we track progress or what the first 30 days actually look like in practice?

I'm happy to walk you through the specifics. Numbers, timeline, what to expect at each checkpoint.

Just reply 📋 — {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

### Day 7 Morning [GENERIC — UPDATE]

```
{{contact.first_name}}, the easiest way to get a clear picture of how {{custom_values.gym_name}}'s program works is to come in for a 30-minute walkthrough.

We'll go over the equipment, the tracking system, what your first 4 weeks would look like. You'll leave with full clarity — no guesswork.

Book here: {{custom_values.booking_link}} or just reply with a time that works 📅
```
[2-segment]

---

### Day 10 Morning [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — checking in. Still interested in the structured approach?

If you've been doing your own workouts in the meantime and want to compare notes on what you're tracking, I'm happy to nerd out with you 📊

— {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

### Day 14 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — two weeks in and we haven't connected yet.

Genuine question: is there a specific concern about the program structure that's given you pause? I'd rather address it directly than leave you wondering.

Totally fine either way — just want to make sure you have the full picture 🙂
```

---

### Day 18 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, one thing that surprises people about {{custom_values.gym_name}}:

We actually measure things. Attendance tracked. Milestones logged. Progress check-ins built into the schedule.

Most gyms give you a key card and wish you luck. We give you a system. Any questions about how it works? 📈
```

---

### Day 22 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — a member who joined 4 months ago told us last week:

"I was skeptical because I'd tried other gyms and had nothing to show for it. Here I can actually tell you exactly how many sessions I've done, what I've improved, and what the next goal is."

That's the difference a structured system makes. 📊 — {{custom_values.gym_name}}
```

---

### Day 26 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — our next structured program cohort starts soon.

If you want a trackable, measurable first 30 days — this is the entry point. Limited spots so the system actually works the way it's designed to.

Still a spot with your name on it: {{custom_values.booking_link}} 📋
```

---

### Day 30 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — last note from me.

If you ever want to give the structured approach a real shot — the data-driven first 30 days — we're here.

Hope to see you on the floor someday. Either way, I hope you find something that gets you the results you're after. 🙏 — {{custom_values.coach_name}}
```

---

## WORKFLOW 4 — SUPPORTIVE ARCHETYPE NURTURE

### Day 0 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, it sounds like having the right support makes all the difference for you — and that's exactly what we've built at {{custom_values.gym_name}}.

Your coach will know your name, your goals, and your schedule from day one. Nobody here figures it out alone. We've designed it so you don't have to.

What would you most want support with when getting started? 🙏
```
[2-segment]

---

### Day 1 Morning [GENERIC — UPDATE]

```
Morning {{contact.first_name}}!

A lot of people tell us the reason they stopped going to gyms before was simple: nobody noticed when they disappeared.

At {{custom_values.gym_name}}, that's the one thing we specifically designed around. Your coach checks in. We notice. That's not a sales pitch — it's how the program actually works.

We're here for you 🙏 — {{custom_values.coach_name}}
```
[2-segment]

---

### Day 2 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, here's what your first day at {{custom_values.gym_name}} actually looks like:

You walk in and your coach is expecting you. Private 30-minute orientation — just you and them. You see the equipment, ask every question, and leave with a clear plan. No cold first day. No figuring it out in front of strangers.

Sound like something you could work with? 🙂
```
[2-segment]

---

### Day 3 Afternoon [EVERGREEN — KEEP]

```
{{contact.first_name}} — one of our coaches, {{custom_values.coach_name}}, chose to work here specifically because of the members they get to work with.

"My favorite part of this job is the people who weren't sure they could do this. When they stick with it — that's everything."

You'd be in good hands. 🙏 — {{custom_values.gym_name}}
```

---

### Day 4 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, still with you.

I know starting something new — especially something you've tried before — takes courage. I want you to know that whatever happened with gyms in the past, that's not the whole story.

At {{custom_values.gym_name}}, we've built the program specifically so that people who've struggled to stick with this before actually can. You'd be surprised what changes when someone's actually in your corner.

No pressure. Just wanted you to know we're thinking about you 🙏
```
[2-segment]

---

### Day 5 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, a quick one:

The biggest thing our supportive members tell us they needed was just to feel like it was OK to start where they were — no judgment, no "you should have started sooner."

You're exactly where you're supposed to be. And when you're ready, {{custom_values.gym_name}} is ready for you. 🙂
```

---

### Day 6 Afternoon [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — checking in, no pressure.

If anything's been on your mind — nerves, questions, "I'm not sure if..." — just reply. I'm not going to push you into anything. I just want to make sure you have everything you need to feel comfortable.

— {{custom_values.coach_name}} @ {{custom_values.gym_name}} 🙏
```

---

### Day 7 Morning [GENERIC — UPDATE]

```
{{contact.first_name}}, honestly — the most supportive thing I can tell you is this:

The easiest way to know if you'd feel comfortable at {{custom_values.gym_name}} is just to come in once. Meet your coach. See the gym before it's "your gym." No commitment, no pressure.

We'll walk you through everything. Book a time here: {{custom_values.booking_link}} — or just reply and I'll find you a slot that works. 🙏
```
[2-segment]

---

### Day 10 Morning [EVERGREEN — KEEP]

```
Hey {{contact.first_name}} — still here, no rush.

If there's a specific fear or concern that's made it hard to take the first step — you can tell me. I promise I've heard it before and I won't make you feel bad about it.

— {{custom_values.coach_name}} @ {{custom_values.gym_name}} 🙂
```

---

### Day 14 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — two weeks and I still mean what I said: we're here when you're ready.

One thing I want to make sure you know: you don't have to be "ready" to come in. Ready is a feeling that shows up after the first visit, not before.

Thinking about you 🙏 — {{custom_values.coach_name}}
```

---

### Day 18 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, I want to address something directly:

A lot of people who come to {{custom_values.gym_name}} tell us they were nervous the first time. Every single one of them says the same thing afterward: "I don't know why I waited so long."

The nervousness is real. But it doesn't last past the first visit. And you won't be alone for it.

— {{custom_values.gym_name}} 🙏
```
[2-segment]

---

### Day 22 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — a member who joined 3 months ago shared this with us:

"I told my coach I was embarrassed to start because I'd quit before. He said 'that's why we're here.' I've been going 3x a week since then."

The coaches here want the people who've struggled. That's the whole point. 🙏
```

---

### Day 26 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — the next group at {{custom_values.gym_name}} is starting soon.

Starting with a group means you're not the "new person" — everyone in the cohort is starting together. There's something about that that makes the first few weeks feel a lot less intimidating.

Spot still open if you want it 🙏 {{custom_values.booking_link}}
```

---

### Day 30 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — last one from me.

If the support and guidance piece of this ever feels right to explore, the door is genuinely always open. No judgment about the timing.

I hope you find what you're looking for. 🙏 — {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

## WORKFLOW 5 — INDEPENDENT ARCHETYPE NURTURE

### Day 0 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, sounds like you want access without someone breathing down your neck — totally get it, and that's exactly what 24/7 independent access is built for.

At {{custom_values.gym_name}}, your key fob works any hour, any day. Nobody's taking attendance. No class schedules to fit your life around. You come when you want, do what you want.

Any questions about how the access works? 🙌
```
[2-segment]

---

### Day 1 Morning [GENERIC — UPDATE]

```
Morning {{contact.first_name}}!

One thing independent members tell us they love: 5am, 11pm, or 2pm on a Wednesday — it doesn't matter. The gym is open and you have it mostly to yourself.

No group schedules. No "must attend" classes. Just access, equipment, and results on your timeline.

{{custom_values.gym_name}} works around your life, not the other way around 🙌
```
[2-segment]

---

### Day 2 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, here's what independent gym access at {{custom_values.gym_name}} actually looks like:

You get a key fob. It works 24/7, 365 days a year, including holidays. It also works at any Anytime Fitness worldwide. Travel for work? You still have a gym.

No class sign-ups. No appointments unless you want them. Total autonomy. 🙌
```

---

### Day 3 Afternoon [EVERGREEN — KEEP]

```
{{contact.first_name}} — one of our independent members, a software engineer, does all his training at 6am before work. He told us:

"I don't want to be managed. I just want a good gym that's open when I want to go."

That's exactly what we are. 🙌 — {{custom_values.gym_name}}
```

---

### Day 4 Evening [GENERIC — UPDATE]

```
{{contact.first_name}}, still thinking about fitness?

Here's an honest note: we know independent gym members don't need hand-holding. But we also know the first 30 days are when most people drift. Not because they don't want to go — because there's no structure around starting.

At {{custom_values.gym_name}}, we give you the autonomy you want AND a light first-month structure to make sure the habit actually forms. After that — you're on your own terms entirely.

Does that balance work for you? 🙌
```
[2-segment]

---

### Day 5 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, one practical thing about {{custom_values.gym_name}}:

We have coaches available when you want them — but not required. If you want to design your own program, go for it. If you want expert input once a month, that's there too.

You set the level of involvement. We just make the facility excellent. 🙌
```

---

### Day 6 Afternoon [EVERGREEN — KEEP]

```
{{contact.first_name}} — no pressure at all. Just a quick check-in.

If there's a specific question about access, equipment, or how independent membership actually works in practice — happy to answer. No obligation to anything beyond getting you the information you need.

— {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```

---

### Day 7 Morning [GENERIC — UPDATE]

```
{{contact.first_name}}, the most efficient way to know if {{custom_values.gym_name}} is the right independent gym for you: come in once, see the equipment, check the hours work for your schedule.

No sales meeting. No commitment conversation. Just you, the gym, and a quick walk around.

Whenever works: {{custom_values.booking_link}} — or just reply 👋
```

---

### Day 10 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — light touch from us.

The gym's here when you decide you're ready. If you have a specific question about anything, I'll keep it brief and useful. Otherwise — no rush, no pressure. 🙌

— {{custom_values.coach_name}}
```

---

### Day 14 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — two weeks. Quick one.

If timing or access concerns have been a factor — we can talk specifics. Otherwise, I'll keep this short: the gym is here, 24/7, whenever it makes sense for your schedule.

— {{custom_values.gym_name}} 🙌
```

---

### Day 18 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}}, one practical benefit independent members don't always realize upfront:

Your key fob works at any Anytime Fitness globally. Business travel, vacation, whatever. Your training routine doesn't break because your location changed.

Just a useful fact 🙌 — {{custom_values.gym_name}}
```

---

### Day 22 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — a member who trains at odd hours told us: "I went to three gyms before. This is the first one where I don't feel like I have to fit into their schedule."

If 24/7 autonomous access is what you've been looking for — it's here. 🙌
```

---

### Day 26 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — the next member cohort starts soon.

If you'd rather come in on your own terms after the cohort kicks off, that's fine too — independent members join on their own timeline.

Access info: {{custom_values.booking_link}} or just reply 🙌
```

---

### Day 30 Morning [EVERGREEN — KEEP]

```
{{contact.first_name}} — last one.

If 24/7 independent access at a well-equipped gym ever becomes the right fit for your routine — you know where we are.

Either way, hope you find what works. 🙌 — {{custom_values.coach_name}} @ {{custom_values.gym_name}}
```
