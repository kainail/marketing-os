import 'dotenv/config';
import { google, drive_v3, sheets_v4 } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs-extra';
import path from 'path';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');

// --- Types ---

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  size: string;
}

// --- Auth ---

function getAuth() {
  const email = process.env['GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL'];
  const key = process.env['GOOGLE_DRIVE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error(
      'Google Drive credentials missing. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY in .env'
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  });
}

function getDrive(): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function getSheets(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// --- Error logging ---

function logDriveError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","drive","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[DRIVE LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'video/mp4',
  'video/quicktime',
]);

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|heic|webp|mp4|mov)$/i;

// --- Public functions ---

/**
 * Lists all image/video files in a Drive folder, skipping already-indexed IDs.
 */
export async function listNewFiles(folderId: string, alreadyIndexed: Set<string> = new Set()): Promise<DriveFile[]> {
  await sleep(100);
  try {
    const drive = getDrive();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,createdTime,size)',
      pageSize: 100,
    });

    const files = res.data.files ?? [];
    return files
      .filter(f => {
        if (!f.id || !f.name || !f.mimeType) return false;
        if (alreadyIndexed.has(f.id)) return false;
        return ALLOWED_MIME_TYPES.has(f.mimeType) || ALLOWED_EXTENSIONS.test(f.name);
      })
      .map(f => ({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        createdTime: f.createdTime ?? new Date().toISOString(),
        size: f.size ?? '0',
      }));
  } catch (err) {
    logDriveError('listNewFiles', err as Error);
    return [];
  }
}

/**
 * Downloads a Drive file into a Buffer for Claude vision analysis.
 * Does not save to disk permanently.
 */
export async function downloadForAnalysis(fileId: string): Promise<Buffer> {
  await sleep(100);
  const drive = getDrive();

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
      (err, res) => {
        if (err || !res) return reject(err ?? new Error('No response from Drive'));
        res.data
          .on('data', (chunk: Buffer) => chunks.push(chunk))
          .on('end', () => resolve())
          .on('error', reject);
      }
    );
  });

  return Buffer.concat(chunks);
}

/**
 * Moves a file from its current parent to a new folder in Drive.
 */
export async function moveToFolder(fileId: string, targetFolderId: string): Promise<void> {
  await sleep(100);
  try {
    const drive = getDrive();

    // Get current parents first
    const meta = await drive.files.get({ fileId, fields: 'parents,name' });
    const currentParents = (meta.data.parents ?? []).join(',');
    const fileName = meta.data.name ?? fileId;

    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: currentParents,
      fields: 'id,parents',
    });

    console.log(`  [Drive] Moved ${fileName} to folder ${targetFolderId}`);
  } catch (err) {
    logDriveError('moveToFolder', err as Error);
    throw err;
  }
}

/**
 * Reads and parses a JSON file from Drive. Returns empty object if file not found.
 */
export async function readJsonFile(fileId: string): Promise<object> {
  await sleep(100);
  try {
    const buffer = await downloadForAnalysis(fileId);
    return JSON.parse(buffer.toString('utf-8'));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('404') || msg.includes('not found')) return {};
    logDriveError('readJsonFile', err as Error);
    return {};
  }
}

/**
 * Writes an object as pretty-printed JSON back to a Drive file.
 * Creates the file if fileId is empty string — caller gets back the new file ID.
 */
export async function writeJsonFile(fileId: string, data: object, parentFolderId?: string): Promise<string> {
  await sleep(100);
  const drive = getDrive();
  const content = JSON.stringify(data, null, 2);
  const media = { mimeType: 'application/json', body: content };

  try {
    if (fileId) {
      await drive.files.update({ fileId, media, fields: 'id' });
      return fileId;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name: 'media-index.json',
          parents: parentFolderId ? [parentFolderId] : [],
          mimeType: 'application/json',
        },
        media,
        fields: 'id',
      });
      return res.data.id ?? '';
    }
  } catch (err) {
    logDriveError('writeJsonFile', err as Error);
    throw err;
  }
}

/**
 * Appends text content to a Google Doc. Creates the doc if docFileId is empty.
 */
export async function appendToDoc(docFileId: string, content: string, parentFolderId?: string): Promise<string> {
  await sleep(100);
  const drive = getDrive();

  try {
    if (!docFileId) {
      const res = await drive.files.create({
        requestBody: {
          name: 'shot-list.md',
          parents: parentFolderId ? [parentFolderId] : [],
          mimeType: 'application/vnd.google-apps.document',
        },
        fields: 'id',
      });
      docFileId = res.data.id ?? '';
    }

    // For Google Docs, we use the Drive file update with plain text
    // Full Docs API would be needed for rich formatting — plain text append here
    const existing = await readJsonFile(docFileId).catch(() => ({}));
    const existingText = (existing as Record<string, string>)['text'] ?? '';
    const updated = existingText + '\n' + content;

    await drive.files.update({
      fileId: docFileId,
      media: { mimeType: 'text/plain', body: updated },
    });

    return docFileId;
  } catch (err) {
    logDriveError('appendToDoc', err as Error);
    return docFileId;
  }
}

/**
 * Finds a subfolder by name within a parent folder. Returns null if not found.
 */
export async function getFolderIdByName(parentId: string, name: string): Promise<string | null> {
  await sleep(100);
  try {
    const drive = getDrive();
    const res = await drive.files.list({
      q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name)',
    });
    const files = res.data.files ?? [];
    return files.length > 0 ? (files[0].id ?? null) : null;
  } catch (err) {
    logDriveError('getFolderIdByName', err as Error);
    return null;
  }
}

/**
 * Reads a Google Sheet range and returns a 2D array of cell values.
 */
export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  await sleep(100);
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return (res.data.values as string[][] | null | undefined) ?? [];
  } catch (err) {
    logDriveError('readSheet', err as Error);
    return [];
  }
}

/**
 * Uploads a Buffer as a file to a Drive folder.
 * Returns the file ID and web view link.
 */
export async function uploadFileToDrive(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
  description?: string;
}): Promise<{ id: string; webViewLink: string }> {
  await sleep(100);
  const drive = getDrive();
  const stream = Readable.from(params.buffer);

  try {
    const response = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: params.filename,
        parents: [params.folderId],
        description: params.description ?? '',
      },
      media: {
        mimeType: params.mimeType,
        body: stream,
      },
      fields: 'id, webViewLink, name',
    });

    if (!response.data.id) throw new Error('Drive upload returned no file ID');

    return {
      id: response.data.id,
      webViewLink: response.data.webViewLink
        ?? `https://drive.google.com/file/d/${response.data.id}/view`,
    };
  } catch (err) {
    logDriveError('uploadFileToDrive', err as Error);
    throw err;
  }
}

/**
 * Lists all files in a folder — convenience wrapper that returns all files including non-media.
 */
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  await sleep(100);
  try {
    const drive = getDrive();
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,createdTime,size)',
      pageSize: 200,
    });
    return (res.data.files ?? [])
      .filter(f => f.id && f.name)
      .map(f => ({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType ?? 'application/octet-stream',
        createdTime: f.createdTime ?? new Date().toISOString(),
        size: f.size ?? '0',
      }));
  } catch (err) {
    logDriveError('listFilesInFolder', err as Error);
    return [];
  }
}
