# Weekly Content Routine

**Schedule:** Every Monday at 7:00 AM (runs after weekly-media-processing at 5:45 AM)
**Trigger:** Automated — no Kai input required
**Engine:** engine/ahri.ts → handleWeeklyContent() → calls content-calendar skill
**Script:** npm run weekly-content
**Output:** outputs/anytime-fitness/content-calendars/[YYYY-MM-DD]-content-calendar.md

---

## Purpose

Generates a complete 30-piece content calendar for the week. Every piece is specific: platform, copy, caption, hook type, awareness level, image assignment (real photo or image-generator brief), and optimal post time. The calendar goes to distribution/queue/pending-review/ for Kai review. Manus posts it once approved.

This routine does not generate generic content. It reads all available intelligence before writing a single piece — media library, cross-brain data, competitor landscape, seasonal context, and the active brain state. The result is a calendar that reflects this gym, this week, this data.

---

## Phase 1 — Intelligence Gathering (run before generation)

Run all reads in parallel. Do not start generation until all reads complete.

**1. Read brain-state/current-state.md**
Extract: active offer, active avatar, winning hooks (last 3), top objection, seasonal context, cross-brain insights, pending items.

**2. Read intelligence-db/cross-brain/archetype-performance.json**
Identify: top-performing archetype this month, booking rate by archetype, any archetype with zero data. This determines which avatar angle to weight this week.

**3. Read intelligence-db/market/competitor-ads.json**
Identify: hooks competitors are currently running (avoid exact duplication), offers competitors are running (note gaps AHRI can exploit), creative formats trending in the local market.

**4. Read intelligence-db/assets/media-index.json (from Drive — if available)**
Identify: all approved photos by theme and awareness level. Match each content piece to an available photo before generating image briefs. Real photo first — always.

**5. Read knowledge-base/fitness/seasonal-calendar.md**
Identify: current seasonal context, peak avatar windows this month, any events or dates to tie content to this week.

**6. Read intelligence-db/patterns/winning-patterns.json**
Identify: top-performing hook formats, copy angles, and CTAs from prior content — weight these in this week's calendar.

**7. Read intelligence-db/patterns/hypotheses.json**
Identify: any active hypotheses that should be tested this week. If a new hook type or format has been flagged for testing, include it in at least 2 pieces so Manus can post and track engagement.

---

## Phase 2 — Intelligence Synthesis (run before generation)

Before writing the calendar, synthesize the intelligence into 5 directives:

```
DIRECTIVE 1 — AVATAR ANGLE: [which avatar signal to weight this week — based on cross-brain data]
DIRECTIVE 2 — HOOK TYPE: [which hook format is winning or untested — based on winning-patterns + hypotheses]
DIRECTIVE 3 — COMPETITOR GAP: [what competitors are NOT doing that this gym can own this week]
DIRECTIVE 4 — MEDIA AVAILABLE: [list approved photos by theme — drives which pieces use real photos]
DIRECTIVE 5 — SEASONAL MOMENT: [one specific seasonal angle for this exact week]
```

Write these directives to the top of the output file before the calendar. They explain every piece that follows.

---

## Phase 3 — Content Generation (30 pieces)

Generate exactly 30 pieces. Distribution by platform:

| Platform | Pieces | Awareness Levels | Format Mix |
|---|---|---|---|
| Facebook feed | 10 | L1–L3 weighted to L2 | 5 short-form (under 100 words), 5 medium (100–200 words) |
| Instagram feed | 6 | L2–L3 | 4 single-image posts, 2 carousel briefs |
| Instagram Reels | 4 | L1–L2 | Hook + body + CTA — 60-second script format |
| Instagram Stories | 4 | L3–L4 | Single image or text overlay — 15-second format |
| Google Business Profile | 3 | L3–L4 | Under 1500 characters, keyword-native |
| Facebook Group post | 3 | L1 | Community framing — never a pitch |

**Per-piece structure:**

```
### PIECE [N] — [Platform] — [Post day and time]

Awareness Level: [1–5]
Hook type: [which of the winning hook formats this uses]
Avatar angle: [which avatar signal this speaks to]

COPY:
[Full caption or script — ready to copy/paste]

IMAGE:
[Real photo: [filename from media-index] | OR | Image brief: [DALL-E prompt reference — triggers image-generator skill]]

CTA: [specific CTA — never "click the link" alone; tell them what they get]

POST SETTINGS:
- Platform: [platform]
- Recommended time: [specific day and time — e.g., "Monday 7:00 AM"]
- Hashtags: [5–8 platform-appropriate hashtags — Instagram only]
- GBP category: [for Google posts — update, offer, or event]

A/B NOTE: [if this piece has a variant to test, note it here with the variable being tested]
```

---

## Generation Rules (applied during Phase 3)

**Rule 1 — No one-day-pass content.** Cross-brain data shows 96% of one-day-pass leads book at 0%. Never generate content whose only CTA is a free day pass. Hybrid offers only: "Free Day Pass + [specific scheduled thing]" where the booking expectation is embedded.

**Rule 2 — Real photo first.** Before writing an image brief for any piece, check media-index.json. If an approved photo matches the content's theme and awareness level, use it. Generate an image brief only when no match exists. Note in the output why a brief was needed.

**Rule 3 — Awareness level discipline.** Every piece is tagged to one awareness level. Cold Facebook audience pieces are L1–L2. Retargeting pieces are L3–L5. Never mix awareness levels in one post. A post cannot pitch the offer AND tell a life-outcome story — it is one or the other.

**Rule 4 — Use the winning hooks.** At least 4 of the 30 pieces must use one of the 3 winning hooks from brain-state. These are tested and working. Use them before inventing new ones.

**Rule 5 — Test at least one hypothesis.** If hypotheses.json has an untested or low-confidence hypothesis, include at least 2 pieces that test it (2 pieces = enough data to compare engagement on Facebook). Log the hypothesis being tested in the piece's A/B NOTE.

**Rule 6 — Top objection pre-handled.** At least 2 of the 30 pieces must address the top objection from brain-state without naming it directly. The objection is handled in the copy by reframing, not by confronting.

**Rule 7 — No forbidden words.** Never use: transform, crush it, beast mode, no excuses, unlock your potential, journey, elevate, revolutionary, game-changing, state-of-the-art, "Are you ready to..." — not in any of the 30 pieces.

**Rule 8 — GBP posts are keyword-native.** The 3 Google Business Profile posts must include local keywords naturally (city name, "gym near," "fitness [city]") without keyword-stuffing. These posts rank — write them as genuinely useful local content.

---

## Phase 4 — Image Assignment Summary

After the 30 pieces, include one summary block:

```
## IMAGE ASSIGNMENT SUMMARY

Real photos used: [N] pieces
- [piece number] → [filename] — [why this photo matches this content]

Image briefs triggered: [N] pieces
- [piece number] → [brief description] — [why no real photo was available]

Outstanding shot list gaps:
- [theme] — [how many pieces this week needed AI briefs because no real photo existed]
  Priority: [high/medium] — [add to shot-list.md]
```

---

## Phase 5 — Distribution

After generation:

1. Write full calendar to: `outputs/anytime-fitness/content-calendars/[YYYY-MM-DD]-content-calendar.md`
2. Copy to: `distribution/queue/pending-review/content-calendar-[YYYYMMDD].md`
3. Log to performance/asset-log.csv:
   - asset_id: `content-calendar-[YYYYMMDD]-[6-char-random]`
   - skill: content-calendar
   - variant: N/A (full calendar, not an A/B pair)
   - date_created: [today]
   - performance_notes: "[N] real photos, [N] image briefs, top avatar angle: [angle], hypotheses tested: [list]"

4. Append to logs/session-history.json:
```json
{
  "session": "weekly-content",
  "date": "[ISO timestamp]",
  "output_file": "outputs/anytime-fitness/content-calendars/[date]-content-calendar.md",
  "pieces_generated": 30,
  "real_photos_used": N,
  "image_briefs_triggered": N,
  "hypotheses_tested": ["list"],
  "errors": []
}
```

---

## Error Handling

- Missing media-index.json (Drive not connected): generate all 30 pieces with image briefs — note at top of output "Media library not connected — all image slots use briefs. Connect Google Drive to reduce AI image generation." Log to errors.csv.
- Missing cross-brain data: generate calendar using brain-state's winning hooks and seasonal context only. Note in Directive 1 that archetype data is unavailable. Flag for Kai in morning brief.
- Missing competitor-ads.json: proceed without Directive 3. Note in output "Competitor intelligence not available — run competitor-research Manus task."
- Content-calendar skill call fails: retry once with claude-sonnet-4-6. If second attempt fails, write partial calendar with completed pieces and a [GENERATION FAILED — PIECES X–30] flag. Never discard completed pieces.
- Any piece triggers a compliance flag: prefix the piece with [COMPLIANCE FLAG — CONTENT: description]. Do not delete the piece — leave it for Kai to review. Flag in morning brief Section 1 Critical Alerts.

---

## When to Run Manually

```bash
npm run weekly-content
```

Run manually if a large batch of new media was uploaded mid-week and the calendar needs re-generating with updated photo assignments. The previous calendar is archived (not deleted) before the new one is written.
