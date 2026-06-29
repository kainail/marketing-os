'use strict';
/**
 * Grant or upgrade Drive access on a folder (or the Shared Drive root) for a user.
 *
 * Run with:
 *   railway run node --use-system-ca scripts/share-drive-folder.js <email> [folderId] [role]
 *
 *   email    required, the Google account to grant access to
 *   folderId optional, defaults to the Shared Drive root
 *            (0ABRXLc5owEmrUk9PVA = Gymsuiteai-Ahri-Media) which covers EVERY
 *            folder in the drive — every state, every gym, every subfolder,
 *            including ones created in the future. Sharing the Shared Drive
 *            root requires the service account to be a Manager (= API role
 *            organizer) on the Shared Drive; Content Manager will 403.
 *   role     optional, one of reader | commenter | writer | fileOrganizer |
 *            organizer. Defaults to reader. (fileOrganizer/organizer are
 *            Shared-Drive-only.)
 *
 * Idempotent: if the user already has a permission on the target, the script
 * calls permissions.update to set the role to the requested value. So
 * re-running with a different role UPGRADES (or downgrades) the existing
 * grant — it never creates a duplicate or fails silently.
 *
 * Mirrors the existing share pattern at services/googleDrive.js:107-122:
 *   - permissions.create with type='user'
 *   - supportsAllDrives: true (required for Shared Drives)
 *   - sendNotificationEmail: false (the service account has no real mailbox
 *     to send a meaningful "from")
 *
 * Reversible — the grant can be removed any time from Drive's Share dialog.
 *
 * What it touches:
 *   READ:  may list permissions on the target file when upgrading
 *   WRITE: one Drive permission on the target file/folder
 *   Does NOT: touch R2, Meta, kie.ai, anything in this repo
 */

const { getDriveClient } = require('../services/googleDrive');

const SHARED_DRIVE_ROOT = '0ABRXLc5owEmrUk9PVA';
const VALID_ROLES = ['reader', 'commenter', 'writer', 'fileOrganizer', 'organizer'];

const email    = process.argv[2];
const folderId = process.argv[3] || SHARED_DRIVE_ROOT;
const role     = process.argv[4] || 'reader';

if (!email || !email.includes('@')) {
  console.error('[share] usage: node scripts/share-drive-folder.js <email> [folderId] [role]');
  console.error('[share] email is required; folderId defaults to the Shared Drive root; role defaults to reader');
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`[share] invalid role "${role}". Valid: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

// Find an existing permission for this email on this file. Returns the
// permission resource (id, role, type, emailAddress) or null. Case-insensitive
// email compare — Drive normalizes capitalization on its end.
async function findExistingPermission(drive, fileId, emailAddress) {
  let pageToken = null;
  const target = (emailAddress || '').toLowerCase();
  do {
    const list = await drive.permissions.list({
      fileId,
      supportsAllDrives: true,
      pageSize: 100,
      pageToken,
      fields: 'permissions(id,emailAddress,role,type),nextPageToken',
    });
    for (const p of (list.data.permissions || [])) {
      if ((p.emailAddress || '').toLowerCase() === target) return p;
    }
    pageToken = list.data.nextPageToken;
  } while (pageToken);
  return null;
}

function isDuplicatePermissionErr(err) {
  const msg = (err && err.message) || String(err || '');
  // Drive returns 400 with a few possible phrasings depending on file type
  // and SDK version. Match permissively — false positives just mean we look
  // up the existing permission and proceed identically.
  return /cannot be shared|already a |already has access|duplicate/i.test(msg)
      || err?.code === 409
      || err?.response?.status === 409;
}

(async () => {
  console.log(`\n=== Drive share — ${folderId === SHARED_DRIVE_ROOT ? '(Shared Drive root)' : 'folder'} ${folderId} → ${email} as ${role} ===\n`);
  console.log(`[share] target fileId: ${folderId}`);
  console.log(`[share] role:          ${role}`);
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
    console.warn(`[share] could not resolve target name (${err.message}) — continuing anyway`);
  }

  // Optimistic path: try permissions.create. If the user has no permission
  // yet, this succeeds. If they already have one, Drive throws a duplicate
  // error and we fall through to lookup + update.
  let created = null;
  try {
    const res = await drive.permissions.create({
      fileId: folderId,
      supportsAllDrives: true,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role, emailAddress: email },
      fields: 'id,role,type,emailAddress',
    });
    created = res.data;
  } catch (err) {
    if (!isDuplicatePermissionErr(err)) {
      console.error('\n[share] FAILED on permissions.create:', err.message);
      if (err.response && err.response.data) console.error('[share] response:', JSON.stringify(err.response.data));
      process.exit(1);
    }
    // Fall through to the update path.
  }

  if (created) {
    console.log(`\n[share] OK — permission created:`);
    console.log(`    permissionId: ${created.id}`);
    console.log(`    role:         ${created.role}`);
    console.log(`    type:         ${created.type}`);
    console.log(`    emailAddress: ${created.emailAddress || email}`);
    console.log(`\n[share] revoke any time from Drive's Share dialog.`);
    process.exit(0);
  }

  // Upgrade/downgrade path: existing permission found. Look it up by email,
  // then call permissions.update to set the requested role.
  console.log(`\n[share] permissions.create reported duplicate — looking up existing permission for ${email}…`);
  const existing = await findExistingPermission(drive, folderId, email);
  if (!existing) {
    console.error(`[share] permissions.create returned duplicate but permissions.list didn't surface a match for ${email}. Investigate manually.`);
    process.exit(1);
  }
  console.log(`[share] existing permission: id=${existing.id} role=${existing.role} type=${existing.type}`);

  if (existing.role === role) {
    console.log(`[share] role already matches "${role}" — nothing to do.`);
    process.exit(0);
  }

  const upd = await drive.permissions.update({
    fileId: folderId,
    permissionId: existing.id,
    supportsAllDrives: true,
    requestBody: { role },
    fields: 'id,role,type,emailAddress',
  });
  console.log(`\n[share] OK — permission UPDATED (was: ${existing.role}):`);
  console.log(`    permissionId: ${upd.data.id}`);
  console.log(`    role:         ${upd.data.role}`);
  console.log(`    type:         ${upd.data.type}`);
  console.log(`    emailAddress: ${upd.data.emailAddress || email}`);
  console.log(`\n[share] revoke any time from Drive's Share dialog.`);
})().catch(err => {
  console.error('[share] FATAL:', err.message);
  if (err.response && err.response.data) console.error('[share] response:', JSON.stringify(err.response.data));
  process.exit(1);
});
