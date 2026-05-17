'use strict';
// node scripts/check-user.js f399456f-a264-42f8-9b59-4920306e28b2
const { r2GetShared } = require('../lib/r2');
const sessionId = process.argv[2] || 'f399456f-a264-42f8-9b59-4920306e28b2';

(async () => {
  const users = await r2GetShared('users/users.json');
  if (!Array.isArray(users)) { console.error('users.json not found or not an array'); process.exit(1); }

  const match = users.find(u =>
    u.sessionId === sessionId ||
    u.gymId === sessionId ||
    (Array.isArray(u.locations) && u.locations.some(l =>
      (typeof l === 'object' ? l.sessionId === sessionId || l.gymId === sessionId : l === sessionId)
    ))
  );

  if (!match) {
    console.log('No user found for sessionId:', sessionId);
    console.log('All owner emails:', users.filter(u => u.role === 'owner').map(u => u.email));
    process.exit(0);
  }

  const { passwordHash, resetToken, resetTokenExpiry, ...safe } = match;
  console.log('\n=== USER RECORD ===');
  console.log('email:', safe.email);
  console.log('role:', safe.role);
  console.log('activeGymId:', safe.activeGymId);
  console.log('sessionId (top-level):', safe.sessionId);
  console.log('gymId (top-level):', safe.gymId);
  console.log('status:', safe.status);
  console.log('\n=== LOCATIONS ===');
  if (Array.isArray(safe.locations)) {
    safe.locations.forEach((l, i) => {
      console.log(`\nlocation[${i}]:`);
      if (typeof l === 'object') {
        console.log('  gymId:', l.gymId);
        console.log('  sessionId:', l.sessionId);
        console.log('  gymName:', l.gymName);
        console.log('  city:', l.city);
        console.log('  campaign_status:', l.campaign_status);
        console.log('  meta_setup_pending:', l.meta_setup_pending);
        console.log('  launched_at:', l.launched_at);
        console.log('  active:', l.active);
      } else {
        console.log('  (string value):', l);
      }
    });
  } else {
    console.log('locations field:', safe.locations);
  }

  console.log('\n=== JWT PAYLOAD THAT WOULD BE ISSUED ===');
  console.log(JSON.stringify({
    userId: safe.id,
    email: safe.email,
    role: safe.role,
    locations: safe.locations,
    activeGymId: safe.activeGymId ?? null,
    sessionId: safe.sessionId ?? null,
    status: safe.status ?? null,
  }, null, 2));
})().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
