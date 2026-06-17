'use strict';
// One-time: seed gyms/<bloomingtonGymId>/location.json in R2 so the live
// Bloomington campaign reads its geo from the same path as every future gym.
// The static fallback in getEffectiveGeo remains as a last resort for this id.
//   railway run node scripts/seed-bloomington-location.js

const { r2GetShared, r2PutShared } = require('../lib/r2');
const { resolveLatLng } = require('../lib/geoResolver');

const BLOOMINGTON_GYM_ID = '569ec09b-4bce-4907-8333-8d7cfe4d0232';
const SOURCE = { city: 'Bloomington', state: 'IN', zip: '47401' };
const RADIUS_MILES = 15;

(async () => {
  const key = `gyms/${BLOOMINGTON_GYM_ID}/location.json`;

  const existing = await r2GetShared(key);
  if (existing && typeof existing.lat === 'number' && typeof existing.lng === 'number') {
    console.log(`location.json already present at ${key} — lat/lng=${existing.lat},${existing.lng}, radius=${existing.radiusMiles}mi`);
    console.log('Re-run with --force to overwrite.');
    if (!process.argv.includes('--force')) process.exit(0);
  }

  const resolved = resolveLatLng(SOURCE);
  if (!resolved) {
    console.error(`could not resolve lat/lng for ${JSON.stringify(SOURCE)} — refusing to seed without coordinates`);
    process.exit(1);
  }

  const doc = {
    city:        SOURCE.city,
    state:       SOURCE.state,
    zip:         SOURCE.zip,
    lat:         resolved.lat,
    lng:         resolved.lng,
    radiusMiles: RADIUS_MILES,
    resolvedAt:  new Date().toISOString(),
    resolver:    resolved.resolver,
    seededBy:    'scripts/seed-bloomington-location.js',
  };

  await r2PutShared(key, doc);
  console.log(`wrote ${key} — center ${doc.lat},${doc.lng}, radius ${doc.radiusMiles}mi (via ${resolved.resolver}: ${resolved.resolvedFrom})`);
})().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
