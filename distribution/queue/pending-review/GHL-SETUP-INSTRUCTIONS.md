# GHL Setup Instructions — No-Risk Comeback Landing Page
# Complete before any traffic is sent to the landing page. Every item here is required.

---

## Overview

When a lead submits the landing page form, GHL must:
1. Capture the lead with the correct custom fields
2. Tag the lead based on traffic source and qualifying question answer
3. Trigger the correct workflow (which starts Jessica's call sequence)
4. Pass the right context to Jessica so her opening call is personalized

This document tells you exactly how to set all of this up.

---

## Step 1 — Create Custom Fields

In GHL, go to **Settings → Custom Fields → Contact Fields** and create these four fields. They must exist before the landing page form is built.

| Field Name | GHL Field Type | Purpose |
|---|---|---|
| utm_string | Text | Captures the full `?utm_source=...&utm_medium=...` string on form submit — used for attribution |
| lead_source_hook | Dropdown | Which hook brought them in — determines nurture tone |
| lead_source_offer | Text | Which offer they responded to — future-proofs for multiple offers |
| lead_source_variant | Dropdown | Which page variant they saw — used to match messaging in follow-up |

**Dropdown options for lead_source_hook:**
- parent_child_moment
- identity_reframe
- offer_specific

**Dropdown options for lead_source_variant:**
- COLD-FB
- WARM-IG
- SEARCH
- UNKNOWN

---

## Step 2 — Build the Landing Page Form

In GHL's **Sites → Funnels/Websites**, create the form with these exact fields in this exact order:

**Above-fold form (embedded in hero section):**
1. First Name (required)
2. Phone Number (required)
3. Hidden field: lead_source_variant — auto-populated from UTM parameter utm_content (COLD-FB / WARM-IG / SEARCH)
4. Hidden field: utm_string — auto-populated from the full URL query string

**Below-fold full form (embedded after value stack):**
1. First Name (pre-filled from above-fold if completed)
2. Phone Number (pre-filled from above-fold if completed)
3. Email (required)
4. Qualifying question: "What stopped you last time?" (Radio group — required)
   - Option A: I got too busy
   - Option B: I didn't see results fast enough
   - Option C: I felt out of place
   - Option D: Life got in the way
5. TCPA Consent Checkbox (required — cannot be pre-checked):
   "By submitting this form, you agree to receive automated marketing text messages from [Gym Name] at the phone number provided. You are not required to provide consent as a condition of purchase. Message and data rates may apply. Reply STOP at any time to opt out."

**Form submit button copy:** "Claim My $1 Spot" (or the exact CTA copy from the landing page output)

---

## Step 3 — Create Lead Tags

In GHL, go to **Settings → Tags** and create these tags. They will be applied automatically by workflow logic.

**Source tags (applied based on utm_source):**
- source-facebook
- source-instagram
- source-google
- source-email
- source-unknown

**Objection tags (applied based on qualifying question answer):**
- objection-time
- objection-results
- objection-social
- objection-routine

**Offer tags:**
- offer-no-risk-comeback

**Lead quality tags:**
- exit-intent-lead (for popup opt-ins — lower pressure sequence)
- landing-page-lead (for full form submissions — full sequence)

---

## Step 4 — Build the Primary Workflow

In GHL, go to **Automation → Workflows** and create: **"New Member Lead — No Risk Comeback"**

**Trigger:** Form submission — [Landing Page Form Name]

**Step 1 — Apply tags:**
- Apply tag: offer-no-risk-comeback
- Apply tag: landing-page-lead
- Apply tag based on utm_source field:
  - If utm_string contains "utm_source=facebook" → apply tag: source-facebook
  - If utm_string contains "utm_source=instagram" → apply tag: source-instagram
  - If utm_string contains "utm_source=google" → apply tag: source-google
  - If utm_string contains "utm_source=email" → apply tag: source-email
  - Else → apply tag: source-unknown

**Step 2 — Apply objection tag (conditional):**
- If qualifying question = "I got too busy" → apply tag: objection-time
- If qualifying question = "I didn't see results fast enough" → apply tag: objection-results
- If qualifying question = "I felt out of place" → apply tag: objection-social
- If qualifying question = "Life got in the way" → apply tag: objection-routine

**Step 3 — Set lead_source_offer field:**
- Set field value: no-risk-comeback

**Step 4 — Immediate call assignment:**
- Create task for staff: "New lead — call within 60 seconds" → assign to [staff member responsible for first calls]
- Send internal SMS to [staff phone number]: "NEW LEAD: [Contact Name] — [Phone] — hook: [lead_source_hook] — objection: [qualifying question answer]. Call NOW."

**Step 5 — Trigger Jessica's SMS sequence:**
- Wait: 5 seconds
- Send SMS (from gym number — must have STOP opt-out): "Hi [First Name]! This is [Gym Name] — you just requested info about our $1 trial. We're going to give you a call in just a minute to answer any questions. Talk soon! Reply STOP to opt out."

**Step 6 — If no call answer in 5 minutes:**
- Trigger: staff did not mark task complete
- Send second internal alert: "FOLLOW-UP: [Contact Name] did not answer. Try again in 30 min."

---

## Step 5 — Exit Intent Workflow

Create a separate workflow: **"Exit Intent Lead — Starter Guide"**

**Trigger:** Form submission — [Exit Intent Popup Form Name]

**Step 1 — Apply tags:**
- Apply tag: exit-intent-lead
- Apply tag: offer-no-risk-comeback

**Step 2 — Send lead magnet email:**
- Send email immediately: subject: "Your 7-Day Gym Starter Guide is inside"
- Email body: delivers the guide download link (guide must be created and hosted before this goes live — see content notes below)
- Include unsubscribe link and physical address (CAN-SPAM requirement)

**Step 3 — Nurture sequence (low pressure — 4 emails over 14 days):**
- Day 2: "Day 1 of the guide — what to bring on your first visit"
- Day 5: "Something people don't expect about their first week"
- Day 10: "The question we get most from new members" (FAQ-style, soft offer mention)
- Day 14: "Still thinking about it? Here's what a $1 trial actually looks like" (full offer)

**IMPORTANT:** Jessica does NOT call exit-intent leads. No outbound calls or texts. Email only. These are lower-intent leads — respect the signal.

---

## Step 6 — What Jessica Sees on Her Screen

When Jessica (or a staff member) calls a new lead, her GHL contact view must show:

**Contact summary card should display:**
- Lead name, phone, email
- Tag: which objection tag (so she knows the call angle immediately)
- Tag: which hook they responded to (lead_source_hook)
- Time stamp of form submission

**Call script note that auto-populates based on objection tag:**
- objection-time → Script note: "Mention 24/7 access, 3x/week minimum — only 135 min/week total"
- objection-results → Script note: "Mention week-2 check-in and early energy wins — first result often felt by day 7"
- objection-social → Script note: "Mention private orientation before first session — they won't walk in alone"
- objection-routine → Script note: "Mention coach notification when they miss — accountability built into the system"

**To configure these auto-notes in GHL:**
Go to **Settings → Custom Values** and create a custom value for each tag that populates a "call notes" field on the contact record. This requires GHL's conditional workflow logic to set the field value based on the applied tag.

---

## Step 7 — The 7-Day Gym Starter Guide

This content does not exist yet. It must be created before the exit intent popup goes live.

**What the guide needs to cover:**
- Day 1: What to bring, what to wear, what to say when you walk in (removes the "I don't know what to do" fear)
- Day 2: The one thing to do differently after your first workout
- Day 3: Rest day — what counts as active recovery
- Day 4: Your second session — why it will feel easier than day 1
- Day 5: How to know if you're progressing (without a scale)
- Day 6: Rest day — the nutrition thing you don't have to fix yet
- Day 7: How to decide what to do for week 2

**Format:** PDF, hosted on a service GHL can link to (Google Drive, Dropbox, or GHL's own media hosting)

**AHRI note:** Run `npx tsx engine/generate.ts --skill email-sequence --context business-context/anytime-fitness` once the email-sequence skill is built — that skill will produce the 7-day guide content and the 4-email nurture sequence for exit intent leads.

---

## Checklist — Before Launch

- [ ] Custom fields created (utm_string, lead_source_hook, lead_source_offer, lead_source_variant)
- [ ] All tags created (source, objection, offer, quality tags)
- [ ] Primary workflow built and tested with a test submission
- [ ] Exit intent workflow built and tested
- [ ] Facebook Pixel installed on landing page (PageView + Lead events)
- [ ] Google Analytics installed on landing page (Lead event on form submit)
- [ ] TCPA consent language on both forms (above-fold form and full form)
- [ ] Unsubscribe link and physical address in all automated emails
- [ ] Jessica call script notes configured by objection tag
- [ ] 7-Day Starter Guide PDF created and hosted
- [ ] Landing page URL confirmed and shared with AHRI for UTM URL generation
- [ ] Real cohort cap confirmed with Kai before any scarcity language goes live

---

## Questions? Issues?

Flag to Kai. These instructions were generated by AHRI based on the system design — Kai has final approval on all GHL configuration before any real leads flow through.
