# intelligence-db/clarity/ — Landing Page Behavior Data

Schema: landing page behavior from Microsoft Clarity heatmaps and session recordings.

## Files
- heatmap-insights.json     — Scroll depth, click patterns, rage clicks, form analytics
- scroll-depth-log.json     — Historical scroll depth trends by device type
- form-abandonment.json     — Which field causes the most form abandonment

## Write cadence
heatmap-insights.json:  Every Wednesday (clarity-analyzer Manus task)

## Setup required
1. Create free account at clarity.microsoft.com
2. Create new project for the landing page
3. Copy project ID (format: "abc123xyz")
4. Add CLARITY_PROJECT_ID=[id] to Railway env vars on landing-server

## Read by
AHRI morning brief, monthly-report Manus task, process_manus_results
