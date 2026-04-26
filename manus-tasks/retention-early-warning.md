# Manus Task — Member Retention Early Warning

**Task type:** Recurring intelligence task
**Trigger:** Every Wednesday at 11:00am (mid-week — early enough to act before the weekend)
**Estimated time:** 15-20 minutes
**Output:** intelligence-db/retention/dropout-alerts.json
**Feeds into:** AHRI morning brief, Jessica re-engagement actions, monthly report

Context: At $2,000 member LTV, each prevented dropout is worth $2,000 retained.
The first 30 days are the highest-risk window. This task catches at-risk members
before they have mentally quit — early enough to intervene.

---

## STEP 0 — ACCOUNT VERIFICATION (REQUIRED — DO NOT SKIP)

Open GHL.
Confirm location: [test location name]
If wrong location: STOP. Log error. Exit.

---

## STEP 1 — IDENTIFY NEW MEMBERS (LAST 30 DAYS)

Open GHL → Contacts
Filter by tag: member (or whatever tag marks a signed member)
Filter by date: joined in last 30 days

For each new member, record:
  Name, phone, email, join date,
  referral source (if tagged),
  archetype (if tagged in column R)

---

## STEP 2 — CHECK CHECK-IN RECENCY

For each new member:
  When did they last check in?
  Source: gym management system, or GHL last activity, or check-in tag if logged

  Calculate: days since last check-in

Apply dropout alert thresholds:
  7+ days since last check-in (joined < 30 days ago):
    Alert level: AT RISK
    Priority: HIGH

  10+ days since last check-in:
    Alert level: HIGH RISK
    Priority: URGENT

  14+ days since check-in (still within first month):
    Alert level: CRITICAL
    Priority: CRITICAL — call today

---

## STEP 3 — BUILD RE-ENGAGEMENT BRIEFS

For each flagged member, create a re-engagement brief using their archetype:

  Independent archetype:
    Opener: "Hey [name], checking in — how's the training going on your own schedule?"

  Supportive archetype:
    Opener: "Hey [name], the 6am crew has been asking about you — everything okay?"

  Analytical archetype:
    Opener: "Hey [name], quick check — you're at day [X] of your 30-day program.
      Worth jumping in this week to stay on track."

  Social archetype:
    Opener: "Hey [name], you missed a few fun sessions this week — we'd love to see you back."

  Unknown archetype:
    Opener: "Hey [name], just checking in — haven't seen you in a bit. Everything good?"

---

## STEP 4 — WRITE RETENTION DATA

Update intelligence-db/retention/dropout-alerts.json:

```json
{
  "last_updated": "ISO timestamp",
  "new_members_30d": 0,
  "active_members_checked_in_7d": 0,
  "retention_rate_30d": 0,
  "vs_last_week": "improving/declining/stable",
  "at_risk_members": [
    {
      "name": "member name",
      "join_date": "YYYY-MM-DD",
      "last_checkin": "YYYY-MM-DD",
      "days_inactive": 0,
      "priority": "HIGH",
      "archetype": "supportive/analytical/independent/social/unknown",
      "recommended_opener": "specific opener text"
    }
  ],
  "high_risk_members": [],
  "critical_members": []
}
```

Append to logs/coaching-alerts.csv for every CRITICAL member:
  date, alert_type (RETENTION_CRITICAL), member_name, join_date, days_inactive,
  recommended_action (Call today)

---

## STEP 5 — LOG AND PRINT

Append to logs/session-log.csv.
Print:
  "Retention early warning complete.
   New members (30d): [X]
   Active this week: [X] ([X]%)
   At risk: [X] members
   High risk: [X] members
   CRITICAL — call today: [list of names]
   Retention rate: [X]% vs [X]% last week"

---

## WHAT MANUS NEVER DOES

- Never contacts members directly during this task — read only, report only
- Never shares member health or personal information outside this system
- Never records medical information
- Never deletes alert records — append only
