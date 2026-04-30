# GHL Webhook Setup — Attribution Tracker

Set up two outbound webhooks in GHL to feed every new contact and every status change
into AHRI's attribution system. Takes ~5 minutes.

---

## WEBHOOK 1 — Contact Created

Fires when GHL creates a new contact (franchise email forward, form fill, manual entry).

1. GHL → Settings → Integrations → Webhooks
2. Click **Add Webhook**
3. Name: `New Contact — Attribution Tracker`
4. URL: `https://marketing-os-production-2b85.up.railway.app/api/ghl/contact-created`
5. Events: **Contact Created**
6. Save

AHRI receives the contact's email, phone, name, and tags. She runs the attribution
matcher against pending sessions and fires a CAPI Lead event if an fbclid is found.

---

## WEBHOOK 2 — Contact Updated

Fires when a contact's status changes (e.g., `one_day_pass` → `joined`).

1. GHL → Settings → Integrations → Webhooks
2. Click **Add Webhook**
3. Name: `Contact Updated — Member Tracker`
4. URL: `https://marketing-os-production-2b85.up.railway.app/api/ghl/contact-updated`
5. Events: **Contact Updated**
6. Save

When the tag matches `joined` or `member`, AHRI fires a CAPI Purchase event ($2,000 LTV)
and marks the lead as `converted_to_member: true` in the attribution report.

---

## Test After Setup

### Test Webhook 1

Create a test contact in GHL (any name, email, phone). Check Railway logs for:

```
[GHL] New contact received: test@email.com undefined one_day_pass
[Attribution] Running match for: test@email.com undefined
[Attribution] No match found for: test@email.com
[Attribution] Report updated: 0/1 matched (0%)
```

Unmatched is expected on first test — no /go session exists to match against.

### Test Full Flow

1. Visit: `https://marketing-os-production-2b85.up.railway.app/go?utm_source=facebook&utm_medium=paid_social&utm_campaign=30-day-kickstart&utm_content=hook-parent-child&fbclid=TESTFLOW001`
2. Verify redirect to franchise site
3. Check Railway logs: `[Attribution] Session created: <uuid> fbclid: TESTFLOW001`
4. Send POST to `/api/ghl/contact-created` with `{ "email": "test@flow.com", "id": "ghl_flow_001", "tags": ["one_day_pass"] }`
5. Check Railway logs: `[Attribution] Match found: fbclid_unconfirmed`
6. Check: `https://marketing-os-production-2b85.up.railway.app/api/attribution/report`

---

## How the Ghost Redirect Works

All Facebook ad destination URLs route through `/go`:

```
https://marketing-os-production-2b85.up.railway.app/go
  ?utm_source=facebook
  &utm_medium=paid_social
  &utm_campaign=30-day-kickstart
  &utm_content=hook-parent-child
  &utm_term=cold-lifestyle
  &redirect=franchise          ← goes to franchise site
```

```
  &redirect=landing            ← goes to our landing page instead
```

Facebook automatically appends `fbclid=...` to the URL when someone clicks the ad.
The `/go` endpoint captures it and creates a session file. Then when GHL fires a
webhook with the contact's info, AHRI matches the contact to the session and traces
the full journey: ad click → franchise site → lead created → member.

---

## Attribution Confidence Levels

| Method | Confidence | Description |
|---|---|---|
| `email_match` | high | Contact email matches a session's stored email |
| `phone_match` | high | Contact phone matches a session's stored phone |
| `fbclid_unconfirmed` | low | Session has fbclid but no email/phone confirmation |

The low-confidence path is the primary flow for franchise-site leads.
It improves to high confidence once landing-page leads are tracked
(landing page captures email → session has email → GHL match is exact).

---

## What AHRI Does With This Data

- **Lead event**: Fires to Facebook CAPI when a contact matches a session with fbclid
- **Purchase event**: Fires to Facebook CAPI when contact tag = `joined` or `member`
- **Attribution report**: Tracks match rate, days-to-convert, top hooks, top sources
- **AHRI intent**: `check attribution` shows the live report in the AHRI terminal
