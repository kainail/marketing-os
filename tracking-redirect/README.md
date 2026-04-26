# GymSuite Tracking Redirect Service

A lightweight Railway service that sits between any link you control and its destination.
Every click is tracked, CAPI is fired, and first-party cookies are set — all before the
301 redirect delivers the user to the destination in under 100ms.

## How It Works

1. User clicks any link you control
2. Hits your tracking redirect URL (~50ms)
3. Server fires Facebook CAPI PageView event (async — never delays redirect)
4. Logs visit to journey-log.json with UTM, IP hash, cookie state
5. Sets or refreshes first-party cookies (1-year expiry)
6. 301 redirects user to actual destination — they never see this page

## Usage

Instead of linking to:
  https://www.anytimefitness.com/find-a-gym/bloomington

Link to:
  https://your-redirect.railway.app/go?dest=https://www.anytimefitness.com/find-a-gym/bloomington&utm_source=gbp&utm_medium=listing&utm_campaign=april-offer

## Where to Use This URL

- Google Business Profile website link (all 9 locations)
- Instagram bio link
- All GBP posts with "Learn More" buttons
- Local directory listings (Yelp, Bing Places, Apple Maps)
- Email signature links
- Any ad landing page link that doesn't go to YOUR landing page first

## Endpoints

GET /go?dest=URL&utm_source=X&utm_medium=X&utm_campaign=X&utm_content=X&lead_id=X
  → Tracks visit, fires CAPI, sets cookies, 301 redirects

GET /health
  → Returns 200 OK (Railway healthcheck)

GET /report?key=REPORT_KEY
  → Returns last 100 events with unique visitor count, top sources, top destinations

## Railway Environment Variables Required

| Variable            | Required | Description                           |
|---------------------|----------|---------------------------------------|
| META_PIXEL_ID       | Yes      | Facebook Pixel ID from Events Manager |
| META_CAPI_TOKEN     | Yes      | Conversions API access token          |
| GHL_LOCATION_ID     | No       | h4FkKJzyBbX0vR71RJFI (pre-set)       |
| DEFAULT_DESTINATION | No       | Fallback URL if dest param missing    |
| REPORT_KEY          | No       | Password for /report endpoint         |
| PORT                | Auto     | Set by Railway automatically          |

## First-Party Cookies Set

| Cookie                  | Value                | Lifetime |
|-------------------------|----------------------|----------|
| gymsuite_source         | utm_source value     | 1 year   |
| gymsuite_first_touch    | ISO timestamp        | 1 year   |
| gymsuite_last_touch     | ISO timestamp        | 1 year   |
| gymsuite_touch_count    | Incrementing integer | 1 year   |

## CAPI Event Structure

```json
{
  "event_name": "PageView",
  "event_time": 1234567890,
  "event_source_url": "https://destination.com",
  "user_data": {
    "client_ip_address": "X.X.X.X",
    "client_user_agent": "Mozilla/..."
  },
  "custom_data": {
    "lead_journey_event": "redirect_click",
    "utm_source": "gbp",
    "destination": "https://destination.com"
  }
}
```

## Deploy to Railway

```bash
cd tracking-redirect
railway init
railway up
```

Then set environment variables in Railway dashboard.
