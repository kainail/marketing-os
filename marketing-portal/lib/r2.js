/**
 * R2 helper — S3-compatible Cloudflare R2 via @aws-sdk/client-s3.
 *
 * Bucket key structure:
 *   {locationId}/intelligence-db/{path}
 *   {locationId}/attribution/sessions/{path}
 *   {locationId}/attribution/attribution-report.json
 *   {locationId}/queue/{path}
 *   shared/assets/{path}
 *   shared/templates/{path}
 *   shared/hooks/{path}
 *
 * R2 failure NEVER throws to the caller — every function logs and returns
 * a safe default (null, [], false) so the server keeps running.
 */

'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID   = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY   = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY   = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET       = process.env.R2_BUCKET_NAME || 'gymsuiteai-storage';
const R2_ENDPOINT     = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

let _client = null;

function getClient() {
  if (!_client) {
    if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
      throw new Error('[R2] Missing credentials: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required');
    }
    _client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    });
  }
  return _client;
}

function buildKey(locationId, filePath) {
  return `${locationId}/${filePath}`;
}

function buildSharedKey(filePath) {
  return `shared/${filePath}`;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Read a location-scoped object. Returns parsed JSON if valid JSON, raw string otherwise, or null if missing.
 */
async function r2Get(locationId, filePath) {
  const key = buildKey(locationId, filePath);
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const body = await streamToString(res.Body);
    try { return JSON.parse(body); } catch { return body; }
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    console.error(`[R2] r2Get failed for key=${key}:`, err.message);
    return null;
  }
}

/**
 * Write a location-scoped object. Auto-serializes objects to JSON.
 */
async function r2Put(locationId, filePath, data) {
  const key = buildKey(locationId, filePath);
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  try {
    await getClient().send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error(`[R2] r2Put failed for key=${key}:`, err.message);
  }
}

/**
 * List objects under a location-scoped prefix. Returns array of full key strings.
 */
async function r2List(locationId, prefix) {
  const fullPrefix = buildKey(locationId, prefix);
  try {
    const res = await getClient().send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: fullPrefix }));
    return (res.Contents || []).map(obj => obj.Key);
  } catch (err) {
    console.error(`[R2] r2List failed for prefix=${fullPrefix}:`, err.message);
    return [];
  }
}

/**
 * Delete a location-scoped object.
 */
async function r2Delete(locationId, filePath) {
  const key = buildKey(locationId, filePath);
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error(`[R2] r2Delete failed for key=${key}:`, err.message);
  }
}

/**
 * Delete from shared/ prefix (cross-location assets).
 */
async function r2DeleteShared(filePath) {
  const key = buildSharedKey(filePath);
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error(`[R2] r2DeleteShared failed for key=${key}:`, err.message);
  }
}

/**
 * Read from shared/ prefix (cross-location assets).
 */
async function r2GetShared(filePath) {
  const key = buildSharedKey(filePath);
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const body = await streamToString(res.Body);
    try { return JSON.parse(body); } catch { return body; }
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    console.error(`[R2] r2GetShared failed for key=${key}:`, err.message);
    return null;
  }
}

/**
 * Write to shared/ prefix (cross-location assets).
 */
async function r2PutShared(filePath, data) {
  const key = buildSharedKey(filePath);
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  try {
    await getClient().send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.error(`[R2] r2PutShared failed for key=${key}:`, err.message);
  }
}

/**
 * Check if a location-scoped object exists. Returns boolean.
 */
async function r2Exists(locationId, filePath) {
  const key = buildKey(locationId, filePath);
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    console.error(`[R2] r2Exists failed for key=${key}:`, err.message);
    return false;
  }
}

async function r2ListShared(prefix) {
  const fullPrefix = buildSharedKey(prefix);
  try {
    const res = await getClient().send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: fullPrefix }));
    return (res.Contents || []).map(obj => obj.Key);
  } catch (err) {
    console.error(`[R2] r2ListShared failed for prefix=${fullPrefix}:`, err.message);
    return [];
  }
}

// ─── Binary helpers ────────────────────────────────────────────────────────
// The default r2Put/r2GetShared pair is JSON-only — it hardcodes
// ContentType: 'application/json' on write and streamToString → JSON.parse on
// read. Image bytes must NOT go through those. The two helpers below preserve
// raw bytes and respect content-type round-trip.

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Write raw bytes under shared/<filePath> with an explicit content-type.
 * Unlike r2PutShared, this REJECTS on failure — the rehost step in
 * services/creativeGenerator.js needs to know when storage failed so it can
 * fall back to keeping the ephemeral source URL.
 */
async function r2PutSharedBinary(filePath, buffer, contentType) {
  const key = buildSharedKey(filePath);
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('r2PutSharedBinary: buffer must be a Buffer');
  }
  try {
    await getClient().send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }));
  } catch (err) {
    console.error(`[R2] r2PutSharedBinary failed for key=${key}:`, err.message);
    throw err;
  }
}

/**
 * Read raw bytes from shared/<filePath> with the stored content-type.
 * Returns { body: Buffer, contentType, contentLength } or null if missing.
 * Errors are logged and returned as null (the public proxy translates that
 * into a 404 — never a 500).
 */
async function r2GetSharedRaw(filePath) {
  const key = buildSharedKey(filePath);
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const body = await streamToBuffer(res.Body);
    return {
      body,
      contentType:   res.ContentType   || 'application/octet-stream',
      contentLength: res.ContentLength || body.length,
    };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    console.error(`[R2] r2GetSharedRaw failed for key=${key}:`, err.message);
    return null;
  }
}

module.exports = { r2Get, r2Put, r2List, r2ListShared, r2Delete, r2GetShared, r2PutShared, r2DeleteShared, r2Exists, r2PutSharedBinary, r2GetSharedRaw };
