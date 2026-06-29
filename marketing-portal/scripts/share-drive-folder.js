'use strict';
/**
 * Grant Drive reader access on a folder (or the Shared Drive root) to a user.
 *
 * Run with:
 *   railway run node --use-system-ca scripts/share-drive-folder.js <email> [folderId]
 *
 * If folderId is omitted, defaults to the Shared Drive root
 * (0ABRXLc5owEmrUk9PVA = Gymsuiteai-Ahri-Media), which grants the user
 * reader access to EVERY folder in the drive — every state, every gym, every
 * subfolder, including ones created in the future. To share a narrower
 * subtree (e.g. one gym's Generated folder), pass the folder ID explicitly.
 *
 * Mirrors the existing share pattern at services/googleDrive.js:107-122:
 *   - permissions.create with type='user', role='reader'
 *   - supportsAllDrives: true (required for Shared Drives)
 *   - sendNotificationEmail: false (the service account has no real mailbox
 *     to send a meaningful "from")
 *   - duplicate-permission errors are logged non-fatal — the access already
 *     exists in that case
 *
 * Reversible — the grant can be removed any time from Drive's Share dialog.
 *
 * What it touches:
 *   READ:  nothing
 *   WRITE: one Drive permission on the target file/folder
 *   Does NOT: touch R2, Meta, kie.ai, anything in this repo
 */

const { google } = require('googleapis');
const { getDriveClient } = require('../services/googleDrive');

const SHARED_DRIVE_ROOT = '0ABRXLc5owEmrUk9PVA';

const email    = process.argv[2];
const folderId = process.argv[3] || SHARED_DRIVE_ROOT;

if (!email || !email.includes('@')) {
  console.error('[share] usage: node scripts/share-drive-folder.js <email> [folderId]');
  console.error('[share] email is required; folderId defaults to the Shared Drive root');
  process.exit(1);
}

(async () => {
  console.log(`\n=== Share Drive ${folderId === SHARED_DRIVE_ROOT ? '(Shared Drive root)' : 'folder'} with ${email} ===\n`);
  console.log(`[share] target fileId: ${folderId}`);
  console.log(`[share] role:          reader`);
  console.log(`[share] type:          user`);
  console.log(`[share] notify email:  no\n`);

  const drive = getDriveClient();

  // Best-effort: read the target's name so the log is human-readable. For
  // the Shared Drive root, files.get returns the drive itself.
  try {
    if (folderId === SHARED_DRIVE_ROOT) {
      const sd = await drive.drives.get({ driveId: folderId, fields: 'id,name' });
      console.log(`[share] target name: "${sd.data.name}" (Shared Drive)`);
    } else {
      const f = await drive.files.get({ fileId: folderId, supportsAllDrives: true, fields: 'id,name,mimeType' });
      console.log(`[share] target name: "${f.data.name}" (${f.data.mimeType})`);
    }
  } catch (err) {
    console.warn(`[share] could not resolve target name (${err.message}) — continuing with grant anyway`);
  }

  try {
    const res = await drive.permissions.create({
      fileId: folderId,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      requestBody: {
        type: 'user',
        role: 'reader',
        emailAddress: email,
      },
      fields: 'id,role,type,emailAddress',
    });
    console.log(`\n[share] OK — permission created:`);
    console.log(`    permissionId: ${res.data.id}`);
    console.log(`    role:         ${res.data.role}`);
    console.log(`    type:         ${res.data.type}`);
    console.log(`    emailAddress: ${res.data.emailAddress || email}`);
    console.log(`\n[share] You can revoke this any time in Drive's Share dialog.`);
  } catch (err) {
    // Mirror services/googleDrive.js:118-122: duplicate-permission shows as a
    // 400 with a specific message and isn't really a failure — surface it
    // explicitly so the operator knows the share already existed.
    const msg = (err && err.message) || String(err);
    if (/cannot be shared|already a /i.test(msg)) {
      console.warn(`\n[share] permission likely already exists (Drive returned: ${msg})`);
      console.warn(`[share] no action needed — ${email} should already have access.`);
      process.exit(0);
    }
    console.error('\n[share] FAILED:', msg);
    if (err.response && err.response.data) console.error('[share] response:', JSON.stringify(err.response.data));
    process.exit(1);
  }
})().catch(err => {
  console.error('[share] FATAL:', err.message);
  process.exit(1);
});
