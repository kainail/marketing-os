# Marketing OS — Engineering Handbook

This document captures architectural decisions, security rules, and lessons learned for the marketing-os system.

---

## Appendix D — Attribution Pipeline & Secure Lead Submission

### Problem
The original landing page submitted forms directly to the GHL API from client-side JavaScript using a hardcoded Bearer token (`pit-...`). Any visitor who opened DevTools could read the key, replay form submissions, create junk contacts, or extract the credential for other uses.

### Cause
The initial build prioritized speed and simplicity. The landing page was a static HTML file with no server of its own, so the GHL API call was made directly from the browser.

### Fix
A dedicated backend endpoint `POST /api/leads/submit` was added to the `marketing-portal` service. The landing page now POSTs form data to this endpoint. The marketing-portal backend holds the GHL API key in Railway env vars and calls GHL server-side. No credential ever reaches the browser.

**Route:** `POST /api/leads/submit`
**Auth:** none (public endpoint; rate limiting via Railway)
**Body fields:**
- `locationId` — resolved from URL param at page load; falls back to `'bloomington'`
- `sessionId` — resolved from `/go` redirect URL; used for direct attribution match
- `firstName`, `phone` — required
- `archetype_answer` — raw radio value (`social`, `analytical`, `supportive`, `independent`)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_string`

**Archetype mapping** (raw → GHL tag):
| Form value | GHL tag |
|---|---|
| `social` | `archetype:Social` |
| `analytical` | `archetype:Analytical` |
| `supportive` | `archetype:Supportive` |
| `independent` | `archetype:Independent` |

**Attribution flow:**
1. Visitor clicks a Meta ad → `/go` handler creates a session file (`{sessionId}.json`) and redirects to `/?location={id}&session_id={sessionId}`
2. Landing page reads `session_id` from URL at page load
3. Form submit POSTs `sessionId` to `/api/leads/submit`
4. Backend calls `matchContactToSession` with `sessionId` for direct file lookup (fastest path)
5. If no sessionId match, falls back to phone → email → fbclid scan

---

## Appendix E — API Key Security Rule

### Rule
**Never put API keys, Bearer tokens, or any credential in client-side code.**

### Why
Client-side JavaScript is fully readable by anyone who opens the browser's DevTools. Credentials embedded in HTML or JavaScript are effectively public. They can be:
- Extracted by a competitor or bad actor
- Replayed to create junk data in your CRM
- Used to exhaust API quotas or incur charges
- Cached by browser extensions, proxies, or crawlers

### How to apply
All third-party API calls (GHL, Meta, ElevenLabs, Anthropic) must be made from a backend service that holds the credential as an environment variable. The browser sends data to your own backend; your backend forwards to the third party.

The only client-side credential permitted is a **public pixel ID** (Meta Pixel, Google Analytics measurement ID) — these are designed to be public and carry no write access to sensitive systems.

**Checklist before any landing page or frontend ships:**
- [ ] `view-source` contains no `Bearer ` strings
- [ ] `view-source` contains no `pit-` strings (GHL private integration tokens)
- [ ] `view-source` contains no API keys matching patterns `sk-`, `EAA`, or similar
- [ ] All form submissions go to your own backend domain, not directly to a third-party API
