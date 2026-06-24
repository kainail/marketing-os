'use strict';
/**
 * Upload skills/offer-machine/SKILL.md to R2 at shared key skills/offer-machine.md.
 *
 * Idempotent. By default refuses to overwrite if the key already exists; pass
 * --force to clobber. The portal server reads the same key at runtime, with a
 * repo-root fallback so the endpoint stays functional even before this script
 * has been run.
 *
 * Usage:
 *   node scripts/upload-offer-skill.js            # upload, refuse if present
 *   node scripts/upload-offer-skill.js --force    # upload, overwrite if present
 *
 * Requires Railway env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.
 */

const fs = require('fs');
const path = require('path');
const { r2GetShared, r2PutShared } = require('../lib/r2');

const SHARED_KEY = 'skills/offer-machine.md';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_PATH = path.join(REPO_ROOT, 'skills', 'offer-machine', 'SKILL.md');

async function main() {
  const force = process.argv.includes('--force');

  if (!fs.existsSync(LOCAL_PATH)) {
    console.error(`[upload-offer-skill] ERROR: source file not found at ${LOCAL_PATH}`);
    process.exit(1);
  }
  const body = fs.readFileSync(LOCAL_PATH, 'utf-8');
  if (!body.trim()) {
    console.error('[upload-offer-skill] ERROR: source file is empty');
    process.exit(1);
  }

  const existing = await r2GetShared(SHARED_KEY);
  if (existing && !force) {
    console.log(`[upload-offer-skill] R2 key shared/${SHARED_KEY} already exists (${typeof existing === 'string' ? existing.length : '?'} chars). Use --force to overwrite.`);
    process.exit(0);
  }

  await r2PutShared(SHARED_KEY, body);
  console.log(`[upload-offer-skill] uploaded ${body.length} chars to shared/${SHARED_KEY}${existing ? ' (overwritten)' : ''}.`);
}

main().catch(err => {
  console.error('[upload-offer-skill] failed:', err.message);
  process.exit(1);
});
