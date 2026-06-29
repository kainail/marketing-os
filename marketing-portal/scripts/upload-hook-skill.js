'use strict';
/**
 * Upload skills/hook-writer/SKILL.md to R2 at shared key skills/hook-writer.md.
 *
 * Idempotent. Refuses to overwrite if the key already exists; pass --force
 * to clobber. The portal server reads the same key at runtime, with a
 * repo-root disk fallback so /api/portal/generate-hooks stays functional
 * even before this script has been run.
 *
 * Usage:
 *   node scripts/upload-hook-skill.js            # upload, refuse if present
 *   node scripts/upload-hook-skill.js --force    # upload, overwrite if present
 *
 * Requires Railway env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.
 */

const fs = require('fs');
const path = require('path');
const { r2GetShared, r2PutShared } = require('../lib/r2');

const SHARED_KEY = 'skills/hook-writer.md';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_PATH = path.join(REPO_ROOT, 'skills', 'hook-writer', 'SKILL.md');

async function main() {
  const force = process.argv.includes('--force');

  if (!fs.existsSync(LOCAL_PATH)) {
    console.error(`[upload-hook-skill] ERROR: source file not found at ${LOCAL_PATH}`);
    process.exit(1);
  }
  const body = fs.readFileSync(LOCAL_PATH, 'utf-8');
  if (!body.trim()) {
    console.error('[upload-hook-skill] ERROR: source file is empty');
    process.exit(1);
  }

  const existing = await r2GetShared(SHARED_KEY);
  if (existing && !force) {
    console.log(`[upload-hook-skill] R2 key shared/${SHARED_KEY} already exists (${typeof existing === 'string' ? existing.length : '?'} chars). Use --force to overwrite.`);
    process.exit(0);
  }

  await r2PutShared(SHARED_KEY, body);
  console.log(`[upload-hook-skill] uploaded ${body.length} chars to shared/${SHARED_KEY}${existing ? ' (overwritten)' : ''}.`);
}

main().catch(err => {
  console.error('[upload-hook-skill] failed:', err.message);
  process.exit(1);
});
