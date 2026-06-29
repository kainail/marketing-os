'use strict';
/**
 * Rehost ad creatives from Google Drive → R2.
 *
 * Run with:
 *   railway run node --use-system-ca scripts/rehost-creatives-from-drive.js <gymId>
 *   railway run node --use-system-ca scripts/rehost-creatives-from-drive.js <gymId> --dry-run
 *
 * Why this script exists: during onboarding the creative pipeline runs TWICE
 * in parallel — one pass uploads compressed JPEGs to Drive (creative-*.jpg)
 * and a second pass writes kie.ai URLs straight into ad-creatives.json. The
 * kie URLs expire ~24-48h later, breaking the Ad Studio tiles. The Drive
 * copies are durable. This script reads the durable Drive copies and rehosts
 * them into R2 via the same binary helpers + public proxy URL shape that
 * shipped in cea4cfb — NO kie.ai calls, NO generation, NO credits.
 *
 * What it touches:
 *   READ:  shared/onboarding/sessions/<sessionId>/session.json   (R2)
 *   READ:  shared/users/users.json                                (R2 via getUsers)
 *   READ:  Google Drive folder (session.driveFolders.generated)
 *   READ:  Google Drive file bytes for the 2 picked files
 *   WRITE: shared/gyms/<sessionId>/creatives/<slot>-<uuid>.jpg    (R2 binary)
 *   WRITE: shared/onboarding/sessions/<sessionId>/ad-creatives.json (R2 JSON)
 *
 * What it does NOT touch:
 *   - confirmed-creative.json (owner re-picks via the portal to refresh)
 *   - Meta, ad accounts, spend, the launch endpoint
 *   - kie.ai (zero credit spend)
 *   - owner auth / users.json / permissions
 *   - results + video slots inside ad-creatives.json (preserved verbatim)
 */

const crypto = require('crypto');
const sharp = require('sharp');
const { r2GetShared, r2PutShared, r2PutSharedBinary } = require('../lib/r2');
const { getUsers } = require('../lib/userCache');
const { getDriveClient, listDriveFolder } = require('../services/googleDrive');

const argGymId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!argGymId) {
  console.error('[rehost-drive] usage: node scripts/rehost-creatives-from-drive.js <gymId> [--dry-run]');
  process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(argGymId)) {
  console.error('[rehost-drive] gymId must be UUID-shaped');
  process.exit(1);
}

// Parse the AI-generated filename produced by services/creativeGenerator.js:434:
//   `creative-${attempt + 1}-${i + 1}-score${gate.score}-${Date.now()}.jpg`
// Returns { attempt, position, score, timestamp, tier, slot } or null if the
// filename doesn't match (e.g. owner-uploaded photos in the same folder).
const FILENAME_RX = /^creative-(\d+)-(\d+)-score(\d+)-(\d+)\.jpg$/i;

function tierFromPosition(pos) {
  const p = pos % 5;
  return p <= 1 ? 'cold' : p <= 3 ? 'warm' : 'offer';
}
const TIER_TO_SLOT = { cold: 'lifestyle', warm: 'community', offer: 'results' };

function parseCreativeFile(f) {
  const m = (f.name || '').match(FILENAME_RX);
  if (!m) return null;
  const attempt = parseInt(m[1], 10);
  const positionOneIndexed = parseInt(m[2], 10);
  const score = parseInt(m[3], 10);
  const timestamp = parseInt(m[4], 10);
  // Filename is 1-indexed; tier mod is on 0-indexed position. attempt is also
  // 1-indexed in the filename but cycle == 5 so attempt doesn't change tier.
  const position = positionOneIndexed - 1;
  const tier = tierFromPosition(position);
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    createdTime: f.createdTime,
    attempt, position, score, timestamp,
    tier,
    slot: TIER_TO_SLOT[tier],
  };
}

// Picker: highest score wins, newest timestamp breaks ties.
function pickBest(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b.score - a.score) || (b.timestamp - a.timestamp))[0];
}

async function downloadDriveFile(fileId) {
  const drive = getDriveClient();
  const dlRes = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(dlRes.data);
}

async function rehostOne(drivePick, scopeId) {
  if (!drivePick) return null;
  const rawBuffer = await downloadDriveFile(drivePick.id);
  // Normalize to the same shape every other creative gets: 1200px wide,
  // q85 JPEG. The Drive copy was ALREADY processed this way once during the
  // original upload, so re-running sharp is mostly a no-op — kept for shape
  // parity with the kie rehost path (creativeGenerator.js:rehostKieImageToR2).
  const buffer = await sharp(rawBuffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const filename = `${drivePick.slot}-${crypto.randomUUID()}.jpg`;
  const r2Path = `gyms/${scopeId}/creatives/${filename}`;
  await r2PutSharedBinary(r2Path, buffer, 'image/jpeg');

  const permanentUrl = `/api/public/creative/${scopeId}/${filename}`;
  return {
    drivePick,
    r2Path,
    permanentUrl,
    rawBytes: rawBuffer.length,
    storedBytes: buffer.length,
  };
}

(async () => {
  console.log(`\n=== Rehost ad creatives FROM Drive for gym ${argGymId} ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // 1. Resolve gymId → sessionId via users.json (same lookup as regen script).
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
      console.log(`[rehost-drive] matched location in users.json — gymId=${matchedLoc.gymId} sessionId=${matchedLoc.sessionId}`);
    } else {
      console.log(`[rehost-drive] no matching location in users.json — treating arg as sessionId directly`);
    }
  } catch (err) {
    console.warn(`[rehost-drive] users.json lookup failed (${err.message}) — treating arg as sessionId directly`);
  }
  console.log(`[rehost-drive] using sessionId=${sessionId}\n`);

  // 2. Read session.json for the Drive folder ID.
  const session = await r2GetShared(`onboarding/sessions/${sessionId}/session.json`);
  if (!session) {
    console.error(`[rehost-drive] session.json not found at onboarding/sessions/${sessionId}/session.json`);
    process.exit(1);
  }
  const generatedFolderId = session?.driveFolders?.generated;
  if (!generatedFolderId) {
    console.error(`[rehost-drive] session.driveFolders.generated is missing — nothing to recover from Drive.`);
    console.error(`[rehost-drive] session.driveFolders =`, session?.driveFolders);
    process.exit(1);
  }
  console.log(`[rehost-drive] driveFolders.generated = ${generatedFolderId}\n`);

  // 3. List the Drive folder and parse creative-* files.
  const files = await listDriveFolder(generatedFolderId);
  console.log(`[rehost-drive] Drive folder lists ${files.length} files`);
  const creativeFiles = files.map(parseCreativeFile).filter(Boolean);
  console.log(`[rehost-drive] ${creativeFiles.length} match the AI-generated naming pattern`);
  if (creativeFiles.length === 0) {
    console.error(`[rehost-drive] no creative-*.jpg files in the Drive folder — nothing to rehost.`);
    process.exit(1);
  }

  // 4. Bucket by slot and report candidates.
  const bySlot = { lifestyle: [], community: [], results: [] };
  for (const c of creativeFiles) {
    if (bySlot[c.slot]) bySlot[c.slot].push(c);
  }
  for (const slot of ['lifestyle', 'community', 'results']) {
    const sorted = [...bySlot[slot]].sort((a, b) => (b.score - a.score) || (b.timestamp - a.timestamp));
    console.log(`\n[rehost-drive] ${slot.toUpperCase()} candidates (${sorted.length}):`);
    for (const c of sorted) {
      const dt = new Date(c.timestamp).toISOString();
      console.log(`    score=${c.score} ts=${dt}  ${c.name}  (driveId=${c.id})`);
    }
  }

  // 5. Pick the best for lifestyle + community. Leave results untouched per
  //    brief; surface the candidate so the operator can decide separately.
  const lifestylePick = pickBest(bySlot.lifestyle);
  const communityPick = pickBest(bySlot.community);
  const resultsBest   = pickBest(bySlot.results);

  console.log(`\n[rehost-drive] PICKS:`);
  console.log(`    lifestyle ← ${lifestylePick ? lifestylePick.name : '(none — slot will write status=failed)'}`);
  console.log(`    community ← ${communityPick ? communityPick.name : '(none — slot will write status=failed)'}`);
  console.log(`    results   ← (preserved as-is in ad-creatives.json — not modified)`);
  if (resultsBest) {
    console.log(`                FYI best offer-tier candidate available is: ${resultsBest.name} (score=${resultsBest.score}) — re-run with a separate slot arg later if you want to use it.`);
  } else {
    console.log(`                FYI no offer-tier candidate (creative-*-5-*) in Drive.`);
  }

  if (!lifestylePick && !communityPick) {
    console.error(`\n[rehost-drive] nothing to rehost. Exiting.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\n[rehost-drive] DRY RUN — no R2 writes performed. Re-run without --dry-run to apply.`);
    process.exit(0);
  }

  // 6. Download + sharp normalize + r2PutSharedBinary for each pick.
  console.log(`\n[rehost-drive] downloading + uploading...`);
  let lifestyleResult = null, communityResult = null;
  try {
    lifestyleResult = await rehostOne(lifestylePick, sessionId);
    if (lifestyleResult) {
      console.log(`    lifestyle: ${lifestyleResult.rawBytes}→${lifestyleResult.storedBytes} bytes → ${lifestyleResult.permanentUrl}`);
    }
  } catch (err) {
    console.error(`[rehost-drive] lifestyle rehost FAILED: ${err.message}`);
  }
  try {
    communityResult = await rehostOne(communityPick, sessionId);
    if (communityResult) {
      console.log(`    community: ${communityResult.rawBytes}→${communityResult.storedBytes} bytes → ${communityResult.permanentUrl}`);
    }
  } catch (err) {
    console.error(`[rehost-drive] community rehost FAILED: ${err.message}`);
  }

  if (!lifestyleResult && !communityResult) {
    console.error(`\n[rehost-drive] both rehost attempts failed — leaving ad-creatives.json untouched.`);
    process.exit(1);
  }

  // 7. Read current ad-creatives.json, merge, write.
  const oldState = await r2GetShared(`onboarding/sessions/${sessionId}/ad-creatives.json`);
  const oldResults = (oldState && oldState.results) ? oldState.results : { url: null, status: 'failed' };
  const oldVideo   = (oldState && oldState.video)   ? oldState.video   : { url: null, status: 'disabled' };

  const slotState = (rehosted, prior) => {
    if (rehosted) return { url: rehosted.permanentUrl, status: 'complete' };
    // If rehost failed for this slot, KEEP whatever was there before — don't
    // demote a previously-working slot to 'failed' just because this run
    // couldn't replace it.
    if (prior) return prior;
    return { url: null, status: 'failed' };
  };

  const final = {
    lifestyle: slotState(lifestyleResult, oldState?.lifestyle),
    results:   oldResults,
    community: slotState(communityResult, oldState?.community),
    video:     oldVideo,
    generated_at: oldState?.generated_at || new Date().toISOString(),
    rehosted_from_drive_at: new Date().toISOString(),
  };

  await r2PutShared(`onboarding/sessions/${sessionId}/ad-creatives.json`, final);
  console.log(`\n[rehost-drive] wrote ad-creatives.json:`);
  console.log(`    lifestyle: ${final.lifestyle.status} → ${final.lifestyle.url || '(none)'}`);
  console.log(`    community: ${final.community.status} → ${final.community.url || '(none)'}`);
  console.log(`    results:   ${final.results.status} (preserved)`);
  console.log(`    video:     ${final.video.status} (preserved)`);

  // 8. Verify read-back.
  const verify = await r2GetShared(`onboarding/sessions/${sessionId}/ad-creatives.json`);
  const verifyOk =
    verify &&
    verify.lifestyle?.url === final.lifestyle.url &&
    verify.community?.url === final.community.url;
  if (verifyOk) {
    console.log(`\n[rehost-drive] verified read-back — OK.`);
  } else {
    console.warn(`\n[rehost-drive] verify read-back DID NOT match — investigate.`);
  }

  // 9. Note about confirmed-creative.json.
  console.log(`\n[rehost-drive] note: confirmed-creative.json was NOT touched. If the owner had picked one previously, that URL is still dead — they re-pick via the portal to refresh.`);
})().catch(err => {
  console.error('[rehost-drive] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
