'use strict';

/**
 * Google Drive service — Shared Drive operations for AHRI creative assets.
 *
 * All functions are non-blocking: errors are logged and a safe default returned
 * so the caller (session complete handler) never waits on Drive failures.
 *
 * Every Drive API call includes supportsAllDrives: true. List calls also include
 * includeItemsFromAllDrives: true, corpora: 'drive', driveId. Without these flags
 * Shared Drive operations silently fail with a 404 or empty result.
 *
 * createGymFolderStructure is idempotent — every folder level checks for an
 * existing folder with the same name + parent before creating a new one.
 */

const { google } = require('googleapis');
const { r2GetShared } = require('../lib/r2');

const SHARED_DRIVE_ID = '0ABRXLc5owEmrUk9PVA';

function getDriveClient() {
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (!b64) throw new Error('[Drive] GOOGLE_CREDENTIALS_B64 not set');
  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Search for a folder by name under a specific parent inside the Shared Drive.
 * Returns the existing folder ID, or null if not found.
 */
async function findFolder(drive, name, parentId) {
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({
    q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: SHARED_DRIVE_ID,
    fields: 'files(id)',
    pageSize: 1,
  });
  return list.data.files?.[0]?.id || null;
}

/**
 * Find or create a folder under a parent. Idempotent — never creates duplicates.
 */
async function findOrCreateFolder(drive, name, parentId) {
  const existing = await findFolder(drive, name, parentId);
  if (existing) {
    console.log(`[Drive] found existing folder "${name}" under ${parentId}: ${existing}`);
    return existing;
  }
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  console.log(`[Drive] created folder "${name}" under ${parentId}: ${res.data.id}`);
  return res.data.id;
}

/**
 * Create the gym's folder hierarchy inside the Shared Drive.
 *
 * Structure: [State] / [City] — [Gym Name] / { Photos, Generated, Content Schedule }
 *
 * Fully idempotent — re-running for the same gym returns existing folder IDs.
 * Returns { root, photos, generated, contentSchedule } or null on failure.
 */
async function createGymFolderStructure(gymName, city, state, ownerEmail, sessionId) {
  try {
    const drive = getDriveClient();

    // State folder directly under the Shared Drive root
    const stateFolderId = await findOrCreateFolder(
      drive,
      state || 'Unknown State',
      SHARED_DRIVE_ID
    );

    // City — Gym Name folder inside the state folder
    const cityGymName = `${city || 'Unknown City'} — ${gymName || 'Gym'}`;
    const rootFolderId = await findOrCreateFolder(drive, cityGymName, stateFolderId);

    // Subfolders — all idempotent via findOrCreateFolder
    const [photosFolderId, generatedFolderId, contentScheduleFolderId] = await Promise.all([
      findOrCreateFolder(drive, 'Photos', rootFolderId),
      findOrCreateFolder(drive, 'Generated', rootFolderId),
      findOrCreateFolder(drive, 'Content Schedule', rootFolderId),
    ]);

    // Share Photos folder with owner as writer (graceful if already shared)
    if (ownerEmail && ownerEmail.includes('@')) {
      try {
        await drive.permissions.create({
          fileId: photosFolderId,
          supportsAllDrives: true,
          requestBody: {
            type: 'user',
            role: 'writer',
            emailAddress: ownerEmail,
          },
          sendNotificationEmail: false,
        });
        console.log(`[Drive] shared Photos folder with ${ownerEmail}`);
      } catch (permErr) {
        // Duplicate permission is a 400 with "Sorry, the items you have selected cannot be shared" —
        // log and continue, the folder is already accessible.
        console.warn(`[Drive] permissions.create for ${ownerEmail} (non-fatal):`, permErr.message);
      }
    }

    console.log(`[Drive] folder structure ready for ${gymName} (session ${sessionId}): root=${rootFolderId}`);
    return {
      root: rootFolderId,
      photos: photosFolderId,
      generated: generatedFolderId,
      contentSchedule: contentScheduleFolderId,
    };
  } catch (err) {
    console.error(`[Drive] createGymFolderStructure failed (session ${sessionId}):`, err.message);
    return null;
  }
}

/**
 * Upload a file to a folder in the Shared Drive.
 * content may be a Buffer or string. Returns { id, webViewLink } or null on failure.
 */
async function uploadFileToDrive(folderId, fileName, content, mimeType) {
  try {
    const drive = getDriveClient();
    const { Readable } = require('stream');
    const body = Buffer.isBuffer(content)
      ? Readable.from(content)
      : Readable.from(Buffer.from(content, 'utf-8'));

    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: { mimeType, body },
      fields: 'id, webViewLink',
    });

    console.log(`[Drive] uploaded ${fileName} → ${res.data.id}`);
    return { id: res.data.id, webViewLink: res.data.webViewLink };
  } catch (err) {
    console.error(`[Drive] uploadFileToDrive failed for ${fileName}:`, err.message);
    return null;
  }
}

/**
 * List all non-trashed files in a Shared Drive folder.
 * Returns array of { id, name, mimeType, createdTime }.
 */
async function listDriveFolder(folderId) {
  try {
    const drive = getDriveClient();
    const list = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: SHARED_DRIVE_ID,
      fields: 'files(id, name, mimeType, createdTime)',
      pageSize: 100,
      orderBy: 'createdTime desc',
    });
    return list.data.files || [];
  } catch (err) {
    console.error(`[Drive] listDriveFolder failed for ${folderId}:`, err.message);
    return [];
  }
}

/**
 * List files in the Photos folder, score each with Claude Vision against KB context,
 * copy approved images (overall >= 6, not disqualified) to the Generated folder.
 *
 * Returns { analyzed, approved, photos: [{id, name, overall, authenticity, avatarMatch,
 * hookAlignment, approved, reason, movedFileId}] }
 */
async function scoreAndSelectPhotos(photosFolderId, generatedFolderId, sessionId) {
  try {
    const drive = getDriveClient();
    const files = await listDriveFolder(photosFolderId);
    const imageFiles = files.filter(f => f.mimeType && f.mimeType.startsWith('image/'));

    if (imageFiles.length === 0) {
      console.log(`[Drive] scoreAndSelectPhotos: no images in Photos folder (session ${sessionId})`);
      return { analyzed: 0, approved: 0, photos: [] };
    }

    const [brainState, avatar, confirmedHooks] = await Promise.all([
      r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/brain-state/current-state.md`),
      r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/lifestyle-avatar.md`),
      r2GetShared(`onboarding/sessions/${sessionId}/confirmed-hooks.json`),
    ]);

    const hooks = Array.isArray(confirmedHooks)
      ? confirmedHooks
      : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
      : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
      : [];

    const brainLines = (typeof brainState === 'string' ? brainState : '').split('\n');
    const marketGap = brainLines.find(l => l.toLowerCase().startsWith('market gap:'))?.replace(/market gap:\s*/i, '').trim() || '';
    const offerLine = brainLines.find(l => l.toLowerCase().startsWith('name:'))?.replace(/name:\s*/i, '').trim() || '';
    const hookAngle = hooks[0]?.hook || '';

    const avatarLines = (typeof avatar === 'string' ? avatar : '').split('\n');
    const triggerMoment = avatarLines
      .slice(avatarLines.findIndex(l => l.includes('## The Moment')) + 1)
      .filter(l => l.trim() && !l.startsWith('#'))
      .slice(0, 1).join(' ').substring(0, 150);

    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_BLOOMINGTON;
    if (!apiKey) throw new Error('No Anthropic API key available');
    const client = new Anthropic({ apiKey });

    const results = [];

    for (const file of imageFiles) {
      try {
        const dlRes = await drive.files.get(
          { fileId: file.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        const base64 = Buffer.from(dlRes.data).toString('base64');
        const mediaType = file.mimeType.startsWith('image/') ? file.mimeType : 'image/jpeg';

        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              {
                type: 'text',
                text: `Score this photo for gym Facebook/Instagram ads targeting this specific avatar.

AVATAR TRIGGER MOMENT: ${triggerMoment || 'busy adult who let fitness slip'}
CONFIRMED HOOK ANGLE: ${hookAngle || 'community over performance'}
OFFER DIFFERENTIATOR: ${offerLine || ''}
MARKET GAP: ${marketGap || 'community and belonging'}

Score 1-10 on THREE dimensions:
1. Authenticity: Does it look like a real phone photo (not stock)?
2. Avatar match: Does it visually represent the trigger moment or avatar lifestyle?
3. Hook alignment: Does it visually support the hook angle above?

AUTOMATIC DISQUALIFY (set approved: false regardless of scores):
- Before/after body transformation framing
- Exposed physiques or fitness model body focus
- Body shaming imagery

Average the three scores for overall. Only approve if average >= 6 AND not disqualified.

Respond with JSON only:
{"authenticity": 7, "avatarMatch": 6, "hookAlignment": 7, "overall": 6.7, "approved": true, "reason": "one sentence", "disqualified": false}`,
              },
            ],
          }],
        });

        const raw = msg.content[0]?.text?.trim() || '{}';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const approved = parsed.approved === true && parsed.disqualified !== true && (parsed.overall || 0) >= 6;

        let movedFileId = null;
        if (approved) {
          try {
            const copyRes = await drive.files.copy({
              fileId: file.id,
              supportsAllDrives: true,
              requestBody: {
                name: `photo-approved-${file.name}`,
                parents: [generatedFolderId],
              },
              fields: 'id',
            });
            movedFileId = copyRes.data.id;
            console.log(`[Drive] approved photo ${file.name} copied to Generated: ${movedFileId}`);
          } catch (copyErr) {
            console.error(`[Drive] copy to Generated failed for ${file.name}:`, copyErr.message);
          }
        }

        results.push({
          id: file.id,
          name: file.name,
          overall: parsed.overall || 0,
          authenticity: parsed.authenticity || 0,
          avatarMatch: parsed.avatarMatch || 0,
          hookAlignment: parsed.hookAlignment || 0,
          approved,
          reason: parsed.reason || '',
          movedFileId,
        });

        console.log(`[Drive] scored ${file.name}: overall=${parsed.overall} approved=${approved}`);
      } catch (err) {
        console.error(`[Drive] scoring failed for ${file.name}:`, err.message);
        results.push({ id: file.id, name: file.name, overall: 0, approved: false, reason: 'Scoring failed', movedFileId: null });
      }
    }

    const approvedCount = results.filter(r => r.approved).length;
    console.log(`[Drive] scoreAndSelectPhotos: ${results.length} analyzed, ${approvedCount} approved (session ${sessionId})`);
    return { analyzed: results.length, approved: approvedCount, photos: results };
  } catch (err) {
    console.error(`[Drive] scoreAndSelectPhotos failed (session ${sessionId}):`, err.message);
    return { analyzed: 0, approved: 0, photos: [], error: err.message };
  }
}

/**
 * List files in a Shared Drive folder and score against KB context.
 * Returns the single best-scoring compliant file, or null if folder is empty.
 */
async function analyzeAndSelectBestPhoto(photosFolderId, sessionId) {
  try {
    const drive = getDriveClient();

    const list = await drive.files.list({
      q: `'${photosFolderId}' in parents and trashed=false and mimeType contains 'image/'`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: SHARED_DRIVE_ID,
      fields: 'files(id, name, mimeType)',
      pageSize: 20,
    });

    const files = list.data.files || [];
    if (files.length === 0) {
      console.log(`[Drive] analyzeAndSelectBestPhoto: no photos in folder ${photosFolderId}`);
      return null;
    }

    const [brainState, avatar] = await Promise.all([
      r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/brain-state/current-state.md`),
      r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/lifestyle-avatar.md`),
    ]);

    const context = [
      brainState ? `Brain State:\n${brainState}` : '',
      avatar ? `Avatar:\n${avatar}` : '',
    ].filter(Boolean).join('\n\n');

    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_BLOOMINGTON;
    if (!apiKey) throw new Error('No Anthropic API key available');
    const client = new Anthropic({ apiKey });

    let bestFile = null;
    let bestScore = -1;

    for (const file of files) {
      try {
        const dlRes = await drive.files.get(
          { fileId: file.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        const base64 = Buffer.from(dlRes.data).toString('base64');
        const mediaType = file.mimeType.startsWith('image/') ? file.mimeType : 'image/jpeg';

        const msg = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              {
                type: 'text',
                text: `Score this photo 1-10 for use in gym ads targeting this avatar.

${context}

Scoring criteria:
- 8-10: Real, candid, community feel — looks like a genuine gym moment, NOT a stock photo
- 5-7: Usable but generic
- 1-4: Stock photo look, over-produced, or doesn't match avatar

Also check: does it avoid before/after body transformation framing? (required)

Respond with JSON only: {"score": 7, "reason": "one sentence"}`,
              },
            ],
          }],
        });

        const raw = msg.content[0]?.text?.trim() || '{}';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const score = typeof parsed.score === 'number' ? parsed.score : 0;

        console.log(`[Drive] photo ${file.name}: score=${score} reason=${parsed.reason}`);

        if (score > bestScore) {
          bestScore = score;
          bestFile = { id: file.id, name: file.name, score, reason: parsed.reason };
        }
      } catch (err) {
        console.error(`[Drive] failed to score photo ${file.name}:`, err.message);
      }
    }

    return bestFile;
  } catch (err) {
    console.error(`[Drive] analyzeAndSelectBestPhoto failed (session ${sessionId}):`, err.message);
    return null;
  }
}

module.exports = {
  createGymFolderStructure,
  uploadFileToDrive,
  analyzeAndSelectBestPhoto,
  listDriveFolder,
  scoreAndSelectPhotos,
  getDriveClient,
  SHARED_DRIVE_ID,
};
