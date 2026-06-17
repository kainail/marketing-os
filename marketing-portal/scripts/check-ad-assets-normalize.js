'use strict';
// Smoke-test the /api/portal/ad-assets normalization against real R2 data
// for the Bloomington gym — without going through the HTTP layer or auth.
// Mirrors the endpoint body so we can prove the output shape before deploy.
const { r2GetShared } = require('../lib/r2');

const SESSION_KEY = '569ec09b-4bce-4907-8333-8d7cfe4d0232';

const CREATIVE_SLOT_TO_TEMPERATURE = { lifestyle: 'cold', community: 'warm', results: 'offer' };
function levelToTemperature(level) {
  if (!level) return null;
  const m = String(level).match(/L?(\d)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 2) return 'cold';
  if (n === 3) return 'warm';
  return 'offer';
}

(async () => {
  const base = `onboarding/sessions/${SESSION_KEY}/`;
  const [
    confirmedHooksR, hooksR, confirmedOfferR, adCreativesR, confirmedCreativeR,
  ] = await Promise.allSettled([
    r2GetShared(`${base}confirmed-hooks.json`),
    r2GetShared(`${base}hooks.json`),
    r2GetShared(`${base}confirmed-offer.json`),
    r2GetShared(`${base}ad-creatives.json`),
    r2GetShared(`${base}confirmed-creative.json`),
  ]);
  const settled = r => r.status === 'fulfilled' ? r.value : null;
  const confirmedHooks = settled(confirmedHooksR);
  const hooksFinal = settled(hooksR);
  const confirmedOffer = settled(confirmedOfferR);
  const adCreatives = settled(adCreativesR);
  const confirmedCreative = settled(confirmedCreativeR);

  const library = Array.isArray(hooksFinal && hooksFinal.hooks)
    ? hooksFinal.hooks.map(h => ({
        hook: h.hook || '', framework: h.framework || null,
        level: h.awarenessLevel || null,
        temperature: levelToTemperature(h.awarenessLevel),
      }))
    : [];

  const libraryByHook = new Map(library.map(h => [h.hook.trim().toLowerCase(), h]));
  const ownerPicks = Array.isArray(confirmedHooks && confirmedHooks.selected)
    ? confirmedHooks.selected.map(p => {
        const key = (p.hook || '').trim().toLowerCase();
        const match = libraryByHook.get(key);
        return {
          hook: p.hook || '', phase: p.phase || null,
          confirmedAt: p.confirmed_at || null,
          level: match ? match.level : null,
          temperature: match ? match.temperature : null,
        };
      })
    : [];

  const generated = Array.isArray(confirmedHooks && confirmedHooks.generated)
    ? confirmedHooks.generated.map(g => ({ hook: g.hook || '', phase: g.phase || null }))
    : [];

  const tiles = [];
  if (adCreatives && typeof adCreatives === 'object') {
    for (const slot of ['lifestyle', 'community', 'results']) {
      const entry = adCreatives[slot];
      if (!entry) continue;
      tiles.push({
        type: slot,
        temperature: CREATIVE_SLOT_TO_TEMPERATURE[slot] || null,
        url: entry.url || null,
        status: entry.status || 'unknown',
      });
    }
  }

  const ownerCreativePick = (confirmedCreative && confirmedCreative.url) ? {
    type: confirmedCreative.type || null,
    temperature: CREATIVE_SLOT_TO_TEMPERATURE[confirmedCreative.type] || null,
    url: confirmedCreative.url,
    selectedAt: confirmedCreative.selectedAt || null,
  } : null;

  const offer = (confirmedOffer && typeof confirmedOffer === 'object') ? { ...confirmedOffer } : null;

  const result = {
    hooks: { library, ownerPicks, generated },
    offer,
    creatives: { tiles, ownerPick: ownerCreativePick },
    meta: {
      gymId: SESSION_KEY,
      gymName: 'Anytime Fitness Bloomington',
      hasOffer: !!offer,
      hasCreative: !!ownerCreativePick,
      hasHookPick: ownerPicks.length > 0,
    },
  };
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error('[fatal]', e.message); process.exit(1); });
