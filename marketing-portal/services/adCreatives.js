'use strict';

/**
 * Ad creative generator — delegates to the existing creativeGenerator pipeline
 * (kie.ai Nano Banana Pro + compliance + authenticity gates) and maps the
 * resulting tier-tagged images into ad-creatives.json for the owner's picker.
 *
 * All session input reading, prompt building, compliance checks, and image
 * generation live in services/creativeGenerator.js — this module is purely a
 * mapper between that pipeline's output and the picker UI's polling schema.
 *
 * Output written to R2 (shared/):
 *   onboarding/sessions/<sid>/ad-creatives.json
 */

const { r2PutShared } = require('../lib/r2');
const { generateOnboardingCreative } = require('./creativeGenerator');

// Startup config check. The picker UI will sit in skeleton state forever if
// generation can't run — make the misconfig loud at boot.
const hasKieKey = !!process.env.KIE_API_KEY
  || Object.keys(process.env).some(k => k.startsWith('KIE_API_KEY_'));
if (!hasKieKey) {
  console.warn('[ad-creatives] WARNING: no KIE_API_KEY (or KIE_API_KEY_<CITY>) set in Railway — ad creative generation will fail until one is provided');
}

/** In-flight generations keyed by sessionId so duplicate triggers are no-ops. */
const inflight = new Map();

/**
 * Public entry — kicks off generation in the background. Returns the in-flight
 * promise. Idempotent: a second call for the same sessionId returns the same
 * promise rather than re-firing generation.
 */
function generateAdCreatives(sessionId) {
  if (!sessionId) return Promise.resolve();
  if (inflight.has(sessionId)) return inflight.get(sessionId);
  const p = runGeneration(sessionId)
    .catch(err => console.error(`[ad-creatives] ${sessionId} fatal:`, err.message))
    .finally(() => inflight.delete(sessionId));
  inflight.set(sessionId, p);
  return p;
}

async function runGeneration(sessionId) {
  // Seed the file immediately so the picker can render skeletons while the
  // kie.ai pipeline runs (1–3 min typical).
  const seed = {
    lifestyle: { url: null, status: 'generating' },
    results:   { url: null, status: 'generating' },
    community: { url: null, status: 'generating' },
    video:     { url: null, status: 'disabled' },
    generated_at: new Date().toISOString(),
  };
  await writeState(sessionId, seed);

  // Delegate to the existing pipeline. No Drive folder ID — we just want the
  // kie.ai URLs + tier metadata, no Drive upload step.
  let results = [];
  try {
    console.log(`[ad-creatives] ${sessionId} delegating to generateOnboardingCreative`);
    results = await generateOnboardingCreative(sessionId);
  } catch (err) {
    console.error(`[ad-creatives] ${sessionId} generateOnboardingCreative threw:`, err.message);
  }

  // Pick the first usable URL per tier.
  const byTier = { cold: null, warm: null, offer: null };
  for (const item of (Array.isArray(results) ? results : [])) {
    if (!item || !item.url || !item.tier) continue;
    if (byTier[item.tier] === null) byTier[item.tier] = item.url;
  }

  // Tier → ad-creatives.json slot. (Slot key 'results' is historical; the
  // picker UI now labels it "Offer".) Failed slots carry no error body — the
  // picker shows a generic "Creative unavailable" placeholder.
  const slot = (url) => url ? { url, status: 'complete' } : { url: null, status: 'failed' };
  const final = {
    lifestyle: slot(byTier.cold),
    results:   slot(byTier.offer),
    community: slot(byTier.warm),
    video:     { url: null, status: 'disabled' },
    generated_at: new Date().toISOString(),
  };
  await writeState(sessionId, final);
  console.log(`[ad-creatives] ${sessionId} done — lifestyle=${final.lifestyle.status} results=${final.results.status} community=${final.community.status}`);
}

async function writeState(sessionId, state) {
  await r2PutShared(`onboarding/sessions/${sessionId}/ad-creatives.json`, state);
}

module.exports = { generateAdCreatives };
