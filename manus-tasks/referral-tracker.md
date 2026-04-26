# Manus Task — Referral Tracker

**Task type:** Recurring intelligence task
**Trigger:** Every Sunday at 8:00pm (before nurture analyzer 9pm and lead journey tracker 10pm)
**Estimated time:** 15-20 minutes
**Output:** intelligence-db/market/referral-log.json
**Feeds into:** AHRI morning brief, monthly report, Jessica relationship actions

Context: Referrals close faster, churn less, and cost nothing to acquire. At $2,000 LTV,
a member who refers two friends has generated $4,000 in free revenue. Tracking referral
performance weekly tells us who to thank, who to incentivize more, and whether the referral
program is actually working.

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Schema for the `data` field: `schemas/manus-outputs/referral-log.schema.json`

Also write the payload to disk:
- `intelligence-db/market/referral-log.json` — full referral-log payload

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "referral-tracker",
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
Confirm location: [test location name]
If wrong location: STOP. Log error. Exit.

---

## STEP 1 — FIND REFERRAL CONTACTS THIS WEEK

Open GHL → Contacts
Filter: created in last 7 days
Sub-filter: lead_source tag = referral (or "member referral" or however it is tagged)

For each referral contact:
  Record: name, phone, created date, referring member name (from notes or custom field),
  current pipeline stage, has booked a visit? Y/N, has become a member? Y/N

If no dedicated referral tag exists:
  Search conversation notes for keywords: "referred by", "my friend", "told me about",
  "my trainer", "works with [name]"
  Record any matches — note that tagging is manual and may be incomplete

---

## STEP 2 — IDENTIFY TOP REFERRERS

Look back 90 days (not just this week).
Find all contacts with lead_source = referral.
Group by referring member name.

For each referring member who has sent 2+ referrals in the last 90 days:
  Record: referring member name, number of referrals sent, how many became members,
  date of most recent referral, have they been thanked? (check notes for thank-you message)

Flag: Any member with 3+ referrals in 90 days
  → "VIP REFERRER: [name] has sent [X] referrals in 90 days. Recommend personal thank-you from Kai."

Flag: Any member whose referral became a member and was never thanked
  → "UNTHANKED: [referring member name] — their referral [new member name] joined [date]. No thank-you logged."

---

## STEP 3 — PARTNERSHIP REFERRALS

Check for any contacts tagged with source: partner, corporate, or similar.
  Record: company or partner name, number of referrals this week, number this month,
  number who became members

Note: these may come from corporate wellness partnerships, PT referrals, or physio partners.
If any partner has sent 3+ referrals this month and none have been explicitly thanked via note,
flag for Kai.

---

## STEP 4 — REFERRAL CONVERSION CHECK

Of all referral contacts in the last 30 days:
  How many booked a visit?
  How many became members?
  Referral conversion rate = members ÷ total referral contacts × 100%

Compare to non-referral leads conversion rate if available in GHL pipeline data.

Flag: If referral conversion rate < 50%
  → "Referral conversion below 50% — check if referrals are being followed up within 24 hours.
     High-intent contacts going cold = lost trust."

---

## STEP 5 — WRITE REFERRAL LOG

Update intelligence-db/market/referral-log.json:

```json
{
  "last_updated": "ISO timestamp",
  "week_ending": "YYYY-MM-DD",
  "referral_contacts_this_week": 0,
  "referral_contacts_30d": 0,
  "referral_members_30d": 0,
  "referral_conversion_rate_30d": 0,
  "top_referrers_90d": [
    {
      "member_name": "first name only",
      "referrals_sent": 0,
      "referrals_converted": 0,
      "last_referral_date": "YYYY-MM-DD",
      "thank_you_sent": true
    }
  ],
  "vip_referrers": ["names of members with 3+ referrals"],
  "unthanked_referrers": ["names of members whose referral joined but no thank-you logged"],
  "partnership_referrals_30d": 0,
  "partnership_sources": ["list of partner names"],
  "referral_program_health": "strong/moderate/weak"
}
```

Referral program health:
  strong: 5+ referrals/week, conversion rate > 50%, no unthanked VIPs
  moderate: 2-4 referrals/week or conversion rate 30-50%
  weak: fewer than 2 referrals/week or conversion rate < 30%

---

## STEP 6 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Referral tracking complete.
   Referrals this week: [X]
   Referral conversion rate (30d): [X]%
   VIP referrers (3+ in 90d): [names or 'none']
   Unthanked referrers: [X] — action needed
   Partnership referrals: [X]
   Referral program health: [strong/moderate/weak]"

---

## WHAT MANUS NEVER DOES

- Never contacts referring members or referral contacts during this task — read only
- Never tags, modifies, or deletes GHL contacts
- Never shares full contact details outside this system — first names only in log
- Never posts thank-you messages — flags for Kai or Jessica to act on
