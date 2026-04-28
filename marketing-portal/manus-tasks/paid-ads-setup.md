# Manus Task — Paid Ads Setup (Account Verification)

**Task type:** On-demand pre-launch verification
**Trigger:** Manual — run before first campaign launch to confirm account readiness
**Estimated time:** 10-15 minutes
**Output:** Account readiness report confirming Meta is ready for campaign creation

> **IMPORTANT:** Campaign creation is handled by the portal's Meta Marketing API endpoint
> (`/api/meta/create-campaign`). This task verifies account readiness only.
> The Manus Meta MCP connector is GET-only — no campaigns can be created here.

---

## ⚠ OUTPUT CONTRACT — MACHINE-READABLE JSON REQUIRED

**CRITICAL: When this task is complete, your ONLY response must be a single JSON object. No PDF. No prose. No intro text. No markdown explanation. JSON only.**

Return this exact structure:

```json
{
  "task_id": "TASK_ID_FROM_TRIGGER",
  "task_type": "paid-ads-setup",
  "status": "completed",
  "started_at": "ISO timestamp when task started",
  "completed_at": "ISO timestamp now",
  "data": {
    "account_verified": true,
    "account_name": "Bloomington TEST",
    "account_status": "ACTIVE",
    "account_id": "act_794694236827643",
    "page_connected": true,
    "page_name": "Anytime Fitness Bloomington",
    "page_id": "61560737564229",
    "billing_status": "string — e.g. NORMAL or UNPAID",
    "audience_size_estimate": "string — e.g. 45,000–52,000 in Bloomington IN 10mi radius",
    "campaigns_existing": 0,
    "ready_for_launch": true,
    "launch_recommendation": "Account verified. Run /api/meta/create-campaign in the portal to create the campaign."
  },
  "errors": []
}
```

If a step fails: set `status` to `"partial"`, log the reason in `errors[]`, continue with remaining steps.
If task cannot run: set `status` to `"failed"` with all errors logged.

---

## STEP 0 — VERIFY AD ACCOUNT (REQUIRED — DO NOT SKIP)

Using the Meta MCP connector (read-only GET tools), verify the ad account:

- Ad account ID: `act_794694236827643`
- Expected account name: `Bloomington TEST`

Use `meta_marketing_get_ad_accounts` to retrieve the account.

Confirm:
1. Account name matches `Bloomington TEST` exactly
2. Account status is `ACTIVE` (not `DISABLED` or `UNSETTLED`)
3. Account currency is `USD`

If account name does not match `Bloomington TEST`: set `data.account_verified = false` and log the error. Do not continue verification.

---

## STEP 1 — CHECK BILLING STATUS

Use `meta_marketing_get_ad_accounts` or `meta_marketing_get_object` to check:
- Payment method on file (yes/no)
- Account balance or billing threshold status
- Any billing flags or UNSETTLED balance

Record result in `data.billing_status`.

---

## STEP 2 — VERIFY FACEBOOK PAGE CONNECTION

Use `meta_marketing_get_object` to check the Facebook Page:
- Page ID: `61560737564229`
- Confirm page name matches `Anytime Fitness Bloomington`
- Confirm page is connected to the ad account

Record in `data.page_connected` and `data.page_name`.

---

## STEP 3 — CHECK EXISTING CAMPAIGNS

Use `meta_marketing_get_campaigns` to check if any campaigns already exist on `act_794694236827643`.

Record the count in `data.campaigns_existing`.
If campaigns exist, list them in `errors[]` (informational — not a failure).

---

## STEP 4 — AUDIENCE SIZE ESTIMATE (OPTIONAL — DO BEST EFFORT)

If audience insights are available via `meta_marketing_get_recommendations` or any GET tool:
- Estimate audience size for Bloomington, IN 10-mile radius
- Age 28-55, all genders, broad (no interest targeting)

Record estimate in `data.audience_size_estimate`.
If unavailable: set to `"Not available via read-only API"`.

---

## STEP 5 — COMPILE REPORT AND RETURN

Set `data.ready_for_launch`:
- `true` if: account_verified AND account_status is ACTIVE AND page_connected
- `false` if any of those three conditions fail

Set `data.launch_recommendation` based on result:
- If ready: `"Account verified. Run /api/meta/create-campaign in the portal to create the campaign."`
- If not ready: explain specifically what must be fixed before launch.

Return the JSON output. No additional text.

---

## WHAT MANUS NEVER DOES IN THIS TASK

- Never attempts to create campaigns (MCP connector is read-only)
- Never logs into Facebook via browser
- Never uploads creative files
- Never sets budgets or changes account settings
- Never marks as complete without a JSON response
