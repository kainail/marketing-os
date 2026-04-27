# Manus Task — GHL Nurture Sequence Analyzer

**Task type:** Recurring intelligence task
**Trigger:** Every Sunday at 9:00pm (before lead journey tracker at 10pm and cross-brain sync at 11pm)
**Estimated time:** 20 minutes
**Output:** intelligence-db/nurture/sequence-performance.json
**Feeds into:** AHRI nurture-sync skill, morning brief, monthly report

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/nurture-performance.schema.json`

Also write the payload to disk:
- `intelligence-db/nurture/sequence-performance.json` — full nurture-performance payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "nurture-performance-analyzer",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {},
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If task cannot run: set `status` to `"failed"` with all errors logged.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open GHL.
Confirm location name: [test location name]
If wrong location: STOP. Log error. Exit.

---

## STEP 1 — PULL CONVERSATION DATA

Open GHL → Conversations
Filter: last 30 days
Identify contacts who entered the active nurture workflow
  (No-Risk Comeback — or whatever is the current active workflow)

For each step/message in the nurture sequence:
  How many contacts received this message?
  How many replied to this message?
  Reply rate = replies ÷ received × 100%

---

## STEP 2 — IDENTIFY WEAK LINKS

Map the nurture sequence in order (Message 1 → 2 → 3 → ...):
  For each message, record: step number, reply rate

Flag: If any message's reply rate drops more than 50% vs. the previous message
  "WEAK LINK: Message [X] has [X]% reply rate vs Message [X-1] at [X]%.
   Drop-off suggests this message is losing engagement."

Flag: Any message with less than 5% reply rate:
  "DEAD MESSAGE: [X]% reply rate is below 5% minimum threshold.
   Rewrite or remove this message."

Check timing gaps:
  Is there a gap of 3+ days between any two messages where reply rate then drops?
  If yes: "Pacing too slow at step [X] — leads are going cold during [X]-day gap."

---

## STEP 3 — BOOKING TRIGGER MESSAGE

Of the leads who DID book a visit this month:
  Look at the last message each lead received before they booked
  Which step number appears most often as the "last message before booking"?
  This is the booking trigger message — the highest-performing step in the sequence

---

## STEP 4 — WRITE PERFORMANCE DATA

Update intelligence-db/nurture/sequence-performance.json:

```json
{
  "last_updated": "ISO timestamp",
  "date_range": "last 30 days",
  "workflow_name": "No-Risk Comeback — or current active workflow",
  "total_contacts_in_sequence": 0,
  "messages": [
    {
      "step": 1,
      "message_preview": "first 10 words of message",
      "sent_count": 0,
      "reply_count": 0,
      "reply_rate": 0,
      "status": "strong/acceptable/weak/dead"
    }
  ],
  "weak_links": [2, 4],
  "dead_messages": [5],
  "booking_trigger_message": 3,
  "overall_sequence_health": "strong/needs-work/broken",
  "sequence_pacing_issue": false,
  "recommendation_for_ahri": "Specific rewrite needed for message [X]: [why it's failing and what to change]"
}
```

---

## STEP 5 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Nurture sequence analysis complete.
   Messages analyzed: [X]
   Weak links: step [numbers]
   Dead messages: step [numbers]
   Booking trigger: message [X]
   Sequence health: [strong/needs-work/broken]
   Priority rewrite: message [X] at [X]% reply rate"

---

## WHAT MANUS NEVER DOES

- Never edits GHL workflows or messages during this task — read only
- Never contacts or messages any GHL contacts during this task
- Never records personal contact information beyond aggregate counts
