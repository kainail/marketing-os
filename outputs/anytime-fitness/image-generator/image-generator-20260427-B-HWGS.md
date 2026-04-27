---
asset_id: image-generator-20260427-B-HWGS
skill: image-generator
variant: B
test_id: image-generator-20260427-6CVRSG
date: 2026-04-27T21:55:43.776Z
status: pending-review
---

# Image Brief — Cold Facebook Feed — 2026-04-27
# Awareness Level: 3 | Avatar: Lifestyle Member | Use: Cold Facebook ad — solution aware, soft pitch

---

## VARIANT B — Direct/Graphic Direction

### DALL-E 3 Prompt

```
A clean, confident announcement-style graphic. Deep charcoal background (#1a1a1a), 
slightly textured — not flat black, not glossy. Warm ambient light from the left edge, 
as if a window is just out of frame. No people. No gym equipment visible. 

Centered text hierarchy (reference only — do not render literal text, leave text areas 
as compositional placeholders with slight luminous glow to indicate where text will sit):
- Largest element: a short horizontal band of warm white light, wide, near vertical center
- Second element: a narrower band slightly below
- Third element: a thin line near the bottom

The overall feeling: a confident, quiet announcement. Like a note left on a table 
by someone who knew exactly what they wanted to say. Not urgent. Not loud. Certain.

Negative prompt: fitness model physique, staged gym photo, stock photo aesthetic, 
people, gym equipment, before/after framing, visible abs or muscle definition, 
countdown imagery, artificial gradients that look digital, corporate design feel, 
overly polished or branded look, neon colors, aggressive visual energy
```

**Post-generation direction for Kai:**
This image is the background layer. The copy team adds text in Canva or GHL:
- Line 1 (largest): **$1. Your first 30 days.**
- Line 2: **Fully coached. Guaranteed to work — or it's free.**
- Line 3 (smallest, bottom): **No contract. No risk. One small step.**

Keep total text coverage under 20% of image area for Meta delivery.

---

### Image Specifications

**Platform:** Facebook Feed + Instagram Feed (dual-format output)

| Output | Dimensions | Ratio | Notes |
|---|---|---|---|
| Facebook Feed | 1200×628px | 1.91:1 | Primary — landscape for feed scroll |
| Instagram Feed | 1080×1080px | 1:1 | Crop from center of landscape version — verify text still readable |

**Color guidance for Kai when adding text:**
- Headline text: warm white (#F5F0E8) — not pure white, which reads as digital
- Offer line: same warm white, smaller weight
- Guarantee line: light gray (#C8C4BC) — should recede slightly
- No drop shadows — the background contrast should carry the text alone

---

### Compliance Check

- [x] No body-shaming visual language — **PASS** (no people, no bodies)
- [x] No before/after framing or implied transformation — **PASS** (purely typographic/graphic)
- [x] No health condition targeting signals — **PASS**
- [x] No unrealistic body standards — **PASS** (no people)
- [x] No weight loss imagery — **PASS**
- [x] No staged gym moment — **PASS** (no gym environment)
- [x] FTC: No implied guaranteed outcome in the image itself — **PASS**

**Compliance note on copy overlay:**
When Kai adds "Guaranteed to work — or it's free" as text, this triggers an FTC substantiation requirement. The guarantee must be real, specific, and honored. Confirm the exact guarantee terms before this runs as paid. The phrase "Guaranteed to work" alone is not specific enough — recommended revision: "If you don't feel the difference in 30 days, pay nothing." This is specific, verifiable, and legally defensible. Flag to Kai before paid activation.

**[COMPLIANCE FLAG — COPY: "Guaranteed to work" is not specific enough under FTC substantiation standards. Revise to a defined outcome before paid deployment. Suggested: "If you don't feel the difference in 30 days, pay nothing." Hold paid version until language is confirmed.]**

---

### Real Photo Replacement Brief

```
Shot: N/A — this is a designed graphic asset, not a photography asset.
No real photo equivalent exists for this format.
This brief is intentionally left as N/A.

Note: The Level 3 offer-graphic format serves a specific function — 
it is not meant to feel like a photo. It is the announcement layer of the 
funnel. Real photos are appropriate for Variant A (lifestyle/emotional). 
Variant B at this awareness level intentionally reads as designed.

Priority: LOW — no shot list addition needed.
```

---

## Media Library Check

**Status:** No matching approved photo found — graphic format has no real-photo equivalent by design.

**Reason for generation:** Variant B at Level 3–5 is a direct offer visual. This format serves warm and offer-aware audiences who have already processed the lifestyle story. A real photo is the wrong tool here. The designed graphic is the correct format. Generation proceeds on that basis.

---

## Log Entry

```
asset_id: image-generator-20260427-B-7K2M
test_id: image-generator-20260427-RQ84WT
avatar: lifestyle-member
awareness_level: 3
variant: B
format: direct-offer-graphic
platform: facebook-feed / instagram-feed
date: 2026-04-27
status: pending-review
compliance_flag: YES — copy overlay requires FTC review before paid deployment
pending_action: Kai to confirm guarantee language before paid activation
```

---

## Variant A vs. Variant B — Test Architecture Note

These two variants are not competing in the same placement or against the same audience. Log them under the shared test_id but note the distinction:

| | Variant A | Variant B |
|---|---|---|
| Awareness level | 1–2 (cold) | 3–5 (warm / offer-aware) |
| Audience | Has never seen the gym | Has engaged with gym content or visited landing page |
| Goal | Stop the scroll, create curiosity | Make the offer undeniable, remove last friction |
| Visual approach | Lifestyle/emotional — real moment | Direct/graphic — confident announcement |
| Winning condition | Higher CTR on cold traffic | Higher conversion rate on warm retargeting |

A/B comparison between these two variants would only be valid if run against the same audience at the same awareness level — which is not the intended use. Track separately. Compare Variant A cold CTR against other cold creative. Compare Variant B warm conversion rate against other warm offer creative.