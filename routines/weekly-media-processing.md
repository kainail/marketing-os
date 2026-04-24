# Weekly Media Processing Routine

**Schedule:** Every Monday at 5:45 AM (runs before the main weekly-content routine at 7:00 AM)
**Trigger:** Automated — no Kai input required
**Engine:** engine/media-analyzer.ts
**Script:** npm run analyze-media

---

## Purpose

Scans the Google Drive raw media folder for new photos and videos uploaded since the last run. Analyzes each file with Claude vision, verifies releases, generates shot list gaps, and moves approved files to the approved subfolder. The media index is updated in Drive so the content-calendar and image-generator skills have accurate, current media intelligence.

This routine feeds media intelligence into the Monday 7 AM content calendar generation. Running it 75 minutes earlier ensures the content calendar reflects the latest available media.

---

## What It Does — Step by Step

**1. Scan Drive for new files**
Lists all files in the Drive raw/ subfolder that are not already in the media-index.json. Filters to images (JPG, PNG, HEIC, WebP) and video (MP4, MOV). Skips files already indexed.

**2. Analyze each file with Claude vision**
For each new image: downloads to memory (never to disk permanently), sends to claude-opus-4-6 with the vision system prompt, extracts 16 metadata fields including content themes, avatar fit, awareness level, emotional tone, and platform recommendations.

For each new video: attempts frame extraction via sharp. If unavailable, generates metadata-only analysis with a [KAI — ffmpeg needed for full video analysis] flag in the index.

**3. Verify releases**
Checks the Drive releases/ subfolder for a matching release filename. Any media without a verified release is flagged as `release_verified: false` in the index. AHRI never recommends unverified media for use in paid ads.

**4. Generate shot list**
Compares approved media to the coverage gap checklist:
- Coaching moment (coach + member interaction, not posed)
- Early morning atmosphere (5:30–7:00 AM natural lighting)
- 30-day milestone (member who has completed 30+ days)
- Candid group energy (two or more members, natural conversation)
- Outdoor or parking lot (gym location visible, no posed shots)
- Proud expression (not fitness-pose pride — real accomplishment pride)

Any gap that has fewer than 3 approved assets triggers a shot list entry. Shot list is written to Drive as shot-list.md.

**5. Update media-index.json in Drive**
Writes the updated index back to the GOOGLE_DRIVE_MEDIA_FOLDER_ID folder. The index is the source of truth for all downstream skills.

**6. Move approved files**
Moves files with `release_verified: true` and `avatar_fit_score >= 7` to the approved/ subfolder in Drive. Files below threshold stay in raw/ with analysis notes attached.

**7. Return MediaReport**
Reports: files scanned, approved, flagged, moved, shot list items generated, coverage gaps identified. This report is appended to brain-state/current-state.md under ## Media Library Status.

---

## Required .env Variables

```
GOOGLE_DRIVE_MEDIA_FOLDER_ID=  # parent folder containing raw/, approved/, releases/ subfolders
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=  # service account email
GOOGLE_DRIVE_PRIVATE_KEY=  # service account private key (replace \n with actual newlines)
ANTHROPIC_API_KEY=  # for Claude vision analysis
```

---

## Failure Behavior

- Drive credentials missing: returns empty MediaReport with `files_skipped_empty: true` and the initial PRIORITY_SHOT_LIST for a new media library. Does not crash. Logs skip reason.
- Individual file analysis fails: logs the error, marks the file as `analysis_failed: true` in the index, continues to next file. Never lets one bad file block the batch.
- Drive write fails: logs to errors.csv, keeps the in-memory index, reports the failure in the MediaReport. Does not retry automatically — retries on next Monday run.
- Shot list Drive write fails: non-fatal. Logs error. Shot list is still generated and available in the session output.

---

## Output Artifacts

- Drive: media-index.json (updated)
- Drive: shot-list.md (updated or created)
- Drive: approved/ subfolder (new files moved in)
- Brain state: ## Media Library Status section updated
- Console: full MediaReport with counts and gap analysis

---

## When to Run Manually

If Kai uploads a batch of new media mid-week:
```bash
npm run analyze-media
```

This processes the batch immediately without waiting for the Monday schedule. The Monday run will skip already-indexed files automatically.

---

## Integration with Other Routines

The content-calendar skill reads the media index before generating the week's content calendar. Running this routine at 5:45 AM ensures the 7:00 AM calendar run has current, analyzed, release-verified media to reference for platform-specific content recommendations.

The image-generator skill uses the media index to avoid generating AI images for themes where real member photos already exist. Real beats generated — always.
