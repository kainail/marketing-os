'use strict';

/**
 * Ad creative generator — fires 3 Higgsfield image jobs in parallel via the
 * Higgsfield HTTP API. Writes ad-creatives.json incrementally so the owner's
 * polling UI can replace skeletons with real images one at a time.
 *
 * Inputs read from R2 (shared/):
 *   onboarding/sessions/<sid>/confirmed-hooks.json
 *   onboarding/sessions/<sid>/confirmed-offer.json
 *   onboarding/sessions/<sid>/knowledge-base/fitness/lifestyle-avatar.md
 *   onboarding/sessions/<sid>/prospect-research.json
 *   onboarding/sessions/<sid>/session.json (fallback for gym name / city)
 *
 * Output written to R2 (shared/):
 *   onboarding/sessions/<sid>/ad-creatives.json
 */

const { r2GetShared, r2PutShared } = require('../lib/r2');

const HIGGSFIELD_API_BASE = process.env.HIGGSFIELD_API_BASE || 'https://api.higgsfield.ai';
const HIGGSFIELD_API_KEY = process.env.HIGGSFIELD_API_KEY || '';

if (!HIGGSFIELD_API_KEY) {
  console.error('[ad-creatives] WARNING: HIGGSFIELD_API_KEY is not set — ad creative generation will fail until it is provided');
}

// Per-job poll deadline. Higgsfield image jobs typically finish in 30–120s.
const JOB_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 5 * 1000;

// confirmed-offer.json is written by the owner during the offer A/B reveal —
// usually within ~30s of /complete returning. If it never arrives we still
// generate using session/brain-state fallbacks.
const OFFER_WAIT_MS = 5 * 60 * 1000;
const OFFER_POLL_MS = 3 * 1000;

/** In-flight generations keyed by sessionId so duplicate triggers are no-ops. */
const inflight = new Map();

/** Probe is memoized — runs once per process. */
let _probePromise = null;

/**
 * Public entry — kicks off generation in the background. Returns immediately.
 * Idempotent: if a generation is already in flight for this session, returns
 * the existing promise.
 */
function generateAdCreatives(sessionId) {
  if (!sessionId) return Promise.resolve();
  if (inflight.has(sessionId)) return inflight.get(sessionId);
  const p = runGeneration(sessionId)
    .catch(err => console.error(`[ad-creatives] ${sessionId} fatal:`, err.message))
    .finally(() => inflight.delete(sessionId));
  inflight.set(sessionId, p);
  return p;
}

async function runGeneration(sessionId) {
  if (!HIGGSFIELD_API_KEY) {
    console.error(`[ad-creatives] ${sessionId} aborting — HIGGSFIELD_API_KEY is not set`);
    return;
  }

  // One-time API connectivity probe. Logs status code + body snippet so a wrong
  // base URL or revoked key shows up immediately in Railway logs.
  await ensureProbed();

  const inputs = await collectInputs(sessionId);
  if (!inputs) return;

  // Seed file so the UI polling endpoint can render skeletons + per-slot status.
  const state = {
    lifestyle: { url: null, status: 'generating' },
    results:   { url: null, status: 'generating' },
    community: { url: null, status: 'generating' },
    video:     { url: null, status: 'disabled' },
    generated_at: new Date().toISOString(),
  };
  await writeState(sessionId, state);

  const jobs = buildJobs(inputs);

  // Job 4 — Video ad (enable when ready):
  //   Model: Seedance 2.0 (job_set_type: seedance_2_0), aspect 9:16, duration 6s
  //   Prompt: "<hook text> — person walking into gym, confident,
  //   transformation energy, cinematic motion, 6 seconds, <city> gym setting"
  // Uncomment and add "video" card to picker to enable.
  // jobs.push({
  //   key: 'video',
  //   model: 'seedance_2_0',
  //   prompt: `${inputs.hook} — person walking into gym, confident, transformation energy, cinematic motion, 6 seconds, ${inputs.city} gym setting`,
  //   extraParams: { duration: 6 },
  // });

  await Promise.allSettled(jobs.map(j => runJob(sessionId, j)));
  console.log(`[ad-creatives] ${sessionId} generation pass complete`);
}

/** Build the 3 job specs from the resolved inputs. */
function buildJobs({ avatarFirstSentence, gymName, city, hook }) {
  return [
    {
      key: 'lifestyle',
      model: 'imagegen_2_0',
      prompt: `${avatarFirstSentence} walking into ${gymName} in ${city}, warm morning light, realistic, aspirational fitness lifestyle, vertical 9:16, cinematic`,
    },
    {
      key: 'results',
      model: 'imagegen_2_0',
      prompt: `Before and after energy, person looking confident and strong, ${city} gym setting, ${hook} visual, realistic, vertical 9:16`,
    },
    {
      key: 'community',
      model: 'text2image_soul_v2',
      prompt: `Small group of real people working out together in a modern gym, ${city}, authentic UGC style, warm lighting, vertical 9:16`,
    },
  ];
}

/** Resolve every input the prompts need, with sensible fallbacks. */
async function collectInputs(sessionId) {
  const offer = await waitForConfirmedOffer(sessionId);

  const [hooks, avatarMd, research, session] = await Promise.all([
    r2GetShared(`onboarding/sessions/${sessionId}/confirmed-hooks.json`),
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/lifestyle-avatar.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/prospect-research.json`),
    r2GetShared(`onboarding/sessions/${sessionId}/session.json`),
  ]);

  if (!session) {
    console.warn(`[ad-creatives] ${sessionId} session.json missing — aborting`);
    return null;
  }

  const hook = pickWinningHook(hooks);
  const avatarFirstSentence = pickAvatarFirstSentence(avatarMd);
  const gymName = research?.gymName || session.gymName || 'your gym';
  const city = research?.city || session.city || 'your city';

  return { hook, avatarFirstSentence, gymName, city, offer };
}

/** Poll until confirmed-offer.json is available, then return it. */
async function waitForConfirmedOffer(sessionId) {
  const deadline = Date.now() + OFFER_WAIT_MS;
  while (Date.now() < deadline) {
    const offer = await r2GetShared(`onboarding/sessions/${sessionId}/confirmed-offer.json`);
    if (offer) return offer;
    await sleep(OFFER_POLL_MS);
  }
  console.warn(`[ad-creatives] ${sessionId} confirmed-offer.json never appeared — proceeding without it`);
  return null;
}

function pickWinningHook(hooksFile) {
  if (!hooksFile) return 'real transformation';
  if (Array.isArray(hooksFile)) {
    const last = hooksFile[hooksFile.length - 1];
    return (last && (last.hook || last.text)) || 'real transformation';
  }
  const selected = Array.isArray(hooksFile.selected) ? hooksFile.selected : [];
  const last = selected[selected.length - 1];
  return (last && (last.hook || last.text)) || 'real transformation';
}

/** First non-empty sentence of the avatar's opening paragraph. */
function pickAvatarFirstSentence(md) {
  if (typeof md !== 'string' || !md.trim()) return 'A 40-something gym member';
  const firstPara = md
    .replace(/^---[\s\S]*?---\n/, '')      // drop frontmatter if present
    .split(/\n\s*\n/)                       // first paragraph block
    .map(s => s.replace(/^#+\s.*$/gm, '').trim())
    .find(s => s && !s.startsWith('#'));
  if (!firstPara) return 'A 40-something gym member';
  const firstSentence = firstPara.split(/(?<=[.!?])\s+/)[0].trim();
  return firstSentence || firstPara.substring(0, 140);
}

/** ─── Higgsfield HTTP API ───────────────────────────────────────────────── */

function authHeaders() {
  return {
    'Authorization': `Bearer ${HIGGSFIELD_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * One-time connectivity check against GET /v1/models. Logs status + body
 * snippet on first call, then memoizes so we do not spam the API per session.
 */
function ensureProbed() {
  if (_probePromise) return _probePromise;
  _probePromise = (async () => {
    const url = `${HIGGSFIELD_API_BASE}/v1/models`;
    try {
      const r = await fetch(url, { headers: authHeaders() });
      const text = (await r.text().catch(() => '')).substring(0, 300);
      if (r.ok) {
        console.log(`[ad-creatives] probe ${url} → ${r.status} OK (body: ${text})`);
      } else {
        console.error(`[ad-creatives] probe ${url} → ${r.status} (body: ${text}) — generation may fail; verify HIGGSFIELD_API_BASE and HIGGSFIELD_API_KEY`);
      }
    } catch (err) {
      console.error(`[ad-creatives] probe ${url} failed: ${err.message}`);
    }
  })();
  return _probePromise;
}

/** Create a generation job. Returns the job_id string. */
async function createJob(model, prompt) {
  const url = `${HIGGSFIELD_API_BASE}/v1/generate`;
  const body = JSON.stringify({
    job_set_type: model,
    params: { prompt, aspect_ratio: '9:16' },
  });
  const r = await fetch(url, { method: 'POST', headers: authHeaders(), body });
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    throw new Error(`POST /v1/generate ${r.status}: ${text.substring(0, 300)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`POST /v1/generate non-JSON response: ${text.substring(0, 200)}`); }
  const jobId = data.job_id || data.id || data.jobId || data.job?.id;
  if (!jobId) throw new Error(`POST /v1/generate returned no job id: ${text.substring(0, 200)}`);
  return jobId;
}

/** Poll GET /v1/jobs/<id> every 5s until complete, then return the output URL. */
async function pollJob(jobId) {
  const url = `${HIGGSFIELD_API_BASE}/v1/jobs/${jobId}`;
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let loggedShape = false;
  while (Date.now() < deadline) {
    const r = await fetch(url, { headers: authHeaders() });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      throw new Error(`GET /v1/jobs/${jobId} ${r.status}: ${text.substring(0, 300)}`);
    }
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`GET /v1/jobs/${jobId} non-JSON response: ${text.substring(0, 200)}`); }
    const status = String(data.status || data.state || '').toLowerCase();
    if (!loggedShape) {
      loggedShape = true;
      console.log(`[ad-creatives] job ${jobId} keys=${Object.keys(data).join(',')} status=${status}`);
    }
    if (status === 'complete' || status === 'completed' || status === 'succeeded' || status === 'success') {
      const outUrl = extractOutputUrl(data);
      if (!outUrl) throw new Error(`job ${jobId} marked ${status} but no URL found in response: ${text.substring(0, 300)}`);
      return outUrl;
    }
    if (status === 'failed' || status === 'error' || status === 'errored' || status === 'canceled' || status === 'cancelled') {
      throw new Error(`job ${jobId} ${status}: ${data.error || data.message || text.substring(0, 200)}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`job ${jobId} timed out after ${Math.round(JOB_TIMEOUT_MS / 1000)}s`);
}

/** Defensive output-URL extraction — Higgsfield response shape varies by model. */
function extractOutputUrl(data) {
  const candidates = [
    data.result_url,                                   // ← actual field returned by Higgsfield API
    data.output_url,
    data.url,
    data.output?.url,
    Array.isArray(data.output) ? data.output[0]?.url : null,
    Array.isArray(data.outputs) ? data.outputs[0]?.url : null,
    Array.isArray(data.results) ? (data.results[0]?.url || data.results[0]?.result_url || data.results[0]?.output_url) : null,
    Array.isArray(data.media) ? (data.media[0]?.url || data.media[0]) : null,
    data.media_url,
    typeof data.output === 'string' ? data.output : null,
    data.output?.image_url, data.output?.video_url,
    data.result?.url, data.result?.result_url, data.result?.output_url,
    Array.isArray(data.urls) ? data.urls[0] : null,
    data.job?.result?.url, data.job?.result_url, data.job?.output_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
  }
  return null;
}

/** Run a single Higgsfield job and write its URL into ad-creatives.json. */
async function runJob(sessionId, job) {
  console.log(`[ad-creatives] ${sessionId} ${job.key} → ${job.model}`);
  try {
    const jobId = await createJob(job.model, job.prompt);
    console.log(`[ad-creatives] ${sessionId} ${job.key} submitted as ${jobId}`);
    const url = await pollJob(jobId);
    await patchState(sessionId, job.key, { url, status: 'complete' });
    console.log(`[ad-creatives] ${sessionId} ${job.key} done`);
  } catch (err) {
    console.error(`[ad-creatives] ${sessionId} ${job.key} failed:`, err.message);
    await patchState(sessionId, job.key, { url: null, status: 'failed', error: err.message });
  }
}

/** Last-write-wins merge into ad-creatives.json. */
const writeLocks = new Map();
async function patchState(sessionId, key, patch) {
  const prev = writeLocks.get(sessionId) || Promise.resolve();
  const next = prev.then(async () => {
    const current = (await r2GetShared(`onboarding/sessions/${sessionId}/ad-creatives.json`)) || {};
    current[key] = { ...(current[key] || {}), ...patch };
    current.updated_at = new Date().toISOString();
    await r2PutShared(`onboarding/sessions/${sessionId}/ad-creatives.json`, current);
  }).catch(err => console.error(`[ad-creatives] patchState ${sessionId}/${key} failed:`, err.message));
  writeLocks.set(sessionId, next);
  await next;
}

async function writeState(sessionId, state) {
  await r2PutShared(`onboarding/sessions/${sessionId}/ad-creatives.json`, state);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateAdCreatives };
