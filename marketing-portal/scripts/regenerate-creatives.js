'use strict';
/**
 * Regenerate the lifestyle + community ad creatives for a gym.
 *
 * Run with:
 *   railway run node --use-system-ca scripts/regenerate-creatives.js <gymId>
 *
 * The lifestyle + community slots' kie.ai URLs expire ~24-48h after generation.
 * This script re-runs the existing creative pipeline (which now includes the
 * rehost-to-R2 step), so the URLs that land in ad-creatives.json are permanent
 * /api/public/creative/... URLs served from our own bucket.
 *
 * Why not the existing /api/admin/sessions/:sessionId/regenerate-creatives
 * route at server.js:4684? That route blows away the WHOLE state including
 * the 'results' slot. This script preserves the existing results slot — per
 * the brief, that slot failed generation for a separate reason and isn't
 * what we're fixing right now.
 *
 * The script:
 *   1. Resolves gymId → sessionId via users/users.json (Bloomington's two
 *      are the same UUID; for other gyms they may differ).
 *   2. Reads current ad-creatives.json so we can preserve the results slot.
 *   3. Re-runs generateOnboardingCreative — every fresh kie URL gets rehosted
 *      to R2 the instant it's returned (see services/creativeGenerator.js).
 *   4. Writes a new ad-creatives.json with permanent lifestyle/community and
 *      the OLD results slot untouched.
 *
 * Does NOT touch: Meta, ad spend, the launch endpoint, owner auth, the
 * confirmed-creative.json file (the owner re-picks on next portal load).
 */

const { r2GetShared, r2PutShared } = require('../lib/r2');
const { getUsers } = require('../lib/userCache');
const { generateOnboardingCreative } = require('../services/creativeGenerator');

const argGymId = process.argv[2];
if (!argGymId) {
  console.error('[regen-creatives] usage: node scripts/regenerate-creatives.js <gymId>');
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(argGymId)) {
  console.error('[regen-creatives] gymId must be UUID-shaped');
  process.exit(1);
}

(async () => {
  console.log(`\n=== Regenerate ad creatives for gym ${argGymId} ===\n`);

  // ── Resolve gymId → sessionId via users.json ────────────────────────────
  let sessionId = argGymId;
  try {
    const users = await getUsers();
    let matchedLoc = null;
    for (const u of (users || [])) {
      for (const l of (u.locations || [])) {
        if (typeof l !== 'object') continue;
        if (l.gymId === argGymId || l.sessionId === argGymId) { matchedLoc = l; break; }
      }
      if (matchedLoc) break;
    }
    if (matchedLoc) {
      sessionId = matchedLoc.sessionId || matchedLoc.gymId || argGymId;
      console.log(`[regen-creatives] matched location in users.json — gymId=${matchedLoc.gymId} sessionId=${matchedLoc.sessionId}`);
    } else {
      console.log(`[regen-creatives] no matching location in users.json — treating arg as sessionId directly`);
    }
  } catch (err) {
    console.warn(`[regen-creatives] users.json lookup failed (${err.message}) — treating arg as sessionId directly`);
  }
  console.log(`[regen-creatives] using sessionId=${sessionId}\n`);

  // ── Snapshot current state so we can preserve the results slot ──────────
  const oldState = await r2GetShared(`onboarding/sessions/${sessionId}/ad-creatives.json`);
  const oldResults = (oldState && oldState.results) ? oldState.results : { url: null, status: 'failed' };
  const oldVideo   = (oldState && oldState.video)   ? oldState.video   : { url: null, status: 'disabled' };
  console.log(`[regen-creatives] existing state:`);
  console.log(`    lifestyle: ${oldState?.lifestyle?.status || 'missing'} ${oldState?.lifestyle?.url ? `(${String(oldState.lifestyle.url).substring(0, 60)}…)` : ''}`);
  console.log(`    community: ${oldState?.community?.status || 'missing'} ${oldState?.community?.url ? `(${String(oldState.community.url).substring(0, 60)}…)` : ''}`);
  console.log(`    results:   ${oldResults.status} ${oldResults.url ? `(${String(oldResults.url).substring(0, 60)}…)` : '(no url)'}    ← PRESERVED AS-IS`);
  console.log('');

  // ── Re-run the pipeline ─────────────────────────────────────────────────
  // generateOnboardingCreative produces 5 images mapped to cold/warm/offer
  // tiers. We use cold→lifestyle, warm→community, and drop the offer-tier
  // output (preserving the prior results slot). The rehost step inside the
  // pipeline ensures every URL in the returned array is already a permanent
  // /api/public/creative/... URL — no extra work in this script.
  console.log('[regen-creatives] running generateOnboardingCreative (this takes 1–3 min)...');
  const results = await generateOnboardingCreative(sessionId);
  console.log(`[regen-creatives] pipeline returned ${results.length} usable images\n`);

  const byTier = { cold: null, warm: null, offer: null };
  for (const item of results) {
    if (!item || !item.url || !item.tier) continue;
    if (byTier[item.tier] === null) byTier[item.tier] = item.url;
  }

  console.log('[regen-creatives] regenerated URLs:');
  console.log(`    cold (→ lifestyle): ${byTier.cold || '(none — regen failed)'}`);
  console.log(`    warm (→ community): ${byTier.warm || '(none — regen failed)'}`);
  console.log(`    offer (dropped — preserving old results slot)`);
  console.log('');

  // Sanity warning if any of the regenerated URLs is somehow still a kie URL
  // (means the rehost step fell through to the fallback). Don't block the
  // write, but flag it loudly so the operator knows.
  for (const [tier, url] of Object.entries(byTier)) {
    if (url && /aiquickdraw|tempfile|kie\.ai/i.test(url)) {
      console.warn(`[regen-creatives] WARNING: ${tier} URL still points at kie.ai — rehost fallback was hit. URL will expire.`);
    }
  }

  // ── Build and write final state ─────────────────────────────────────────
  const slot = (url) => url ? { url, status: 'complete' } : { url: null, status: 'failed' };
  const final = {
    lifestyle: slot(byTier.cold),
    results:   oldResults,                       // preserved verbatim
    community: slot(byTier.warm),
    video:     oldVideo,                         // preserved verbatim
    generated_at: new Date().toISOString(),
    regenerated_at: new Date().toISOString(),
  };

  await r2PutShared(`onboarding/sessions/${sessionId}/ad-creatives.json`, final);
  console.log('[regen-creatives] wrote new ad-creatives.json:');
  console.log(`    lifestyle: ${final.lifestyle.status} → ${final.lifestyle.url || '(none)'}`);
  console.log(`    community: ${final.community.status} → ${final.community.url || '(none)'}`);
  console.log(`    results:   ${final.results.status} (preserved)`);
  console.log(`    video:     ${final.video.status} (preserved)\n`);

  // Verify the write landed.
  const verify = await r2GetShared(`onboarding/sessions/${sessionId}/ad-creatives.json`);
  if (verify && verify.lifestyle && verify.lifestyle.url === final.lifestyle.url) {
    console.log('[regen-creatives] verified read-back — OK.');
  } else {
    console.warn('[regen-creatives] verify read-back DID NOT match — investigate.');
  }

  // Note about confirmed-creative.json:
  // We deliberately do NOT touch confirmed-creative.json. If the owner has
  // already picked one, that URL is now stale (kie 404). The owner-facing
  // portal will surface a broken image on the picked tile until they re-pick.
  // That's the right behavior — we shouldn't silently overwrite their pick.
  if (oldState && oldState.lifestyle && oldState.lifestyle.url) {
    console.log('[regen-creatives] note: confirmed-creative.json (if set) was NOT touched. Owner re-picks via the portal.');
  }
})().catch(err => {
  console.error('[regen-creatives] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
