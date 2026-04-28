# GHL Loading Guide — 30-Day Kickstart Nurture Sequence

**Last updated:** 2026-04-28
**Sequence files:**
- `knowledge-base/nurture/sms-sequence-30day.json` (12 SMS messages)
- `knowledge-base/nurture/email-sequence-30day.json` (6 emails)

---

## 1. Before You Start

You need:
- GHL login with access to Anytime Fitness Bloomington location
- Jessica's personal GHL number confirmed as the SMS sender
- Physical gym address for CAN-SPAM footer
- Standard membership rate (for D25 SMS and E30 email accuracy)
- Reply-to email for Jessica (not a no-reply address)

Confirm these before building the workflow. Wrong sender number = TCPA exposure.

---

## 2. Create the Workflow

1. Go to **Automation → Workflows → + New Workflow**
2. Name: `30-Day Kickstart Nurture`
3. Folder: `AHRI — Nurture`
4. Status: **Draft** (do not activate until all steps are tested)

---

## 3. Set the Trigger

Trigger type: **Contact Tag Added**
Tag: `kickstart-enrolled`

This tag should be added by GHL Workflow 1 (lead intake) when a contact submits the kickstart landing page form. Confirm Workflow 1 applies this tag before activating.

---

## 4. Load the SMS Messages

Load in order. For each message:

1. Add action: **Send SMS**
2. Set sender: **Jessica's personal GHL number** (not the location number)
3. Copy message body exactly from `sms-sequence-30day.json` → `messages[n].message`
4. Set `{{first_name}}` using GHL's contact variable: `{{contact.first_name}}`
5. Set delay from previous step using the `day` field

**Delay reference:**
| Message ID | Day | Delay from previous |
|---|---|---|
| D0-AM | 0 | 0 (immediate) |
| D0-PM | 0 | +3 hours (or wait until 5pm if signup before 2pm) |
| D1 | 1 | +1 day |
| D2 | 2 | +1 day |
| D4 | 4 | +2 days |
| D6 | 6 | +2 days |
| D8 | 8 | +2 days |
| D10 | 10 | +2 days |
| D15 | 15 | +5 days |
| D20 | 20 | +5 days |
| D25 | 25 | +5 days |
| D30 | 30 | +5 days |

**D0-AM is the only message with TCPA opt-out language.** GHL handles STOP automatically — do not add opt-out language to other messages.

**Send time:** Set all Day 1+ messages to send at 10:00am local time (America/Indiana/Indianapolis). D0-AM and D0-PM send immediately/3-hour delay regardless of time.

---

## 5. Load the Email Messages

Load in order. For each email:

1. Add action: **Send Email**
2. From name: `Jessica at Anytime Fitness Bloomington`
3. From email: Jessica's reply-to email (not no-reply)
4. Subject line: copy from `email-sequence-30day.json` → `emails[n].subject_line`
5. Preview text: copy from `emails[n].preview_text`
6. Body: copy from `emails[n].body` — preserve line breaks
7. CTA button: add only if `emails[n].cta_text` is not null
8. Footer: include CAN-SPAM footer (physical address + unsubscribe link)
9. Set delay using the `day` field (same logic as SMS table above)

**Email delay reference:**
| Email ID | Day |
|---|---|
| E0 | 0 (immediate) |
| E2 | 2 |
| E5 | 5 |
| E10 | 10 |
| E15 | 15 |
| E30 | 30 |

**Send time:** All emails send at 9:00am local time. E0 sends immediately.

**A/B subject line testing:** GHL supports A/B email splits. Load `subject_line` as variant A and `subject_line_b` as variant B. 50/50 split. Winning subject = whichever gets higher open rate after 4 hours.

---

## 6. Interleave SMS and Email

The workflow runs both sequences simultaneously from the same trigger. In GHL, you can branch:

```
Trigger: kickstart-enrolled tag
  ├── SMS branch (parallel)
  │     D0-AM → wait 3h → D0-PM → wait 1d → D1 → ...
  └── Email branch (parallel)
        E0 (immediate) → wait 2d → E2 → wait 3d → E5 → ...
```

Both branches run concurrently. A contact receives SMS and email on the same days where both are scheduled (D0, D10, D15, D30).

---

## 7. Test Before Activating

1. Create a test contact with your own phone + email
2. Add tag `kickstart-enrolled` manually
3. Run the workflow in test mode
4. Verify: D0-AM arrives immediately with TCPA language intact
5. Verify: E0 arrives immediately with correct from-name and footer
6. Verify: `{{first_name}}` populates correctly
7. Verify: No opt-out language on D1 onwards
8. Verify: STOP works (reply STOP to D0-AM — contact should be opted out of all subsequent SMS)
9. Verify: Unsubscribe link in E0 works

Do not activate on real contacts until all 9 checks pass.

---

## 7. Enroll Contacts

Once tested and activated:

- Contacts who submit the kickstart landing page form → Workflow 1 adds `kickstart-enrolled` tag → this workflow fires automatically
- For manual enrollment (existing member who paid $1): add `kickstart-enrolled` tag manually in GHL contact record
- Do NOT enroll contacts who have opted out of SMS or unsubscribed from email

---

## What This Workflow Never Does

- Never contacts a member who has replied STOP to any SMS
- Never sends from a shared inbox — always Jessica's personal number
- Never uses no-reply email — always a monitored inbox
- Never enrolls duplicate contacts — check for existing tag before adding
