---
skill: funnel-updater
model: claude-sonnet-4-6
type: operational
requires-approval: true
---

# Funnel Updater — Operational Skill

This skill reads the approved landing page from distribution/queue/ready-to-post/, reads the current GHL funnel page state, generates a before/after diff for Kai review, and publishes the approved copy to the live funnel page when Kai confirms.

## When This Runs

Triggered via AHRI: "Update the GHL funnel with the approved landing page"
Triggered after: landing-page skill generates and is approved in the review queue
Scheduled check: see routines/funnel-performance-check.md

## Pre-Flight Checklist

Before pushing anything to GHL:

1. Confirm landing-page asset is in ready-to-post/ (not pending-review/)
2. Confirm GHL_FUNNEL_PAGE_ID is set in .env
3. Confirm GHL_API_KEY is set in .env
4. Read the current funnel page elements from GHL via getFunnelPage()
5. Generate the full before/after diff for Kai review
6. Wait for explicit YES confirmation (not y, not yes — the word YES in all caps)
7. Push element updates via updatePageElement() one element at a time
8. Publish the page live via publishPage()
9. Log the update to performance/asset-log.csv

## Before/After Diff Format

Always show this format before asking for confirmation:

```
CURRENT FUNNEL PAGE
  [headline]     Current text here
  [subheadline]  Current subheadline here
  [button]       Current CTA text here
  [guarantee]    Current guarantee text here

PROPOSED (from: [approved filename])
  [headline]     New headline from approved copy
  [subheadline]  New subheadline from approved copy
  [button]       New CTA from approved copy
  [guarantee]    New guarantee from approved copy

UNCHANGED ELEMENTS
  [list any funnel sections not covered by the landing-page output]
```

## Confirmation Gate

Never push live changes without this exact prompt:

  Type YES to publish these changes live >

Accept only "YES" — not "y", "yes", "ok", or "confirm". The all-caps YES is intentional friction. An accidental keypress should never push live changes.

## Error Handling

- GHL_API_KEY not set: show the full before/after diff with manual implementation instructions. Do not attempt API call.
- publishPage() fails: log to logs/errors.csv, alert Kai, leave the funnel in its pre-update state. Never leave a partial-update live.
- Landing page not found in queue: stop immediately. Instruct Kai to run the landing-page skill and approve the output first.

## Element Mapping

Landing page skill output maps to GHL funnel elements as follows:

| Landing Page Section | GHL Element Type | GHL Element ID        |
|---------------------|------------------|-----------------------|
| Headline            | headline         | headline-1            |
| Subheadline         | subheadline      | subheadline-1         |
| Primary CTA button  | button           | cta-1                 |
| Guarantee           | guarantee        | guarantee-1           |

[KAI — verify these element IDs match your GHL funnel builder. Set them in .env if they differ.]

## What This Skill Never Touches

- Form fields, form configuration, or form placement
- Tracking pixels, analytics scripts, or Meta pixel events
- Page layout, section order, image slots, or design elements
- GHL custom values or contact properties
- Any element not explicitly output by the landing-page skill
