'use strict';
// One-off: print ad-creatives.json for the Bloomington gym.
const { r2GetShared } = require('../lib/r2');
const GID = '569ec09b-4bce-4907-8333-8d7cfe4d0232';
(async () => {
  const d = await r2GetShared(`onboarding/sessions/${GID}/ad-creatives.json`);
  console.log(JSON.stringify(d, null, 2));
})().catch(e => { console.error('[fatal]', e.message); process.exit(1); });
