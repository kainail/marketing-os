'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cron = require('node-cron');
const { r2Get, r2Put, r2List, r2Delete, r2GetShared, r2PutShared, r2Exists } = require('./lib/r2');
const { requireAuth, requireAdmin, requireLocation, loginLimiter } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3003;

const ALLOWED_ORIGINS = [
  'https://gymsuiteai-dashboard-production.up.railway.app',
  'https://marketing-os-production-2b85.up.railway.app',
];

// --- Path constants ---
// On Railway, __dirname = /app (the marketing-portal/ folder is the service root).
// Asset directories are copied into marketing-portal/ so they exist at /app/distribution etc.
// REPO_ROOT env var can still override if needed.
const ROOT      = process.env.REPO_ROOT || path.join(__dirname);
const INTEL     = path.join(ROOT, 'intelligence-db');
const LOGS      = path.join(ROOT, 'logs');
const OUTPUTS   = path.join(ROOT, 'outputs');
const MANUS_TASKS_PATH = (() => {
  const candidates = [
    path.join(__dirname, 'manus-tasks'),
    process.env.MANUS_TASKS_DIR,
    path.join(__dirname, '..', 'manus-tasks')
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        console.log('[Manus] Task files found at:', candidate);
        return candidate;
      }
    } catch (e) {}
  }
  console.warn('[Manus] No task directory found — using hardcoded fallback list');
  return null;
})();
const BRIEFS    = path.join(OUTPUTS, 'anytime-fitness', 'morning-briefs');
const THRESHOLDS = path.join(ROOT, 'knowledge-base', 'paid-media', 'thresholds.md');
const ASSET_LOG = path.join(ROOT, 'performance', 'asset-log.csv');
const SESSION_LOG = path.join(LOGS, 'session-log.csv');
const RULES_FILE = path.join(__dirname, 'config', 'agentic-rules.json');
const MANUS_API_BASE = process.env.MANUS_API_BASE || 'https://api.manus.ai/v2';
const WEBHOOK_URL = process.env.WEBHOOK_URL
  || process.env.PORTAL_WEBHOOK_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null);

const locationConfig = require('./config/locations.js');
const MANUS_API_KEY = locationConfig.getLocation('bloomington').keys?.manusApiKey || '';

// --- Meta Marketing API ---
// Credentials are sourced from config/locations.js which reads per-location env vars:
// META_ACCESS_TOKEN_BLOOMINGTON, META_AD_ACCOUNT_ID_BLOOMINGTON, META_PAGE_ID_BLOOMINGTON, etc.
// META_APP_ID and META_APP_SECRET are app-level (shared across all locations).
const _bloomingtonMeta = locationConfig.getLocation('bloomington').meta;
const META_ACCESS_TOKEN = _bloomingtonMeta.accessToken;
const META_AD_ACCOUNT_ID = (() => { const raw = _bloomingtonMeta.adAccountId || ''; return raw.startsWith('act_') ? raw : (raw ? `act_${raw}` : ''); })();
const META_PAGE_ID = _bloomingtonMeta.pageId;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_PIXEL_ID = _bloomingtonMeta.pixelId;
const META_API_VERSION = 'v19.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function getLocationMeta(locationId) {
  const loc = locationConfig.getLocation(locationId);
  if (!loc) return null;
  const raw = loc.meta.adAccountId || '';
  return {
    accessToken: loc.meta.accessToken,
    adAccountId: raw.startsWith('act_') ? raw : (raw ? `act_${raw}` : ''),
    pageId: loc.meta.pageId,
    pixelId: loc.meta.pixelId,
  };
}

if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID || !META_PAGE_ID) {
  console.warn('⚠ Meta API credentials not configured — campaign creation disabled. Set META_ACCESS_TOKEN_BLOOMINGTON, META_AD_ACCOUNT_ID_BLOOMINGTON, META_PAGE_ID_BLOOMINGTON in Railway env vars.');
}
const DATA_DIR = path.join(__dirname, 'data');
const TASK_RUNS_FILE = path.join(DATA_DIR, 'task-runs.json');
const SCHEMAS_DIR = path.join(ROOT, 'schemas', 'manus-outputs');

const SKILL_PLATFORM_MAP = {
  'ad-copy': 'meta',
  'hook-writer': 'meta',
  'content-calendar': 'instagram,facebook',
  'landing-page': 'web',
  'email-sequence': 'email',
  'nurture-sync': 'sms,email',
  'reactivation': 'sms,email',
  'referral-campaign': 'multi',
  'review-engine': 'google,facebook',
  'offer-machine': 'multi',
};

const PERSISTENT_DATA_DIR = (() => {
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    const volumePath = path.join(
      process.env.RAILWAY_VOLUME_MOUNT_PATH,
      'intelligence-db'
    );
    try {
      fs.mkdirSync(volumePath, { recursive: true });
      console.log('[Storage] Using Railway volume:', volumePath);
      return volumePath;
    } catch (e) {
      console.warn('[Storage] Volume mkdir failed:', e.message);
    }
  }
  const localPath = path.join(__dirname, '..', 'intelligence-db');
  console.log('[Storage] Using local path:', localPath);
  return localPath;
})();

if (!process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.warn('⚠ RAILWAY_VOLUME_MOUNT_PATH not set. Intelligence files fall back to local paths. R2 is now primary storage.');
}

// Maps a PERSISTENT_DATA_DIR filesystem path to an R2 key under intelligence-db/.
function persistentPathToR2Key(fsPath) {
  const base = PERSISTENT_DATA_DIR.endsWith(path.sep) ? PERSISTENT_DATA_DIR : PERSISTENT_DATA_DIR + path.sep;
  const rel = fsPath.startsWith(base) ? fsPath.slice(base.length) : path.basename(fsPath);
  return `intelligence-db/${rel.replace(/\\/g, '/')}`;
}

// Queue paths live on the persistent volume so approvals survive redeploys.
// Seeded from /app/distribution/queue/ on first deploy via seedQueueIfEmpty().
const QUEUE  = path.join(PERSISTENT_DATA_DIR, 'queue', 'pending-review');
const READY  = path.join(PERSISTENT_DATA_DIR, 'queue', 'ready-to-post');
const POSTED = path.join(PERSISTENT_DATA_DIR, 'queue', 'posted');

const ATTRIBUTION_DIR    = path.join(PERSISTENT_DATA_DIR, 'attribution');
const SESSIONS_DIR       = path.join(ATTRIBUTION_DIR, 'sessions');
const ATTRIBUTION_REPORT = path.join(ATTRIBUTION_DIR, 'attribution-report.json');

if (!process.env.WEBHOOK_URL && !process.env.PORTAL_WEBHOOK_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
  console.warn('[cron] ⚠ WEBHOOK_URL not set — Manus callbacks may not reach portal. Add WEBHOOK_URL=https://marketing-os-production-2b85.up.railway.app to Railway env vars.');
}

// --- Helpers ---

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function safeReadJSON(p) {
  try { const t = safeRead(p); return t ? JSON.parse(t) : {}; } catch { return {}; }
}

async function safeReadJSONAsync(p) {
  try {
    const data = await fs.promises.readFile(p, 'utf-8');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function safeReadDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}

function parseMdHeaders(content) {
  const headers = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/^([a-z_]+):\s*(.+)$/i);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
    else if (line.trim() && !line.startsWith('#') && Object.keys(headers).length > 0) break;
  }
  return headers;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { headers: parseMdHeaders(content), body: content };
  const headers = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return { headers, body: match[2] };
}

function cleanBodyText(body) {
  return body
    .replace(/^#{1,6}\s+.+$/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/^\s*[-*]{3,}\s*$/gm, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ');
}

function parseHooksFromContent(content, assetId, variant, status) {
  const hooks = [];
  const sectionRegex = /### Framework \d+ — ([^\n]+)\n([\s\S]*?)(?=###|$)/g;
  let sMatch;
  while ((sMatch = sectionRegex.exec(content)) !== null) {
    const frameworkName = sMatch[1].trim();
    const block = sMatch[2];
    const levelMatch = frameworkName.match(/\(Level ([^)]+)\)/);
    const awarenessLevel = levelMatch ? levelMatch[1] : '';
    const hookType = frameworkName.replace(/\s*\(Level[^)]+\)/, '').trim();
    const hookRegex = /^\d+\.\s+\*\*([^*]+)\*\*/gm;
    let hMatch;
    while ((hMatch = hookRegex.exec(block)) !== null) {
      hooks.push({
        hook_text: hMatch[1].trim(),
        hook_type: hookType,
        awareness_level: awarenessLevel,
        skill: 'hook-writer',
        variant,
        asset_id: assetId,
        cpl: null,
        ctr: null,
        status: status || 'ready-to-post',
      });
    }
  }
  return hooks;
}

function parseCsvRows(content) {
  if (!content) return [];
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(row => {
    const vals = row.match(/(".*?"|[^,]+|(?<=,)(?=,))/g) || row.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/"/g, '').trim(); });
    return obj;
  });
}

function logToSession(intent, notes) {
  try {
    fs.mkdirSync(LOGS, { recursive: true });
    if (!fs.existsSync(SESSION_LOG)) {
      fs.writeFileSync(SESSION_LOG, 'timestamp,intent,skills_run,assets_generated,budget_flagged,notes\n');
    }
    const row = `"${new Date().toISOString()}","${intent}","portal","0","false","${notes.replace(/"/g, "'")}"\n`;
    fs.appendFileSync(SESSION_LOG, row);
  } catch {}
}

// --- Manus task helpers ---

const KNOWN_TASK_FILES = [
  'competitor-research.md',
  'trend-monitoring.md',
  'paid-ads-analyzer.md',
  'google-ads-analyzer.md',
  'budget-pacing-tracker.md',
  'lead-journey-tracker.md',
  'clarity-analyzer.md',
  'nurture-performance-analyzer.md',
  'retention-early-warning.md',
  'review-monitoring.md',
  'crm-hygiene.md',
  'referral-tracker.md',
  'gbp-optimization.md',
  'monthly-report.md',
  'content-posting.md',
  'paid-ads-setup.md',
];

const TASK_TYPE_MAP = {
  'competitor-research.md': 'competitor-research',
  'trend-monitoring.md': 'trend-monitoring',
  'paid-ads-analyzer.md': 'paid-ads-analyzer',
  'google-ads-analyzer.md': 'google-ads-analyzer',
  'budget-pacing-tracker.md': 'budget-pacing-tracker',
  'lead-journey-tracker.md': 'lead-journey-tracker',
  'clarity-analyzer.md': 'clarity-analyzer',
  'nurture-performance-analyzer.md': 'nurture-performance-analyzer',
  'retention-early-warning.md': 'retention-early-warning',
  'review-monitoring.md': 'review-monitoring',
  'crm-hygiene.md': 'crm-hygiene',
  'referral-tracker.md': 'referral-tracker',
  'gbp-optimization.md': 'gbp-optimization',
  'monthly-report.md': 'monthly-report',
  'content-posting.md': 'content-posting',
  'paid-ads-setup.md': 'paid-ads-setup',
};

const TASK_OUTPUT_PATHS = {
  'competitor-research': [
    { key: 'competitor_ads', path: path.join(PERSISTENT_DATA_DIR, 'market', 'competitor-ads.json') },
    { key: 'competitor_offers', path: path.join(PERSISTENT_DATA_DIR, 'market', 'competitor-offers.json') },
    { key: 'hook_saturation', path: path.join(PERSISTENT_DATA_DIR, 'market', 'hook-saturation.json') },
  ],
  'trend-monitoring': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'patterns', 'trend-hypotheses.json') }],
  'paid-ads-analyzer': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'paid', 'meta-performance.json') }],
  'google-ads-analyzer': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'paid', 'google-performance.json') }],
  'budget-pacing-tracker': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'paid', 'pacing-log.json') }],
  'lead-journey-tracker': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'lead-journey', 'attribution-report.json') }],
  'clarity-analyzer': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'clarity', 'heatmap-insights.json') }],
  'nurture-performance-analyzer': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'nurture', 'sequence-performance.json') }],
  'retention-early-warning': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'retention', 'dropout-alerts.json') }],
  'review-monitoring': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'market', 'review-log.json') }],
  'crm-hygiene': [{ key: null, path: path.join(ROOT, 'logs', 'crm-hygiene-log.json') }],
  'referral-tracker': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'market', 'referral-log.json') }],
  'gbp-optimization': [{ key: null, path: path.join(ROOT, 'logs', 'gbp-audit-log.json') }],
  'monthly-report': [], // written by Manus directly to outputs/anytime-fitness/monthly-reports/
  'content-posting': [], // posting log written by Manus directly
  'paid-ads-setup': [{ key: null, path: path.join(PERSISTENT_DATA_DIR, 'paid', 'account-verification.json') }],
};

const TASK_RUNS_R2_PATH = 'intelligence-db/queue/task-runs.json';
const TASK_RUNS_LOCATION = 'bloomington';

async function loadTaskRuns() {
  try {
    const data = await r2Get(TASK_RUNS_LOCATION, TASK_RUNS_R2_PATH);
    return (data && typeof data === 'object') ? data : {};
  } catch {
    return {};
  }
}

async function saveTaskRun(taskId, data) {
  try {
    const runs = await loadTaskRuns();
    runs[taskId] = { ...data, updated_at: new Date().toISOString() };
    await r2Put(TASK_RUNS_LOCATION, TASK_RUNS_R2_PATH, runs);
  } catch (err) {
    console.error('[task-runs] save failed:', err.message);
  }
}

async function updateTaskRun(taskId, updates) {
  try {
    const runs = await loadTaskRuns();
    if (!runs[taskId]) return;
    runs[taskId] = { ...runs[taskId], ...updates, updated_at: new Date().toISOString() };
    await r2Put(TASK_RUNS_LOCATION, TASK_RUNS_R2_PATH, runs);
  } catch (err) {
    console.error('[task-runs] update failed:', err.message);
  }
}

function getTaskType(filename) {
  return TASK_TYPE_MAP[filename] || filename.replace('.md', '');
}

function stripMarkdownFences(text) {
  return text.replace(/^```(?:json)?\n?/gm, '').replace(/^```\s*$/gm, '').trim();
}

function findJsonBlock(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function verifyWebhookSignature(req, secret) {
  const sig = req.headers['x-manus-signature'] || req.headers['x-webhook-signature'] || '';
  if (!sig) return false;
  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function atomicWriteJSON(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmp, filePath);
}

// --- Meta Marketing API helpers ---

async function metaApiCall(endpoint, method = 'GET', params = {}, retries = 3, accessToken = META_ACCESS_TOKEN) {
  if (!accessToken) throw new Error('META_ACCESS_TOKEN not configured');
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  const options = { method, headers: { 'Content-Type': 'application/json' } };

  if (method === 'GET') {
    url.searchParams.append('access_token', accessToken);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  } else {
    options.body = JSON.stringify({ ...params, access_token: accessToken });
  }

  try {
    const response = await fetch(url.toString(), options);
    const data = await response.json();

    if (data.error) {
      if (data.error.is_transient && retries > 0) {
        console.log(`[Meta] Transient error — retrying in 5 seconds... (${retries} left)`);
        await new Promise(r => setTimeout(r, 5000));
        return metaApiCall(endpoint, method, params, retries - 1, accessToken);
      }
      console.error('[Meta] Full error:', JSON.stringify(data.error, null, 2));
      throw new Error(`Meta API error: ${data.error.message} (code: ${data.error.code})`);
    }

    return data;
  } catch (error) {
    throw error;
  }
}

async function verifyMetaCredentials() {
  try {
    const result = await metaApiCall('me', 'GET', { fields: 'id,name' });
    console.log('[Meta API] Authenticated as:', result.name);
    return { valid: true, user: result };
  } catch (error) {
    console.error('[Meta API] Auth failed:', error.message);
    return { valid: false, error: error.message };
  }
}

// Placeholder performance data — used when intelligence-db/paid/ files are empty
function getPlaceholderPerf() {
  return {
    _is_placeholder: true,
    _placeholder_message: 'Placeholder data — run Manus paid-ads-analyzer to populate real data',
    overview: {
      blended_cpl: 34,
      meta_cpl: 38,
      google_cpl: 29,
      cpa: 113,
      cpm: 113,
      roas: 17.7,
      payback_months: 2.9
    },
    by_channel: [
      { channel: 'Meta Cold', spend: 175, leads: 4, cpl: 43.75, bookings: 1, cpa: 175, members: 0, cpm: 43.75 },
      { channel: 'Meta Retarget', spend: 0, leads: 0, cpl: 0, bookings: 0, cpa: 0, members: 0, cpm: 0 },
      { channel: 'Google Search', spend: 140, leads: 5, cpl: 28, bookings: 2, cpa: 70, members: 0, cpm: 70 },
      { channel: 'Organic', spend: 0, leads: 2, cpl: 0, bookings: 0, cpa: 0, members: 0, cpm: 0 },
      { channel: 'Referral', spend: 0, leads: 1, cpl: 0, bookings: 1, cpa: 0, members: 1, cpm: 0 },
    ],
    funnel: [
      { stage: 'Impressions', count: 8400, conversion_pct: null, vs_previous: null },
      { stage: 'Clicks', count: 134, conversion_pct: 1.6, vs_previous: null },
      { stage: 'Leads', count: 12, conversion_pct: 9.0, vs_previous: null },
      { stage: 'Contact Made', count: 9, conversion_pct: 75, vs_previous: null },
      { stage: 'Appointment', count: 4, conversion_pct: 44, vs_previous: null },
      { stage: 'Show', count: 3, conversion_pct: 75, vs_previous: null },
      { stage: 'Member', count: 1, conversion_pct: 33, vs_previous: null },
    ],
    trends: {
      cpl_weekly: [],
      spend_weekly: []
    },
    by_location: [],
    efficiency: {
      optimal_daily_spend: 45,
      current_daily_spend: 45,
      diminishing_returns_threshold: 75
    }
  };
}

// --- Middleware ---
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth pages — always public
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Blanket API auth — public exceptions listed explicitly ─────────────────
const AHRI_PUBLIC_API = [
  '/api/auth/validate',
  '/api/leads/submit',
  '/api/manus/callback',
  '/api/status',
];
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (AHRI_PUBLIC_API.includes(req.path)) return next();
  if (req.path.startsWith('/api/webhooks/')) return next();
  if (req.path.startsWith('/api/ghl/')) return next();
  requireAuth(req, res, next);
});

// Location enforcement — admins pass through; owners must own the requested location
function assertLocation(req, res) {
  if (!req.user || req.user.role === 'admin') return true;
  const loc = req.query.location || req.params.locationId || 'bloomington';
  if (!req.user.locations.includes(loc)) {
    res.status(403).json({ error: 'Location access denied' });
    return false;
  }
  return true;
}

// Token validation endpoint — AHRI asks OPS Dashboard to validate, but can also self-validate
app.get('/api/auth/validate', (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ valid: false });
  try {
    const jwt = require('jsonwebtoken');
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const { passwordHash, resetToken, resetTokenExpiry, ...safe } = user;
    res.json({ valid: true, user: safe });
  } catch {
    res.status(401).json({ valid: false });
  }
});

app.get('/api/status', (req, res) => {
  const locationId = req.query.location || 'bloomington';
  const loc = locationConfig.getLocation(locationId) || locationConfig.getLocation('bloomington');
  res.json({
    version: '1.0',
    portal: 'AHRI Marketing Command Center',
    timestamp: new Date().toISOString(),
    gym_name: loc.gymName || 'GymSuite AI',
    location_id: loc.id,
    ops_url: process.env.OPS_URL || 'https://gymsuiteai-dashboard-production.up.railway.app',
  });
});

app.get('/api/overview', (req, res) => {
  const locationId = req.query.location || 'bloomington';
  if (!assertLocation(req, res)) return;
  // Morning brief
  let morningBrief = { date: null, content: 'No brief yet.', filename: null };
  const briefFiles = safeReadDir(BRIEFS).filter(f => f.endsWith('.md')).sort().reverse();
  if (briefFiles.length > 0) {
    const bf = briefFiles[0];
    morningBrief = { date: bf.slice(0, 10), content: safeRead(path.join(BRIEFS, bf)) || '', filename: bf };
  }

  // Queue
  const queueFiles = safeReadDir(QUEUE).filter(f => f.endsWith('.md'));
  const budgetFlagged = queueFiles.filter(f => {
    const c = safeRead(path.join(QUEUE, f)) || '';
    return c.includes('[BUDGET REQUIRED]') || c.includes('budget_required: true');
  }).length;
  const oldestMs = queueFiles.reduce((acc, f) => {
    try { const s = fs.statSync(path.join(QUEUE, f)); return Math.min(acc, s.mtimeMs); } catch { return acc; }
  }, Date.now());
  const oldestDays = Math.floor((Date.now() - oldestMs) / 86400000);

  // Paid
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const googlePerf = safeReadJSON(path.join(INTEL, 'paid', 'google-performance.json'));
  const pacingLog = safeReadJSON(path.join(INTEL, 'paid', 'pacing-log.json'));
  const hasRealPaid = metaPerf.total_spend || metaPerf.blended_cpl;
  const placeholder = !hasRealPaid;
  const blendedCpl = hasRealPaid
    ? (metaPerf.blended_cpl || googlePerf.avg_cpl || 34)
    : 34;
  const metaCpl = metaPerf.avg_cpl || (placeholder ? 38 : null);
  const googleCpl = googlePerf.avg_cpl || (placeholder ? 29 : null);

  // Retention
  const retention = safeReadJSON(path.join(INTEL, 'retention', 'dropout-alerts.json'));
  const criticalCount = (retention.critical_members || []).length;
  const atRiskCount = (retention.at_risk_members || []).length + (retention.high_risk_members || []).length;

  // Nurture
  const nurturePerf = safeReadJSON(path.join(INTEL, 'nurture', 'sequence-performance.json'));
  const nurtureHealth = nurturePerf.overall_sequence_health || 'no data';
  const weakLinks = (nurturePerf.weak_links || []).length;

  // Alerts
  const alerts = buildAlerts(retention, metaPerf, nurturePerf, safeReadJSON(path.join(INTEL, 'market', 'review-log.json')));

  res.json({
    morning_brief: morningBrief,
    alerts,
    placeholder_data: placeholder,
    paid: {
      meta_cpl: metaCpl,
      google_cpl: googleCpl,
      blended_cpl: blendedCpl,
      vs_target: blendedCpl <= 30 ? 'below' : blendedCpl <= 60 ? 'above' : 'critical',
      kill_signals: (metaPerf.kill_signals || []).length,
      scale_signals: (metaPerf.scale_signals || []).length,
      pacing: pacingLog
    },
    queue: {
      pending_count: queueFiles.length,
      budget_flagged: budgetFlagged,
      oldest_asset_days: queueFiles.length > 0 ? oldestDays : 0
    },
    retention: { critical_count: criticalCount, at_risk_count: atRiskCount },
    nurture: { health: nurtureHealth, weak_links: weakLinks }
  });
});

function buildAlerts(retention, metaPerf, nurturePerf, reviewLog) {
  const alerts = [];
  const now = new Date().toISOString();

  // Critical retention members
  (retention.critical_members || []).forEach((m, i) => {
    alerts.push({
      id: `retention-critical-${i}`,
      type: 'critical',
      category: 'retention',
      title: `${m.name || 'Member'} — ${m.days_inactive || 14}+ days inactive`,
      description: `${m.days_inactive || 14} days without check-in. Joined ${m.join_date || 'recently'}. Priority: CALL TODAY.`,
      action_label: 'View Call Script',
      action_type: 'navigate_nurture',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  // At-risk members
  (retention.at_risk_members || []).slice(0, 3).forEach((m, i) => {
    alerts.push({
      id: `retention-risk-${i}`,
      type: 'action',
      category: 'retention',
      title: `${m.name || 'Member'} — At Risk (${m.days_inactive || 7} days inactive)`,
      description: `${m.days_inactive || 7} days without check-in. Archetype: ${m.archetype || 'unknown'}.`,
      action_label: 'View Opener',
      action_type: 'navigate_nurture',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  // Kill signals
  (metaPerf.kill_signals || []).forEach((s, i) => {
    alerts.push({
      id: `kill-signal-${i}`,
      type: 'action',
      category: 'ads',
      title: `Kill Signal: ${s.ad_set || s.campaign || 'Ad Set'} — CPL $${s.cpl || '?'}`,
      description: `CPL ${((s.cpl / 30 - 1) * 100).toFixed(0)}% above target. Min spend threshold met.`,
      action_label: 'View in Decision Layer',
      action_type: 'navigate_decision',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  // Scale signals
  (metaPerf.scale_signals || []).forEach((s, i) => {
    alerts.push({
      id: `scale-signal-${i}`,
      type: 'info',
      category: 'ads',
      title: `Scale Signal: ${s.ad_set || s.campaign || 'Ad Set'} — CPL $${s.cpl || '?'}`,
      description: `3+ consecutive days at or below $30 CPL. Recommend +20% budget.`,
      action_label: 'Scale Now',
      action_type: 'navigate_decision',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  // Nurture weak links
  (nurturePerf.weak_links || []).forEach((step, i) => {
    alerts.push({
      id: `nurture-weak-${i}`,
      type: 'action',
      category: 'nurture',
      title: `Nurture Weak Link: Message ${step}`,
      description: `Reply rate has dropped 50%+ vs. previous message. Rewrite needed.`,
      action_label: 'View in Nurture',
      action_type: 'navigate_nurture',
      timestamp: now,
      can_auto_resolve: false
    });
  });
  (nurturePerf.dead_messages || []).forEach((step, i) => {
    alerts.push({
      id: `nurture-dead-${i}`,
      type: 'critical',
      category: 'nurture',
      title: `Dead Message: Message ${step} — Below 5% Reply Rate`,
      description: `Message ${step} is getting less than 5% reply rate. Rewrite or remove.`,
      action_label: 'Ask AHRI to Rewrite',
      action_type: 'ahri_rewrite_nurture',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  // Unresponded negative reviews
  const unrespondedNeg = reviewLog.unresponded_negative || [];
  unrespondedNeg.slice(0, 3).forEach((r, i) => {
    alerts.push({
      id: `review-neg-${i}`,
      type: 'action',
      category: 'reviews',
      title: `${r.rating}-Star Review — No Response (${r.platform || 'Google'})`,
      description: `"${(r.review_preview || '').slice(0, 80)}..."`,
      action_label: 'View Draft Response',
      action_type: 'navigate_nurture',
      timestamp: now,
      can_auto_resolve: false
    });
  });

  return alerts.sort((a, b) => {
    const order = { critical: 0, action: 1, info: 2 };
    return (order[a.type] || 2) - (order[b.type] || 2);
  });
}

app.get('/api/alerts', (req, res) => {
  const locationId = req.query.location || 'bloomington';
  if (!assertLocation(req, res)) return;
  const retention = safeReadJSON(path.join(INTEL, 'retention', 'dropout-alerts.json'));
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const nurturePerf = safeReadJSON(path.join(INTEL, 'nurture', 'sequence-performance.json'));
  const reviewLog = safeReadJSON(path.join(INTEL, 'market', 'review-log.json'));
  const coachAlerts = parseCsvRows(safeRead(path.join(LOGS, 'coaching-alerts.csv')));
  const alerts = buildAlerts(retention, metaPerf, nurturePerf, reviewLog);
  res.json({ alerts, coaching_alerts: coachAlerts });
});

app.get('/api/performance', (req, res) => {
  const locationId = req.query.location || 'bloomington';
  if (!assertLocation(req, res)) return;
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const googlePerf = safeReadJSON(path.join(INTEL, 'paid', 'google-performance.json'));
  const attrReport = safeReadJSON(path.join(INTEL, 'lead-journey', 'attribution-report.json'));

  const hasReal = metaPerf.total_spend || googlePerf.total_spend;
  if (!hasReal) {
    return res.json(getPlaceholderPerf());
  }

  const metaSpend = metaPerf.total_spend || 0;
  const googleSpend = googlePerf.total_spend || 0;
  const totalSpend = metaSpend + googleSpend;
  const totalLeads = (metaPerf.total_leads || 0) + (googlePerf.total_leads || 0);
  const blendedCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const bookingRate = 0.3;
  const cpa = blendedCpl > 0 ? blendedCpl / bookingRate : 0;
  const roas = cpa > 0 ? 2000 / cpa : 0;

  res.json({
    _is_placeholder: false,
    overview: {
      blended_cpl: Math.round(blendedCpl * 100) / 100,
      meta_cpl: metaPerf.avg_cpl || 0,
      google_cpl: googlePerf.avg_cpl || 0,
      cpa: Math.round(cpa * 100) / 100,
      cpm: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 10) / 10,
      payback_months: Math.round((67 / (cpa || 1)) * 10) / 10
    },
    by_channel: metaPerf.campaigns || [],
    funnel: attrReport.funnel || [],
    trends: {
      cpl_weekly: metaPerf.weekly_cpl || [],
      spend_weekly: metaPerf.weekly_spend || []
    },
    by_location: attrReport.by_location || [],
    efficiency: {
      optimal_daily_spend: 45,
      current_daily_spend: (metaPerf.daily_budget || 25) + (googlePerf.daily_budget || 20),
      diminishing_returns_threshold: 75
    }
  });
});

app.get('/api/queue', (req, res) => {
  const locationFilter = req.query.location || null;
  if (!assertLocation(req, res)) return;
  const files = safeReadDir(QUEUE).filter(f => f.endsWith('.md'));
  let assets = files.map(filename => {
    const content = safeRead(path.join(QUEUE, filename)) || '';
    const { headers, body } = extractFrontmatter(content);
    const skillType = headers.skill || filename.split('-')[0] || 'unknown';
    const platform = headers.platform || SKILL_PLATFORM_MAP[skillType] || '';
    const captionPreview = cleanBodyText(body).slice(0, 200).trim();
    const hasBudget = /\[BUDGET/.test(content) || headers.budget_required === 'true';
    const createdTs = headers.date || headers.created_date || '';
    const daysOld = createdTs
      ? Math.max(0, Math.floor((Date.now() - new Date(createdTs).getTime()) / 86400000))
      : 0;
    const assetLocationId = headers.location_id || 'bloomington';
    return {
      filename,
      asset_id: headers.asset_id || filename.replace('.md', ''),
      location_id: assetLocationId,
      skill_type: skillType,
      variant: headers.variant || '',
      platform,
      awareness_level: headers.awareness_level || '',
      created_date: headers.date || '',
      days_in_queue: daysOld,
      has_budget_flag: hasBudget,
      caption_preview: captionPreview,
      full_content: content,
    };
  });
  if (locationFilter) {
    assets = assets.filter(a => a.location_id === locationFilter);
  }
  assets = assets.sort((a, b) => a.created_date.localeCompare(b.created_date));
  res.json({ assets, total: assets.length });
});

app.post('/api/queue/approve', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  const src = path.join(QUEUE, filename);
  const dst = path.join(READY, filename);
  try {
    fs.mkdirSync(READY, { recursive: true });
    let content = safeRead(src) || '';
    content = content.replace(/^status:\s*pending-review/m, 'status: ready-to-post');
    content = `approved_date: ${new Date().toISOString()}\n` + content;
    fs.writeFileSync(dst, content);
    fs.unlinkSync(src);
    logToSession('portal_approve', `Approved: ${filename}`);
    res.json({ success: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/queue/reject', (req, res) => {
  const { filename, note } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  const src = path.join(QUEUE, filename);
  const dst = path.join(QUEUE, 'REVISE-' + filename);
  try {
    let content = safeRead(src) || '';
    content = `rejection_note: ${(note || 'Needs revision').replace(/\n/g, ' ')}\n` + content;
    fs.writeFileSync(dst, content);
    fs.unlinkSync(src);
    logToSession('portal_reject', `Rejected: ${filename} — ${note || ''}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/content-calendar', (req, res) => {
  const readyFiles = safeReadDir(READY).filter(f => f.endsWith('.md'));
  const postedFiles = safeReadDir(POSTED).filter(f => f.endsWith('.md'));

  const parseCalendarItem = (dir, filename) => {
    const content = safeRead(path.join(dir, filename)) || '';
    const headers = parseMdHeaders(content);
    const lines = content.split('\n');
    const captionStart = lines.findIndex(l => l.trim().startsWith('"') || (l.trim().length > 30 && !l.match(/^[a-z_]+:/i)));
    const captionPreview = captionStart >= 0 ? lines[captionStart].slice(0, 120) : '';
    return {
      filename,
      platform: headers.platform || '',
      format: headers.format || '',
      posting_date: headers.posting_date || headers.date || '',
      posting_time: headers.posting_time || '',
      caption_preview: captionPreview,
      status: headers.status || 'ready-to-post',
      asset_id: headers.asset_id || filename.replace('.md', '')
    };
  };

  const scheduled = readyFiles.map(f => parseCalendarItem(READY, f));
  const posted = postedFiles.map(f => {
    const item = parseCalendarItem(POSTED, f);
    item.posted_date = item.posting_date;
    return item;
  });

  res.json({ scheduled, posted });
});

app.get('/api/morning-brief', (req, res) => {
  const files = safeReadDir(BRIEFS).filter(f => f.endsWith('.md')).sort().reverse();
  if (files.length === 0) {
    return res.json({
      date: null,
      filename: null,
      content: null,
      placeholder: true
    });
  }
  const filename = files[0];
  const content = safeRead(path.join(BRIEFS, filename));
  res.json({ date: filename.slice(0, 10), filename, content, placeholder: false });
});

app.get('/api/manus-tasks', (req, res) => {
  const discovered = safeReadDir(MANUS_TASKS_PATH).filter(f => f.endsWith('.md'));
  const files = discovered.length > 0 ? discovered : KNOWN_TASK_FILES;
  const sessionLog = parseCsvRows(safeRead(SESSION_LOG));

  const tasks = files.map(filename => {
    const content = safeRead(path.join(MANUS_TASKS_PATH, filename)) || '';
    const triggerMatch = content.match(/\*\*Trigger:\*\*\s*(.+)/);
    const timeMatch = content.match(/\*\*Estimated time:\*\*\s*(.+)/);
    const outputMatch = content.match(/\*\*Output:\*\*\s*(.+)/);
    const nameMatch = content.match(/^#\s+Manus Task[^—\n]*[—-]\s*(.+)/m);
    const taskName = nameMatch ? nameMatch[1].trim() : filename.replace('.md', '').replace(/-/g, ' ');

    const lastRun = sessionLog
      .filter(r => r.notes && r.notes.includes(filename.replace('.md', '')))
      .sort((a, b) => b.timestamp > a.timestamp ? 1 : -1)[0];

    return {
      filename,
      task_name: taskName,
      trigger_schedule: triggerMatch ? triggerMatch[1].trim() : '',
      estimated_time: timeMatch ? timeMatch[1].trim() : '',
      output_location: outputMatch ? outputMatch[1].trim() : '',
      last_run: lastRun ? lastRun.timestamp : 'never',
      last_status: lastRun ? 'complete' : 'never'
    };
  });

  res.json({ tasks });
});

app.get('/api/manus-tasks/:filename', (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith('.md') || filename.includes('..')) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  const content = safeRead(path.join(MANUS_TASKS_PATH, filename));
  if (!content) return res.status(404).json({ error: 'task not found' });
  res.json({ filename, content });
});

const HOOK_TOKENS = ['{{GYM_NAME}}', '{{GYM_CITY}}', '{{GYM_STATE}}', '{{GYM_ADDRESS}}', '{{GYM_PHONE}}', '{{OFFER_NAME}}', '{{OFFER_PRICE}}', '{{OFFER_DURATION}}', '{{OFFER_DESCRIPTION}}', '{{MANAGER_NAME}}'];

function renderHook(hookText, locationId = 'bloomington') {
  const loc = locationConfig.getLocation(locationId) || locationConfig.getLocation('bloomington');
  return hookText
    .replace(/\{\{GYM_NAME\}\}/g, loc.gymName || '')
    .replace(/\{\{GYM_CITY\}\}/g, loc.city || '')
    .replace(/\{\{GYM_STATE\}\}/g, loc.state || '')
    .replace(/\{\{GYM_ADDRESS\}\}/g, loc.address || '')
    .replace(/\{\{GYM_PHONE\}\}/g, loc.phone || '')
    .replace(/\{\{OFFER_NAME\}\}/g, loc.offer?.name || '')
    .replace(/\{\{OFFER_PRICE\}\}/g, loc.offer?.price || '')
    .replace(/\{\{OFFER_DURATION\}\}/g, loc.offer?.duration || '')
    .replace(/\{\{OFFER_DESCRIPTION\}\}/g, loc.offer?.description || '')
    .replace(/\{\{MANAGER_NAME\}\}/g, loc.managerName || '');
}

app.get('/api/hooks-library', async (req, res) => {
  const locationId = req.query.location || 'bloomington';
  const hooksRaw = safeReadJSON(path.join(ROOT, 'intelligence-db', 'assets', 'hooks.json'));
  let hooks = Array.isArray(hooksRaw) ? hooksRaw : (hooksRaw.hooks || []);

  if (hooks.length === 0) {
    // Fallback: parse hook-writer .md files from queue directories
    const dirs = [READY, QUEUE];
    for (const dir of dirs) {
      const files = safeReadDir(dir).filter(f => f.startsWith('hook-writer') && f.endsWith('.md'));
      for (const filename of files) {
        const content = safeRead(path.join(dir, filename)) || '';
        const { headers } = extractFrontmatter(content);
        const parsed = parseHooksFromContent(
          content,
          headers.asset_id || filename.replace('.md', ''),
          headers.variant || '',
          headers.status || (dir === READY ? 'ready-to-post' : 'pending-review')
        );
        hooks = hooks.concat(parsed);
      }
    }
    // Deduplicate by hook_text
    const seen = new Set();
    hooks = hooks.filter(h => {
      if (seen.has(h.hook_text)) return false;
      seen.add(h.hook_text);
      return true;
    });
  }

  // Perf overlay from Manus-written R2 data
  const metaPerf = await r2Get('bloomington', 'intelligence-db/paid/meta-performance.json') || {};
  const perfMap = {};
  (metaPerf.hooks || []).forEach(h => { if (h.hook_text) perfMap[h.hook_text.slice(0, 40)] = h; });

  const enriched = hooks.map(hook => {
    const perfKey = Object.keys(perfMap).find(k => (hook.hook_text || '').startsWith(k));
    const perf = perfKey ? perfMap[perfKey] : {};
    const renderedText = hook.hook_text ? renderHook(hook.hook_text, locationId) : hook.hook_text;
    return {
      ...hook,
      hook_text: renderedText,
      cpl: hook.cpl ?? perf.cpl ?? null,
      ctr: hook.ctr ?? perf.ctr ?? null,
      thumbstop_rate: hook.thumbstop_rate ?? perf.thumbstop ?? null,
      status: hook.status || (perf.cpl ? (perf.cpl <= 30 ? 'winner' : 'testing') : 'pending'),
    };
  });

  res.json({ hooks: enriched, total: enriched.length, has_performance_data: enriched.some(h => h.cpl) });
});

app.get('/api/nurture', (req, res) => {
  const locationId = req.query.location || 'bloomington'; // future: scope intel files per location
  const seqPerf = safeReadJSON(path.join(INTEL, 'nurture', 'sequence-performance.json'));
  const retention = safeReadJSON(path.join(INTEL, 'retention', 'dropout-alerts.json'));
  res.json({
    sequence: seqPerf.messages || [],
    weak_links: seqPerf.weak_links || [],
    dead_messages: seqPerf.dead_messages || [],
    booking_trigger_message: seqPerf.booking_trigger_message || null,
    overall_health: seqPerf.overall_sequence_health || 'no data',
    recommendation: seqPerf.recommendation_for_ahri || '',
    at_risk_members: retention.at_risk_members || [],
    high_risk_members: retention.high_risk_members || [],
    critical_members: retention.critical_members || [],
    retention_rate_30d: retention.retention_rate_30d || null,
    new_members_30d: retention.new_members_30d || 0
  });
});

app.get('/api/ab-tests', (req, res) => {
  const locationId = req.query.location || 'bloomington'; // future: scope intel files per location
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const tests = (metaPerf.ab_tests || []).map(t => ({
    test_name: t.test_name || t.name || 'Unnamed Test',
    variant_a: t.variant_a || {},
    variant_b: t.variant_b || {},
    winner: t.winner || null,
    threshold_met: t.threshold_met || false,
    action_available: !t.winner && t.threshold_met
  }));
  res.json({ tests });
});

app.get('/api/campaign-archive', (req, res) => {
  const locationId = req.query.location || 'bloomington'; // future: scope outputs per location
  const summariesDir = path.join(OUTPUTS, 'anytime-fitness', 'monthly-reports');
  const files = safeReadDir(summariesDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
  const campaigns = files.map(filename => {
    const content = safeRead(path.join(summariesDir, filename)) || '';
    const monthMatch = filename.match(/(\d{4}-\d{2})/);
    return {
      filename,
      month: monthMatch ? monthMatch[1] : filename.replace(/\.\w+$/, ''),
      content_preview: content.slice(0, 300)
    };
  }).sort((a, b) => b.month.localeCompare(a.month));
  res.json({ campaigns });
});

app.get('/api/agentic-rules', (req, res) => {
  const rules = safeReadJSON(RULES_FILE);
  res.json(rules);
});

app.post('/api/agentic-rules', (req, res) => {
  try {
    const rules = req.body;
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ahri', async (req, res) => {
  const { message, context, location } = req.body;
  const locationId = location || req.query.location || 'bloomington';
  if (!message) return res.status(400).json({ error: 'message required' });

  const apiKey = locationConfig.getLocation(locationId)?.keys?.anthropicApiKey
    || locationConfig.getLocation('bloomington').keys?.anthropicApiKey;
  if (!apiKey) {
    return res.json({
      response: `AHRI here. I received your message: "${message}". To enable AI responses, add ANTHROPIC_API_KEY_BLOOMINGTON to your Railway environment variables. In the meantime, check your approval queue and decision layer for the most urgent actions.`
    });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const overviewData = await new Promise(resolve => {
      const retention = safeReadJSON(path.join(INTEL, 'retention', 'dropout-alerts.json'));
      const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
      const queueFiles = safeReadDir(QUEUE).filter(f => f.endsWith('.md'));
      resolve({
        pending_queue: queueFiles.length,
        critical_members: (retention.critical_members || []).length,
        kill_signals: (metaPerf.kill_signals || []).length,
        scale_signals: (metaPerf.scale_signals || []).length,
        blended_cpl: metaPerf.blended_cpl || 'no data'
      });
    });

    const systemPrompt = `You are AHRI, the marketing intelligence agent for GymSuite AI — a gym chain marketing OS. You have access to real marketing performance data. Be concise, specific, and always recommend a concrete next action. Reference actual numbers from the context provided.

Current data:
- Pending queue: ${overviewData.pending_queue} assets
- Critical retention alerts: ${overviewData.critical_members} members
- Kill signals: ${overviewData.kill_signals}
- Scale signals: ${overviewData.scale_signals}
- Blended CPL: ${overviewData.blended_cpl}

Target CPL: $30. Member LTV: $2,000. Kill zone: CPL > $60.
Additional context: ${context || 'none'}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    res.json({ response: text });
  } catch (err) {
    res.status(500).json({ error: err.message, response: 'AHRI is temporarily unavailable. Check your API key and try again.' });
  }
});

app.get('/api/competitor-intel', (req, res) => {
  const locationId = req.query.location || 'bloomington'; // future: scope intel files per location
  const competitorAds = safeReadJSON(path.join(INTEL, 'market', 'competitor-ads.json'));
  const reviewLog = safeReadJSON(path.join(INTEL, 'market', 'review-log.json'));
  const offers = safeReadJSON(path.join(INTEL, 'market', 'competitor-offers.json'));
  res.json({ competitor_ads: competitorAds, review_log: reviewLog, competitor_offers: offers });
});

// POST /api/manus/trigger — launch a Manus task via API
app.post('/api/manus/trigger', async (req, res) => {
  const filename = req.body.task_filename || req.body.filename;
  const { task_id_override } = req.body;
  if (!filename || !filename.endsWith('.md')) {
    return res.status(400).json({ success: false, error: 'filename (.md) required' });
  }

  const taskContent = MANUS_TASKS_PATH ? safeRead(path.join(MANUS_TASKS_PATH, filename)) : null;
  const fileFound = !!(taskContent && taskContent.length > 0);
  const apiKeySet = !!MANUS_API_KEY;

  console.log(`[Manus Trigger] task: ${filename}`);
  console.log(`[Manus Trigger] file found: ${fileFound ? 'yes' : 'no'}`);
  console.log(`[Manus Trigger] API key set: ${apiKeySet ? 'yes' : 'no'}`);

  if (!taskContent || taskContent.trim() === '') {
    return res.status(404).json({ success: false, error: 'Task file not found or empty', fallback: false });
  }
  const task_type = getTaskType(filename);

  if (!MANUS_API_KEY) {
    const fallbackId = task_id_override || `local-${Date.now()}`;
    saveTaskRun(fallbackId, { task_type, task_filename: filename, started_at: new Date().toISOString(), status: 'fallback' });
    return res.status(503).json({
      success: false,
      error: 'MANUS_API_KEY not configured',
      fallback: true,
      task_id: fallbackId,
      task_type,
      task_content: taskContent
    });
  }

  try {
    const webhookUrl = process.env.PORTAL_WEBHOOK_URL
      ? `${process.env.PORTAL_WEBHOOK_URL}/api/manus/callback`
      : null;

    const body = {
      message: {
        content: [
          { type: 'text', text: taskContent }
        ]
      },
      metadata: { source: 'ahri-marketing-portal', filename, task_type },
      ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    };

    const response = await fetch(`${MANUS_API_BASE}/task.create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': MANUS_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Manus API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const task_id = data.task_id || data.id || `manus-${Date.now()}`;

    saveTaskRun(task_id, {
      task_type,
      task_filename: filename,
      location_id: req.body.location_id || 'bloomington',
      started_at: new Date().toISOString(),
      status: 'running',
      task_url: data.task_url || null,
    });

    logToSession('manus_trigger', `Triggered: ${filename} → task_id: ${task_id}`);
    res.json({ success: true, task_id, task_type, task_url: data.task_url || null });
  } catch (err) {
    console.error('[manus/trigger]', err.message);
    res.json({
      success: false,
      fallback: true,
      task_type,
      task_content: taskContent,
      error: err.message
    });
  }
});

// GET /api/manus/status/:task_id — poll task status from Manus
app.get('/api/manus/status/:task_id', async (req, res) => {
  const { task_id } = req.params;
  const runs = await loadTaskRuns();
  const local = runs[task_id] || null;

  if (!MANUS_API_KEY) {
    return res.json({ task_id, status: local ? local.status : 'unknown', local });
  }

  try {
    const response = await fetch(`${MANUS_API_BASE}/task.detail?task_id=${encodeURIComponent(task_id)}`, {
      headers: { 'x-manus-api-key': MANUS_API_KEY },
    });
    if (!response.ok) throw new Error(`Manus API ${response.status}`);
    const data = await response.json();
    const status = data.status || 'unknown';
    updateTaskRun(task_id, { status, manus_status: data });
    res.json({ task_id, status, manus_status: data, local });
  } catch (err) {
    res.json({ task_id, status: local ? local.status : 'unknown', error: err.message, local });
  }
});

// POST /api/manus/callback — receive completed task output from Manus webhook
app.post('/api/manus/callback', (req, res) => {
  // Verify signature if secret is configured — don't error if absent (optional)
  const secret = process.env.MANUS_WEBHOOK_SECRET;
  if (secret && !verifyWebhookSignature(req, secret)) {
    console.warn('[manus/callback] signature mismatch — rejecting');
    return res.status(401).json({ ok: false, error: 'invalid signature' });
  }

  // Always respond 200 immediately — never cause Manus to retry on parse errors
  res.json({ ok: true, received: true });

  // Async processing after response sent
  setImmediate(async () => {
    try {
      const raw = req.body;

      // ── Manus native webhook format ──────────────────────────────────────
      if (raw && raw.event_type) {
        const { event_type, task_detail, progress_detail } = raw;

        if (event_type === 'task_created' || event_type === 'task_progress') {
          const msg = (progress_detail && progress_detail.message) || event_type;
          console.log(`[manus/callback] progress: ${msg}`);
          return;
        }

        if (event_type !== 'task_completed' && event_type !== 'task_stopped') {
          console.log('[manus/callback] unhandled event_type=' + event_type, JSON.stringify(raw).substring(0, 500));
          return;
        }

        // task_completed ─────────────────────────────────────────────────
        if (!task_detail || !task_detail.task_id) {
          console.error('[manus/callback] task_completed missing task_detail.task_id');
          return;
        }

        const task_id = task_detail.task_id;

        // Look up task_type from task-runs.json
        const runs = await loadTaskRuns();
        const runRecord = runs[task_id];
        const task_type = runRecord ? runRecord.task_type : null;

        if (!task_type) {
          console.error(`[manus/callback] no task_type for task_id=${task_id} — cannot route output`);
          return;
        }

        // Extract result string — try fields in priority order
        const resultRaw = task_detail.result ?? task_detail.output ?? task_detail.content ?? task_detail.message;

        if (!resultRaw) {
          console.error('[manus/callback] task_completed but no result/output/content/message in task_detail');
          updateTaskRun(task_id, { status: 'completed', completed_at: new Date().toISOString(), errors: ['no result content'] });
          return;
        }

        // Result is typically a string containing JSON — extract the block
        const resultText = typeof resultRaw === 'string' ? resultRaw : JSON.stringify(resultRaw);
        let data = null;
        const jsonBlock = findJsonBlock(resultText);
        if (jsonBlock) {
          try { data = JSON.parse(jsonBlock); } catch (e) {
            console.error('[manus/callback] failed to parse JSON from result:', e.message);
          }
        }

        if (!data) {
          console.error('[manus/callback] could not extract valid JSON from task result');
          updateTaskRun(task_id, { status: 'completed', completed_at: new Date().toISOString(), errors: ['could not parse result JSON'] });
          return;
        }

        // data.data preferred; fall back to top-level if absent
        const taskData = data.data || data;

        updateTaskRun(task_id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          errors: data.errors || [],
        });

        const outputs = TASK_OUTPUT_PATHS[task_type] || [];
        const cbLocId = (runRecord && runRecord.location_id) || 'bloomington';
        for (const output of outputs) {
          try {
            const payload = output.key ? (taskData || {})[output.key] : taskData;
            if (payload && typeof payload === 'object') {
              const r2Key = persistentPathToR2Key(output.path);
              await r2Put(cbLocId, r2Key, payload);
              console.log(`[manus/callback] task complete — wrote to R2: ${cbLocId}/${r2Key}`);
            }
          } catch (writeErr) {
            console.error(`[manus/callback] write failed for ${output.path}:`, writeErr.message);
          }
        }

        logToSession('manus_callback', `Callback: ${task_type} task_id=${task_id} status=completed`);
        return;
      }

      // ── Legacy custom-schema fallback ─────────────────────────────────────
      let parsed = null;
      if (typeof raw === 'object' && raw !== null && raw.task_type) {
        parsed = raw;
      } else {
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        try { parsed = JSON.parse(stripMarkdownFences(text)); } catch {
          const block = findJsonBlock(text);
          if (block) { try { parsed = JSON.parse(block); } catch {} }
        }
      }

      if (!parsed || !parsed.task_type || !parsed.task_id) {
        console.error('[manus/callback] could not parse valid payload — skipping write', JSON.stringify(raw).slice(0, 200));
        return;
      }

      const { task_id, task_type, status, data } = parsed;
      console.log(`[manus/callback] received task_id=${task_id} task_type=${task_type} status=${status}`);

      updateTaskRun(task_id, {
        status: status || 'completed',
        completed_at: parsed.completed_at || new Date().toISOString(),
        errors: parsed.errors || [],
      });

      const outputs = TASK_OUTPUT_PATHS[task_type] || [];
      const legacyRuns = await loadTaskRuns();
      const legacyRecord = legacyRuns[task_id];
      const legacyLocId = (legacyRecord && legacyRecord.location_id) || 'bloomington';
      for (const output of outputs) {
        try {
          const payload = output.key ? (data || {})[output.key] : data;
          if (payload && typeof payload === 'object') {
            const r2Key = persistentPathToR2Key(output.path);
            await r2Put(legacyLocId, r2Key, payload);
            console.log(`[manus/callback] wrote R2: ${legacyLocId}/${r2Key}`);
          }
        } catch (writeErr) {
          console.error(`[manus/callback] write failed for ${output.path}:`, writeErr.message);
        }
      }

      logToSession('manus_callback', `Callback: ${task_type} task_id=${task_id} status=${status}`);
    } catch (err) {
      console.error('[manus/callback] processing error:', err.message);
    }
  });
});

// GET /api/manus/recent-runs — last 20 task runs with status
app.get('/api/manus/recent-runs', async (req, res) => {
  const runs = await loadTaskRuns();
  const sorted = Object.entries(runs)
    .map(([task_id, run]) => ({ task_id, ...run }))
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
    .slice(0, 20);
  res.json({ runs: sorted, total: Object.keys(runs).length });
});

app.get('/api/debug/env', (req, res) => {
  res.json({
    manus_key_set: !!MANUS_API_KEY,
    manus_key_length: MANUS_API_KEY ? MANUS_API_KEY.length : 0,
    manus_key_preview: MANUS_API_KEY ? MANUS_API_KEY.substring(0, 8) + '...' : 'NOT SET',
    node_env: process.env.NODE_ENV,
    railway_env: process.env.RAILWAY_ENVIRONMENT_NAME,
    meta_token_set: !!META_ACCESS_TOKEN,
    meta_token_preview: META_ACCESS_TOKEN ? META_ACCESS_TOKEN.substring(0, 8) + '...' : 'NOT SET',
    meta_account_id: META_AD_ACCOUNT_ID || 'NOT SET',
    meta_page_id: META_PAGE_ID || 'NOT SET'
  });
});

app.get('/api/intelligence/:category/:file', async (req, res) => {
  const filePath = path.join(
    PERSISTENT_DATA_DIR,
    req.params.category,
    req.params.file
  );
  const content = safeReadJSON(filePath);
  if (!content || Object.keys(content).length === 0) {
    return res.status(404).json({ error: 'Intelligence file not found', path: filePath });
  }
  res.json(content);
});

app.get('/api/debug/paths', async (req, res) => {
  const checks = [
    path.join(ROOT, 'distribution', 'queue', 'pending-review'),
    path.join(ROOT, 'distribution', 'queue', 'ready-to-post'),
    path.join(ROOT, 'intelligence-db', 'assets', 'hooks.json'),
    path.join(ROOT, 'performance', 'asset-log.csv'),
    path.join(ROOT, 'intelligence-db', 'assets', 'creatives.json'),
    ROOT,
    __dirname,
    process.env.REPO_ROOT || 'NOT SET'
  ];

  const results = {};
  for (const p of checks) {
    try {
      const stat = await fs.promises.stat(p);
      results[p] = stat.isDirectory() ? 'directory exists' : 'file exists';
      if (stat.isDirectory()) {
        const files = await fs.promises.readdir(p);
        results[p] += ` (${files.length} items)`;
      }
    } catch (e) {
      results[p] = 'NOT FOUND: ' + e.message;
    }
  }

  res.json(results);
});

// GET /api/meta/test-campaign — minimal campaign creation test, no ad sets or ads
app.get('/api/meta/test-campaign', async (req, res) => {
  const locationId = req.query.location || 'bloomington';
  const locMeta = getLocationMeta(locationId);
  if (!locMeta?.accessToken || !locMeta?.adAccountId) {
    return res.json({ error: 'credentials missing' });
  }

  try {
    const result = await metaApiCall(
      `${locMeta.adAccountId}/campaigns`,
      'POST',
      {
        name: 'AHRI API Test — Delete Me',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false
      },
      3,
      locMeta.accessToken
    );
    return res.json({
      success: true,
      campaign_id: result.id
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/meta/create-campaign — create a complete campaign via Meta Marketing API
app.post('/api/meta/create-campaign', async (req, res) => {
  const {
    campaign_name,
    cold_hook,
    warm_hook,
    cold_primary_text,
    warm_primary_text,
    cold_headline,
    warm_headline,
    destination_url,
    cold_daily_budget = 1500,
    warm_daily_budget = 1000,
    image_url = null,
    location_id = 'bloomington',
  } = req.body;

  const campaignLoc = locationConfig.getLocation(location_id) || locationConfig.getLocation('bloomington');
  const locMeta = getLocationMeta(campaignLoc.id);

  if (!locMeta?.accessToken || !locMeta?.adAccountId || !locMeta?.pageId) {
    return res.status(503).json({ success: false, error: 'Meta API credentials not configured for this location' });
  }

  const results = { campaign: null, ad_set_cold: null, ad_set_warm: null, ad_cold: null, ad_warm: null, errors: [] };

  try {
    // STEP 1 — Create Campaign
    console.log('[Meta] Creating campaign...');
    const campaign = await metaApiCall(`${locMeta.adAccountId}/campaigns`, 'POST', {
      name: campaign_name || `30-Day Kickstart — ${campaignLoc.name} — ${new Date().toISOString().split('T')[0]}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    }, 3, locMeta.accessToken);
    results.campaign = { id: campaign.id, name: campaign_name };
    console.log('[Meta] Campaign created:', campaign.id);

    // STEP 2 — Create Cold Ad Set
    console.log('[Meta] Creating cold ad set...');
    const coldTargeting = {
      geo_locations: {
        cities: [{ key: campaignLoc.meta.geoKey, name: campaignLoc.city, region: campaignLoc.meta.geoRegion, country: campaignLoc.meta.geoCountry, radius: 15, distance_unit: 'mile' }]
      },
      age_min: 30,
      age_max: 55,
      publisher_platforms: ['facebook'],
      facebook_positions: ['feed'],
      targeting_automation: { advantage_audience: 0 },
    };
    const promotedObject = { page_id: locMeta.pageId };
    console.log('[Meta] promoted_object:', JSON.stringify(promotedObject));

    const coldAdSet = await metaApiCall(`${locMeta.adAccountId}/adsets`, 'POST', {
      name: `Cold — Lifestyle Member — ${campaignLoc.name} — Hook A`,
      campaign_id: campaign.id,
      daily_budget: cold_daily_budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: JSON.stringify(promotedObject),
      targeting: JSON.stringify(coldTargeting),
      status: 'PAUSED',
      start_time: new Date(Date.now() + 3600000).toISOString(),
    }, 3, locMeta.accessToken);
    results.ad_set_cold = { id: coldAdSet.id };
    console.log('[Meta] Cold ad set created:', coldAdSet.id);

    // STEP 3 — Create Warm Ad Set
    console.log('[Meta] Creating warm ad set...');
    const warmTargeting = {
      geo_locations: {
        cities: [{ key: campaignLoc.meta.geoKey, name: campaignLoc.city, region: campaignLoc.meta.geoRegion, country: campaignLoc.meta.geoCountry, radius: 15, distance_unit: 'mile' }]
      },
      age_min: 30,
      age_max: 55,
      publisher_platforms: ['facebook'],
      facebook_positions: ['feed'],
      targeting_automation: { advantage_audience: 0 },
    };
    const warmAdSet = await metaApiCall(`${locMeta.adAccountId}/adsets`, 'POST', {
      name: `Warm — Page Engagement — ${campaignLoc.name} — Hook E`,
      campaign_id: campaign.id,
      daily_budget: warm_daily_budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: JSON.stringify(promotedObject),
      targeting: JSON.stringify(warmTargeting),
      status: 'PAUSED',
      start_time: new Date(Date.now() + 3600000).toISOString(),
    }, 3, locMeta.accessToken);
    results.ad_set_warm = { id: warmAdSet.id };
    console.log('[Meta] Warm ad set created:', warmAdSet.id);

    // STEP 4 — Create Cold Creative
    console.log('[Meta] Creating cold creative...');
    const coldLink = destination_url || 'https://marketing-os-production-2b85.up.railway.app/go?utm_source=facebook&utm_medium=paid_social&utm_campaign=30-day-kickstart&utm_content=hook-parent-child&utm_term=cold-lifestyle&redirect=landing';
    const coldLinkData = {
      message: cold_primary_text || `The moment you realized you couldn't keep up with your own kids.\n\nThat feeling isn't about fitness. It's about who you want to be.\n\nAt ${campaignLoc.gymName}, your first 30 days are fully coached for $1.\n\nPrivate orientation. Weekly check-ins. A coach who texts you in week two — because that's when people stop. We know.\n\nShow up 12 times. If it's not worth it, full refund. You keep everything.\n\nThe form is below.`,
      link: coldLink,
      name: cold_headline || '30 Days Fully Coached. $1 to Start.',
      call_to_action: { type: 'LEARN_MORE', value: { link: coldLink } },
    };
    if (image_url) coldLinkData.picture = image_url;

    const coldCreative = await metaApiCall(`${locMeta.adAccountId}/adcreatives`, 'POST', {
      name: 'Hook A — Parent Child — Cold',
      object_story_spec: JSON.stringify({ page_id: locMeta.pageId, link_data: coldLinkData }),
    }, 3, locMeta.accessToken);
    console.log('[Meta] Cold creative created:', coldCreative.id);

    // STEP 5 — Create Cold Ad
    console.log('[Meta] Creating cold ad...');
    const coldAd = await metaApiCall(`${locMeta.adAccountId}/ads`, 'POST', {
      name: 'Hook A — Parent Child — Cold',
      adset_id: coldAdSet.id,
      creative: JSON.stringify({ creative_id: coldCreative.id }),
      status: 'PAUSED',
    }, 3, locMeta.accessToken);
    results.ad_cold = { id: coldAd.id };
    console.log('[Meta] Cold ad created:', coldAd.id);

    // STEP 6 — Create Warm Creative
    console.log('[Meta] Creating warm creative...');
    const warmLink = destination_url || 'https://marketing-os-production-2b85.up.railway.app/go?utm_source=facebook&utm_medium=paid_social&utm_campaign=30-day-kickstart&utm_content=hook-offer-direct&utm_term=warm-retarget&redirect=landing';
    const warmCreative = await metaApiCall(`${locMeta.adAccountId}/adcreatives`, 'POST', {
      name: 'Hook E — Offer Direct — Warm',
      object_story_spec: JSON.stringify({
        page_id: locMeta.pageId,
        link_data: {
          message: warm_primary_text || `First 30 days, fully coached. One dollar to start.\n\nPrivate orientation. Done-for-you plan. Weekly coach check-ins. Direct text access.\n\nWe built this for people who've tried gyms before and stopped. The difference isn't motivation — it's having someone who notices when you go quiet.\n\nShow up 12 times or full refund. You keep the workout plan either way.\n\nClaim your spot below.`,
          link: warmLink,
          name: warm_headline || "Built for People Who've Quit Before.",
          call_to_action: { type: 'LEARN_MORE', value: { link: warmLink } },
        },
      }),
    }, 3, locMeta.accessToken);
    console.log('[Meta] Warm creative created:', warmCreative.id);

    // STEP 7 — Create Warm Ad
    console.log('[Meta] Creating warm ad...');
    const warmAd = await metaApiCall(`${locMeta.adAccountId}/ads`, 'POST', {
      name: 'Hook E — Offer Direct — Warm',
      adset_id: warmAdSet.id,
      creative: JSON.stringify({ creative_id: warmCreative.id }),
      status: 'PAUSED',
    }, 3, locMeta.accessToken);
    results.ad_warm = { id: warmAd.id };
    console.log('[Meta] Warm ad created:', warmAd.id);

    // STEP 8 — Write to intelligence-db
    const campaignResult = {
      last_updated: new Date().toISOString(),
      campaign_id: campaign.id,
      campaign_name: campaign_name || `30-Day Kickstart — ${campaignLoc.name} — ${new Date().toISOString().split('T')[0]}`,
      status: 'PAUSED',
      ad_account: locMeta.adAccountId,
      location_id: campaignLoc.id,
      ad_sets: {
        cold: { id: coldAdSet.id, name: 'Cold — Lifestyle Member', daily_budget: cold_daily_budget / 100, hook: 'parent_child_moment' },
        warm: { id: warmAdSet.id, name: 'Warm — Page Engagement', daily_budget: warm_daily_budget / 100, hook: 'direct_offer' },
      },
      ads: { cold: { id: coldAd.id }, warm: { id: warmAd.id } },
      destination_url,
      created_at: new Date().toISOString(),
      notes: 'Created via Meta Marketing API. Status PAUSED — activate in Ads Manager when ready to spend.',
    };
    await r2Put(campaignLoc.id || 'bloomington', 'intelligence-db/paid/active-campaign.json', campaignResult);
    console.log('[Meta] Campaign data written to R2');

    const accountNum = (locMeta.adAccountId || '').replace('act_', '');
    logToSession('meta_create_campaign', `Campaign created: ${campaign.id}`);
    return res.json({
      success: true,
      campaign_id: campaign.id,
      ad_set_cold_id: coldAdSet.id,
      ad_set_warm_id: warmAdSet.id,
      ad_cold_id: coldAd.id,
      ad_warm_id: warmAd.id,
      status: 'PAUSED',
      message: 'Campaign created successfully. Status is PAUSED — go to Meta Ads Manager to review and activate when ready.',
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`,
    });

  } catch (error) {
    console.error('[Meta] Campaign creation failed:', error.message);
    results.errors.push(error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      partial_results: results,
      message: 'Campaign creation failed. Check error and retry.',
    });
  }
});

// GET /api/meta/campaign-status — status of active campaign from intelligence-db + live Meta API
app.get('/api/meta/campaign-status', async (req, res) => {
  const locationId = req.query.location || 'bloomington';
  const locMeta = getLocationMeta(locationId);
  const localData = await r2Get(locationId, 'intelligence-db/paid/active-campaign.json');

  if (!localData || !localData.campaign_id) {
    return res.json({ campaign_exists: false, message: 'No active campaign found' });
  }

  const accountNum = (locMeta?.adAccountId || '').replace('act_', '');
  if (!locMeta?.accessToken) {
    return res.json({
      campaign_exists: true,
      campaign_id: localData.campaign_id,
      campaign_name: localData.campaign_name,
      status: localData.status || 'UNKNOWN',
      created_at: localData.created_at,
      api_error: 'META_ACCESS_TOKEN not configured — live status unavailable',
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`,
    });
  }

  try {
    const liveStatus = await metaApiCall(localData.campaign_id, 'GET', { fields: 'name,status,effective_status' }, 3, locMeta.accessToken);
    return res.json({
      campaign_exists: true,
      campaign_id: localData.campaign_id,
      campaign_name: localData.campaign_name,
      status: liveStatus.status,
      effective_status: liveStatus.effective_status,
      created_at: localData.created_at,
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`,
    });
  } catch (error) {
    return res.json({
      campaign_exists: true,
      campaign_id: localData.campaign_id,
      campaign_name: localData.campaign_name,
      local_data: localData,
      api_error: error.message,
    });
  }
});

// GET /api/schedule — list all scheduled Manus tasks and their cron patterns
app.get('/api/schedule', (req, res) => {
  res.json({
    tasks: MANUS_SCHEDULE.map(t => ({
      ...t,
      timezone: 'America/Indiana/Indianapolis',
      enabled: !!MANUS_API_KEY,
    })),
    total: MANUS_SCHEDULE.length,
    enabled: !!MANUS_API_KEY,
  });
});

// GET /api/rules — show agentic rules status
app.get('/api/rules', async (req, res) => {
  const ruleLocId = req.query.location || 'bloomington';
  const rulesStatus = await Promise.all(
    AGENTIC_RULES.map(async rule => {
      const lastFired = await r2Get(ruleLocId, `intelligence-db/rules/${rule.id}.json`);
      return {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        action: rule.action,
        cooldown_hours: rule.cooldown_hours,
        last_fired: lastFired ? lastFired.fired_at : null,
        status: lastFired ? 'fired' : 'watching',
      };
    })
  );
  res.json({ rules: rulesStatus });
});

// ── Attribution System ───────────────────────────────────────────────────────

async function fireCAPIEvent({ eventName, fbclid, email, phone, leadType, campaign, content, value, currency, clickedAt, locationId = 'bloomington' }) {
  const locMeta = getLocationMeta(locationId);
  const accessToken = locMeta?.accessToken || META_ACCESS_TOKEN;
  const pixelId = locMeta?.pixelId || META_PIXEL_ID;
  if (!accessToken || !pixelId) {
    console.warn('[CAPI] Credentials not set — skipping');
    return;
  }
  const capiEndpoint = `${META_API_BASE}/${pixelId}/events`;
  const hashValue = (val) => val
    ? crypto.createHash('sha256').update(val.toLowerCase().trim()).digest('hex')
    : undefined;
  const eventTime = Math.floor(new Date(clickedAt).getTime() / 1000);
  const payload = {
    data: [{
      event_name: eventName,
      event_time: eventTime,
      action_source: 'website',
      user_data: {
        ...(email && { em: [hashValue(email)] }),
        ...(phone && { ph: [hashValue(phone.replace(/\D/g, ''))] }),
        ...(fbclid && { fbc: `fb.1.${eventTime}.${fbclid}` }),
      },
      custom_data: {
        ...(leadType && { lead_type: leadType }),
        ...(campaign && { campaign }),
        ...(content && { hook: content }),
        ...(value && { value }),
        ...(currency && { currency }),
      },
    }],
    access_token: accessToken,
  };
  try {
    const response = await fetch(capiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (result.events_received > 0) {
      console.log(`[CAPI] ${eventName} fired: fbclid: ${fbclid}, events_received: ${result.events_received}`);
    } else {
      console.error('[CAPI] Event not received:', JSON.stringify(result));
    }
  } catch (error) {
    console.error('[CAPI] Failed to fire event:', error.message);
  }
}

async function updateAttributionReport({ matched, session, email, phone, ghlContactId, leadType, receivedAt, matchMethod, name, locationId = 'bloomington' }) {
  const report = await r2Get(locationId, 'attribution/attribution-report.json') || {
    version: '1.0', leads: [], total_sessions: 0, total_matched: 0, total_unmatched: 0,
  };
  const entry = {
    ghl_contact_id: ghlContactId,
    name: name || null,
    email_hashed: email ? crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex') : null,
    phone_hashed: phone ? crypto.createHash('sha256').update(phone.replace(/\D/g, '')).digest('hex') : null,
    received_at: receivedAt,
    lead_type: leadType,
    matched,
    attribution_method: matchMethod || null,
    attribution_confidence: matched ? (session && session.attribution_confidence) : null,
    original_source: (session && session.utm_source) || null,
    campaign: (session && session.utm_campaign) || null,
    hook: (session && session.utm_content) || null,
    creative: (session && session.utm_term) || null,
    first_click: (session && session.clicked_at) || null,
    days_to_convert: (session && session.clicked_at)
      ? Math.floor((new Date(receivedAt) - new Date(session.clicked_at)) / (1000 * 60 * 60 * 24))
      : null,
    fbclid: (session && session.fbclid) || null,
    became_member: false,
    member_date: null,
    ltv: null,
  };
  const existingIndex = report.leads.findIndex(l => l.ghl_contact_id === ghlContactId);
  if (existingIndex >= 0) {
    report.leads[existingIndex] = { ...report.leads[existingIndex], ...entry };
  } else {
    report.leads.push(entry);
  }
  report.total_sessions = report.leads.length;
  report.total_matched = report.leads.filter(l => l.matched).length;
  report.total_unmatched = report.leads.filter(l => !l.matched).length;
  report.match_rate_pct = report.total_sessions > 0
    ? Math.round((report.total_matched / report.total_sessions) * 100) : 0;
  report.last_updated = new Date().toISOString();
  await r2Put(locationId, 'attribution/attribution-report.json', report);
  console.log(`[Attribution] Report updated: ${report.total_matched}/${report.total_sessions} matched (${report.match_rate_pct}%)`);
}

async function matchContactToSession({ email, phone, name, ghlContactId, leadType, receivedAt, sessionId, locationId = 'bloomington' }) {
  console.log('[Attribution] Running match for:', email, phone);
  let bestMatch = null;
  let matchMethod = null;

  if (sessionId) {
    const directSession = await r2Get(locationId, `attribution/sessions/${sessionId}.json`);
    if (directSession && directSession.status === 'pending') {
      bestMatch = directSession;
      matchMethod = 'session_id_match';
    }
  }

  if (!bestMatch) {
    const allKeys = await r2List(locationId, 'attribution/sessions/');
    const pendingKeys = allKeys
      .filter(k => !path.basename(k).startsWith('fbclid_') && k.endsWith('.json'))
      .sort().reverse();

    if (pendingKeys.length === 0) {
      console.log('[Attribution] No sessions yet');
      await updateAttributionReport({ matched: false, email, phone, ghlContactId, leadType, receivedAt, locationId });
      return;
    }

    for (const key of pendingKeys) {
      const session = await r2Get(locationId, key.replace(`${locationId}/`, ''));
      if (!session || session.status !== 'pending') continue;
      if (email && session.ghl_email === email) { bestMatch = session; matchMethod = 'email_match'; break; }
      if (phone && session.ghl_phone === phone) { bestMatch = session; matchMethod = 'phone_match'; break; }
    }

    if (!bestMatch) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (const key of pendingKeys) {
        const session = await r2Get(locationId, key.replace(`${locationId}/`, ''));
        if (!session) continue;
        const clickedAt = new Date(session.clicked_at);
        if (clickedAt > thirtyDaysAgo && session.status === 'pending' && session.fbclid) {
          bestMatch = session;
          matchMethod = 'fbclid_unconfirmed';
        }
      }
    }
  }

  if (!bestMatch) {
    console.log('[Attribution] No match found for:', email);
    await updateAttributionReport({ matched: false, email, phone, ghlContactId, leadType, receivedAt, locationId });
    return;
  }

  bestMatch.status = 'matched';
  bestMatch.matched_at = new Date().toISOString();
  bestMatch.ghl_contact_id = ghlContactId;
  bestMatch.ghl_lead_type = leadType;
  bestMatch.ghl_email = email;
  bestMatch.ghl_phone = phone;
  bestMatch.attribution_method = matchMethod;
  bestMatch.attribution_confidence =
    matchMethod === 'fbclid_unconfirmed' ? 'low' :
    (matchMethod === 'email_match' || matchMethod === 'phone_match') ? 'high' : 'medium';

  const sessionLocId = bestMatch.location_id || locationId;
  await r2Put(sessionLocId, `attribution/sessions/${bestMatch.session_id}.json`, bestMatch);
  console.log(`[Attribution] Match found: ${matchMethod} | Session: ${bestMatch.session_id} | fbclid: ${bestMatch.fbclid}`);

  if (bestMatch.fbclid) {
    await fireCAPIEvent({
      eventName: 'Lead', fbclid: bestMatch.fbclid, email, phone, leadType,
      campaign: bestMatch.utm_campaign, content: bestMatch.utm_content, clickedAt: bestMatch.clicked_at,
      locationId: bestMatch.location_id || 'bloomington',
    });
  }

  await updateAttributionReport({ matched: true, session: bestMatch, email, phone, ghlContactId, leadType, receivedAt, matchMethod, name, locationId: sessionLocId });
}

async function confirmMemberConversion(ghlContactId, status, locationId = 'bloomington') {
  const allKeys = await r2List(locationId, 'attribution/sessions/');
  for (const key of allKeys) {
    if (path.basename(key).startsWith('fbclid_')) continue;
    const session = await r2Get(locationId, key.replace(`${locationId}/`, ''));
    if (session && session.ghl_contact_id === ghlContactId) {
      const sessionLocId = session.location_id || locationId;
      session.converted_to_member = true;
      session.member_confirmed_at = new Date().toISOString();
      session.ghl_lead_type = status;
      await r2Put(sessionLocId, `attribution/sessions/${session.session_id}.json`, session);
      console.log('[Attribution] Member conversion confirmed:', ghlContactId, `fbclid: ${session.fbclid}`);

      if (session.fbclid) {
        await fireCAPIEvent({
          eventName: 'Purchase', fbclid: session.fbclid,
          email: session.ghl_email, phone: session.ghl_phone,
          value: 2000, currency: 'USD', clickedAt: session.clicked_at,
          locationId: sessionLocId,
        });
      }

      const report = await r2Get(sessionLocId, 'attribution/attribution-report.json') || { leads: [] };
      const leadIndex = report.leads.findIndex(l => l.ghl_contact_id === ghlContactId);
      if (leadIndex >= 0) {
        report.leads[leadIndex].became_member = true;
        report.leads[leadIndex].member_date = new Date().toISOString();
        report.leads[leadIndex].ltv = 2000;
        report.last_updated = new Date().toISOString();
        await r2Put(sessionLocId, 'attribution/attribution-report.json', report);
      }
      break;
    }
  }
}

// GET /go — ghost redirect: captures fbclid + UTMs, creates session, redirects to destination <50ms
app.get('/go', async (req, res) => {
  const { fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, redirect, location: locationParam } = req.query;
  const locationId = locationParam || 'bloomington';
  const loc = locationConfig.getLocation(locationId) || locationConfig.getLocation('bloomington');
  const sessionId = crypto.randomUUID();
  const FRANCHISE_URL = loc.franchiseUrl || 'https://www.anytimefitness.com/locations/bloomington-indiana-2822/';
  const LANDING_PAGE_URL = 'https://no-risk-comeback-landing-page-production.up.railway.app';
  const destination = redirect === 'landing' ? `${LANDING_PAGE_URL}/?location=${loc.id}&session_id=${sessionId}` : FRANCHISE_URL;

  const session = {
    session_id: sessionId,
    location_id: loc.id,
    fbclid: fbclid || null,
    utm_source: utm_source || null,
    utm_medium: utm_medium || null,
    utm_campaign: utm_campaign || null,
    utm_content: utm_content || null,
    utm_term: utm_term || null,
    clicked_at: new Date().toISOString(),
    redirect_to: destination,
    redirect_type: redirect || 'franchise',
    ip_address: req.ip || null,
    user_agent: req.headers['user-agent'] || null,
    status: 'pending',
    matched_at: null,
    ghl_contact_id: null,
    ghl_lead_type: null,
    ghl_email: null,
    ghl_phone: null,
    capi_fired: false,
    capi_fired_at: null,
    converted_to_member: false,
    member_confirmed_at: null,
    estimated_ltv: 2000,
  };

  try {
    await r2Put(loc.id, `attribution/sessions/${sessionId}.json`, session);
    if (fbclid) {
      await r2Put(loc.id, `attribution/sessions/fbclid_${fbclid}.json`, {
        session_id: sessionId, fbclid, clicked_at: session.clicked_at,
      });
    }
    console.log(`[Attribution] Session created: ${sessionId}`, fbclid ? `fbclid: ${fbclid}` : 'no fbclid');
  } catch (error) {
    console.error('[Attribution] Failed to write session:', error.message);
  }

  return res.redirect(301, destination);
});

// GET /api/attribution/session/:sessionId — look up a session by ID
app.get('/api/attribution/session/:sessionId', async (req, res) => {
  const locationId = req.query.location || 'bloomington';
  const session = await r2Get(locationId, `attribution/sessions/${req.params.sessionId}.json`);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  return res.json(session);
});

// POST /api/leads/submit — landing page submits here; locationId in body; forwards to GHL server-side
app.post('/api/leads/submit', async (req, res) => {
  const { locationId, sessionId, firstName, phone, archetype, archetype_answer,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_string } = req.body;

  const resolvedLocationId = locationId || 'bloomington';
  const loc = locationConfig.getLocation(resolvedLocationId);
  if (!loc) return res.status(400).json({ success: false, error: 'Unknown location' });

  if (!firstName || !phone) return res.status(400).json({ success: false, error: 'firstName and phone required' });

  const apiKey = loc.ghl.apiKey;
  const ghlLocationId = loc.ghl.locationId;
  if (!apiKey || !ghlLocationId) {
    return res.status(503).json({ success: false, error: 'GHL credentials not configured for this location' });
  }

  const ARCHETYPE_MAP = { social: 'Social', analytical: 'Analytical', supportive: 'Supportive', independent: 'Independent' };
  const rawArchetype = archetype_answer || archetype || '';
  const mappedArchetype = ARCHETYPE_MAP[rawArchetype] || rawArchetype;

  const tags = ['no-risk-comeback', 'landing-page'];
  if (mappedArchetype) tags.push(`archetype-${mappedArchetype.toLowerCase()}`);

  const ghlPayload = {
    firstName,
    phone,
    tags,
    source: utm_source || 'landing-page',
  };

  try {
    const ghlRes = await fetch('https://rest.gohighlevel.com/v1/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ghlPayload),
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text();
      console.error(`[LeadSubmit] GHL error ${ghlRes.status}:`, errText);
      return res.status(502).json({ success: false, error: 'GHL contact creation failed', ghl_status: ghlRes.status, ghl_error: errText });
    }

    const ghlData = await ghlRes.json();
    const contactId = ghlData.contact?.id || ghlData.id || null;

    if (contactId) {
      setImmediate(() => {
        matchContactToSession({
          phone,
          ghlContactId: contactId,
          leadType: 'landing-page',
          receivedAt: new Date().toISOString(),
          sessionId: sessionId || null,
          locationId: resolvedLocationId,
        }).catch(err => console.error('[LeadSubmit] attribution match failed:', err.message));
      });
    }

    console.log(`[LeadSubmit] ${resolvedLocationId} | contact: ${contactId} | ${firstName} | archetype: ${mappedArchetype} | ${utm_source || 'direct'}`);
    return res.json({ success: true, contact_id: contactId });
  } catch (err) {
    console.error('[LeadSubmit] error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/webhooks/ghl/:locationId/contact-created — per-location GHL webhook
app.post('/api/webhooks/ghl/:locationId/contact-created', async (req, res) => {
  const { locationId } = req.params;
  res.json({ received: true });
  setImmediate(async () => {
    try {
      const contact = req.body;
      const email = contact.email || contact.contactEmail || null;
      const phone = contact.phone || contact.contactPhone || null;
      const name = contact.name || contact.contactName || null;
      const ghlContactId = contact.id || contact.contactId || null;
      const leadType = (contact.tags && contact.tags[0]) || contact.source || 'unknown';
      console.log(`[GHL/${locationId}] New contact:`, email, phone, leadType);
      await matchContactToSession({ email, phone, name, ghlContactId, leadType, receivedAt: new Date().toISOString(), locationId });
    } catch (error) {
      console.error(`[GHL/${locationId}] Contact processing failed:`, error.message);
    }
  });
});

// POST /api/webhooks/ghl/:locationId/contact-updated — per-location GHL webhook
app.post('/api/webhooks/ghl/:locationId/contact-updated', async (req, res) => {
  const { locationId } = req.params;
  res.json({ received: true });
  setImmediate(async () => {
    try {
      const contact = req.body;
      const ghlContactId = contact.id || contact.contactId;
      const newStatus = (contact.tags && contact.tags[0]) || contact.source;
      if (newStatus === 'joined' || newStatus === 'member') {
        await confirmMemberConversion(ghlContactId, newStatus);
      }
    } catch (error) {
      console.error(`[GHL/${locationId}] Contact update failed:`, error.message);
    }
  });
});

// POST /api/ghl/contact-created — GHL webhook fires when a new contact is created
app.post('/api/ghl/contact-created', async (req, res) => {
  res.json({ received: true });
  setImmediate(async () => {
    try {
      const contact = req.body;
      const email = contact.email || contact.contactEmail || null;
      const phone = contact.phone || contact.contactPhone || null;
      const name = contact.name || contact.contactName || null;
      const ghlContactId = contact.id || contact.contactId || null;
      const leadType = (contact.tags && contact.tags[0]) || contact.source || 'unknown';
      console.log('[GHL] New contact received:', email, phone, leadType);
      await matchContactToSession({ email, phone, name, ghlContactId, leadType, receivedAt: new Date().toISOString() });
    } catch (error) {
      console.error('[GHL] Contact processing failed:', error.message);
    }
  });
});

// POST /api/ghl/contact-updated — GHL webhook fires when contact status changes
app.post('/api/ghl/contact-updated', async (req, res) => {
  res.json({ received: true });
  setImmediate(async () => {
    try {
      const contact = req.body;
      const ghlContactId = contact.id || contact.contactId;
      const newStatus = (contact.tags && contact.tags[0]) || contact.source;
      if (newStatus === 'joined' || newStatus === 'member') {
        await confirmMemberConversion(ghlContactId, newStatus);
      }
    } catch (error) {
      console.error('[GHL] Contact update failed:', error.message);
    }
  });
});

// GET /api/attribution/report — full attribution report with summary stats
// Counts are computed dynamically from session files in R2 so the
// total is accurate even before any GHL webhooks have fired.
app.get('/api/attribution/report', async (req, res) => {
  const locationId = req.query.location || 'bloomington';

  // --- Dynamic session counts from R2 ---
  const allKeys = await r2List(locationId, 'attribution/sessions/');
  const sessionOnlyKeys = allKeys.filter(k => !path.basename(k).startsWith('fbclid_') && k.endsWith('.json'));

  const sessions = (await Promise.all(
    sessionOnlyKeys.map(k => r2Get(locationId, k.replace(`${locationId}/`, '')))
  )).filter(Boolean);

  const totalSessions = sessions.length;
  const totalMatched  = sessions.filter(s => s.status === 'matched').length;
  const totalPending  = sessions.filter(s => s.status === 'pending').length;
  const matchRatePct  = totalSessions > 0 ? Math.round((totalMatched / totalSessions) * 100) : 0;

  // --- Leads detail from attribution-report.json (populated by GHL webhooks) ---
  const report = await r2Get(locationId, 'attribution/attribution-report.json') || { leads: [] };
  const leads = report.leads || [];

  const bySource = {};
  const byHook = {};
  const byLeadType = {};
  leads.forEach(lead => {
    const source = lead.original_source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
    const hook = lead.hook || 'unknown';
    byHook[hook] = (byHook[hook] || 0) + 1;
    const type = lead.lead_type || 'unknown';
    byLeadType[type] = (byLeadType[type] || 0) + 1;
  });
  const daysArr = leads.filter(l => l.days_to_convert !== null).map(l => l.days_to_convert);
  const avgDays = daysArr.length > 0 ? daysArr.reduce((s, v) => s + v, 0) / daysArr.length : 0;

  // Also surface per-session UTM breakdown directly from session files
  const byUtmCampaign = {};
  const byUtmContent = {};
  sessions.forEach(s => {
    const camp = s.utm_campaign || 'unknown';
    byUtmCampaign[camp] = (byUtmCampaign[camp] || 0) + 1;
    const content = s.utm_content || 'unknown';
    byUtmContent[content] = (byUtmContent[content] || 0) + 1;
  });

  return res.json({
    version: report.version || '1.0',
    last_updated: report.last_updated || new Date().toISOString(),
    total_sessions: totalSessions,
    total_matched: totalMatched,
    total_unmatched: totalPending,
    match_rate_pct: matchRatePct,
    leads,
    sessions_breakdown: {
      by_utm_campaign: byUtmCampaign,
      by_utm_content: byUtmContent,
      pending: totalPending,
      matched: totalMatched,
    },
    summary: {
      by_source: bySource,
      by_hook: byHook,
      by_lead_type: byLeadType,
      members: leads.filter(l => l.became_member).length,
      avg_days_to_convert: avgDays,
    },
  });
});

// GET /api/admin/r2-test — creates a test object, reads it back, deletes it
app.get('/api/admin/r2-test', requireAdmin, async (req, res) => {
  const testPath = 'r2-test.json';
  const testData = { test: true, ts: new Date().toISOString() };
  try {
    await r2Put('bloomington', testPath, testData);
    const read = await r2Get('bloomington', testPath);
    await r2Delete('bloomington', testPath);
    if (!read || read.test !== true) throw new Error('Read-back mismatch');
    res.json({ success: true, key: `bloomington/${testPath}` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AHRI Marketing Command Center running on port ${PORT}`);
  console.log(`  Gym: ${locationConfig.getLocation('bloomington').gymName || 'GymSuite AI'}`);
  console.log(`  Reading from: ${ROOT}`);
});

async function seedIntelligenceIfEmpty() {
  const existing = await r2Get('bloomington', 'intelligence-db/market/competitor-ads.json');

  if (existing && typeof existing === 'object') {
    console.log('[Seed] competitor-ads.json exists in R2 — skipping');
    return;
  }

  {
    console.log('[Seed] Writing seed data to R2...');

    const defaultLoc = locationConfig.getLocation('bloomington');
    const seedData = {
      last_updated: '2026-04-26T16:00:00Z',
      city: `${defaultLoc.city}, ${defaultLoc.state}`,
      total_ads_found: 13,
      searches_run: ['gym', 'fitness center', 'personal training', 'anytime fitness', 'workout'],
      active_competitors: ['Orangetheory Fitness', 'Club Pilates', `${defaultLoc.gymName}`],
      saturated_hooks: [
        { hook_type: 'risk-free-trial', appears_in_count: 8, example_advertisers: ['Orangetheory Fitness'] },
        { hook_type: 'free-intro-class', appears_in_count: 4, example_advertisers: ['Club Pilates'] },
        { hook_type: 'transformation', appears_in_count: 4, example_advertisers: ['Orangetheory Fitness', 'Club Pilates'] },
      ],
      common_offers: ['30-Day Risk-Free Trial', 'Free Intro Class', '2 Months Free'],
      winning_ads: [
        {
          advertiser: 'Orangetheory Fitness',
          hook_type: 'transformation-curiosity',
          offer_type: '30-day-risk-free-trial',
          days_running: 33,
          creative_description: 'Lifestyle and transformation imagery with members training',
          primary_text_preview: "You have 30 days to fall in love with your results. Start with your first class FREE. If you don't love it, walk away free. No pressure. No long-term commitment.",
          headline: 'Train risk-free for 30 days.',
          cta: 'Book Now',
          what_works: 'Strong risk-removal frame with transformation promise — 33+ days indicates profitable CPA',
        },
      ],
      new_this_week: [
        { advertiser: 'Club Pilates', summary: 'Two shorter video cuts of Spring campaign — split-testing video lengths' },
        { advertiser: defaultLoc.gymName, summary: 'New campaign launched April 24 — 2 months FREE offer' },
      ],
      disappeared_this_week: [],
      absent_competitors: ['Planet Fitness', 'YMCA', 'Force Fitness & Performance', 'Iron Pit Gym'],
      recommendation_for_ahri: 'Pivot away from free time and discount offers — saturated by Orangetheory and Club Pilates. Attack schedule constraints: run 24/7 access and no-waitlist hooks targeting prospects frustrated by fixed class times.',
    };

    await r2Put('bloomington', 'intelligence-db/market/competitor-ads.json', seedData);
    console.log('[Seed] competitor-ads.json written to R2 successfully');
  }
}

seedIntelligenceIfEmpty().catch(console.error);

// ── Queue seed ──────────────────────────────────────────────────────────────
// On first deploy: copies assets from the baked-in /app/distribution/queue/
// to the persistent volume so approvals survive redeploys.
// On subsequent deploys: skips (volume already has files).

async function seedQueueIfEmpty() {
  try {
    await fs.promises.mkdir(QUEUE,  { recursive: true });
    await fs.promises.mkdir(READY,  { recursive: true });
    await fs.promises.mkdir(POSTED, { recursive: true });

    const existing = await fs.promises.readdir(QUEUE);
    const mdFiles = existing.filter(f => f.endsWith('.md'));

    if (mdFiles.length > 0) {
      console.log(`[Queue Seed] Volume queue has ${mdFiles.length} file(s) — skipping seed`);
      return;
    }

    const srcDir = path.join(__dirname, 'distribution', 'queue', 'pending-review');
    let srcFiles = [];
    try { srcFiles = await fs.promises.readdir(srcDir); } catch { /* no source */ }
    const toSeed = srcFiles.filter(f => f.endsWith('.md'));

    for (const file of toSeed) {
      await fs.promises.copyFile(path.join(srcDir, file), path.join(QUEUE, file));
    }

    console.log(`[Queue Seed] Seeded ${toSeed.length} asset(s) from repo to volume`);
  } catch (err) {
    console.error('[Queue Seed] Failed:', err.message);
  }
}

seedQueueIfEmpty().catch(console.error);

async function initAttributionStore() {
  const reportExists = await r2Exists('bloomington', 'attribution/attribution-report.json');
  if (!reportExists) {
    await r2Put('bloomington', 'attribution/attribution-report.json', {
      version: '1.0',
      last_updated: new Date().toISOString(),
      total_sessions: 0,
      total_matched: 0,
      total_unmatched: 0,
      match_rate_pct: 0,
      leads: [],
    });
    console.log('[Attribution] Report initialized in R2');
  }
  console.log('[Attribution] R2 session store ready');
}

initAttributionStore().catch(console.error);

async function migrateVolumeToR2() {
  const migrationKey = 'migration-complete.json';
  const alreadyDone = await r2Exists('bloomington', migrationKey);
  if (alreadyDone) {
    console.log('[R2 Migration] Already complete — skipping');
    return;
  }

  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    console.log('[R2 Migration] No volume mounted — nothing to migrate');
    await r2Put('bloomington', migrationKey, { migratedAt: new Date().toISOString(), source: 'no-volume' });
    return;
  }

  console.log('[R2 Migration] Starting volume → R2 migration...');
  let migrated = 0;
  let failed = 0;

  async function migrateDir(baseDir, r2Prefix) {
    let entries;
    try { entries = await fs.promises.readdir(baseDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry.name);
      const r2Key = `${r2Prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await migrateDir(fullPath, r2Key);
      } else if (entry.name.endsWith('.json')) {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const parsed = JSON.parse(content);
          await r2Put('bloomington', r2Key, parsed);
          migrated++;
          console.log(`[R2 Migration] Migrated: bloomington/${r2Key}`);
        } catch (err) {
          failed++;
          console.error(`[R2 Migration] Failed: ${r2Key}:`, err.message);
        }
      }
    }
  }

  await migrateDir(PERSISTENT_DATA_DIR, 'intelligence-db');
  await migrateDir(ATTRIBUTION_DIR, 'attribution');

  await r2Put('bloomington', migrationKey, {
    migratedAt: new Date().toISOString(),
    filesSucceeded: migrated,
    filesFailed: failed,
  });

  console.log(`[R2 Migration] Complete — ${migrated} files migrated, ${failed} failed`);
}

migrateVolumeToR2().catch(err => console.error('[R2 Migration] Fatal:', err.message));

// ── Cron: scheduled Manus tasks ─────────────────────────────────────────────

const MANUS_SCHEDULE = [
  { task: 'competitor-research.md',       schedule: '0 6 * * 1',    description: 'Every Monday at 6:00 AM' },
  { task: 'trend-monitoring.md',          schedule: '30 6 * * 1',   description: 'Every Monday at 6:30 AM' },
  { task: 'budget-pacing-tracker.md',     schedule: '0 8 * * 1',    description: 'Every Monday at 8:00 AM' },
  { task: 'review-monitoring.md',         schedule: '0 9 * * 1',    description: 'Every Monday at 9:00 AM' },
  { task: 'paid-ads-analyzer.md',         schedule: '0 8 * * 3',    description: 'Every Wednesday at 8:00 AM' },
  { task: 'google-ads-analyzer.md',       schedule: '0 9 * * 3',    description: 'Every Wednesday at 9:00 AM' },
  { task: 'clarity-analyzer.md',          schedule: '0 10 * * 3',   description: 'Every Wednesday at 10:00 AM' },
  { task: 'retention-early-warning.md',   schedule: '0 11 * * 3',   description: 'Every Wednesday at 11:00 AM' },
  { task: 'referral-tracker.md',          schedule: '0 20 * * 0',   description: 'Every Sunday at 8:00 PM' },
  { task: 'nurture-performance-analyzer.md', schedule: '0 21 * * 0', description: 'Every Sunday at 9:00 PM' },
  { task: 'lead-journey-tracker.md',      schedule: '0 22 * * 0',   description: 'Every Sunday at 10:00 PM' },
  { task: 'crm-hygiene.md',               schedule: '0 10 1 * *',   description: 'First of month at 10:00 AM' },
  { task: 'gbp-optimization.md',          schedule: '0 11 1 * *',   description: 'First of month at 11:00 AM' },
  { task: 'monthly-report.md',            schedule: '0 12 1 * *',   description: 'First of month at 12:00 PM' },
];

async function triggerManusTask(filename, triggeredBy = 'cron') {
  if (!MANUS_TASKS_PATH) {
    console.error(`[cron] No task directory — cannot trigger ${filename}`);
    return null;
  }
  const taskPath = path.join(MANUS_TASKS_PATH, filename);
  let taskContent;
  try { taskContent = fs.readFileSync(taskPath, 'utf-8'); } catch {
    console.error(`[cron] Task file not found: ${filename}`);
    return null;
  }
  if (!MANUS_API_KEY) {
    console.warn(`[cron] MANUS_API_KEY not set — skipping scheduled task: ${filename}`);
    return null;
  }

  const task_type = getTaskType(filename);
  const webhookUrl = WEBHOOK_URL ? `${WEBHOOK_URL}/api/manus/callback` : null;

  try {
    const response = await fetch(`${MANUS_API_BASE}/task.create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manus-api-key': MANUS_API_KEY },
      body: JSON.stringify({
        message: { content: [{ type: 'text', text: taskContent }] },
        metadata: { source: 'ahri-scheduled-trigger', filename, task_type, triggered_by: triggeredBy },
        ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
      }),
    });

    const data = await response.json();
    const task_id = data.task_id || data.id || `cron-${Date.now()}`;

    saveTaskRun(task_id, {
      task_type,
      task_filename: filename,
      triggered_by: triggeredBy,
      started_at: new Date().toISOString(),
      status: 'running',
      task_url: data.task_url || null,
    });

    console.log(`[cron] Task started: ${filename} → ${task_id}`);
    return task_id;
  } catch (err) {
    console.error(`[cron] Failed to trigger ${filename}:`, err.message);
    return null;
  }
}

if (MANUS_API_KEY) {
  MANUS_SCHEDULE.forEach(({ task, schedule, description }) => {
    cron.schedule(schedule, () => {
      console.log(`[cron] Firing: ${task} (${description})`);
      triggerManusTask(task).catch(err => console.error('[cron] Trigger error:', err.message));
    }, { timezone: 'America/Indiana/Indianapolis' });
    console.log(`[cron] Scheduled: ${task} — ${description}`);
  });
  console.log(`[cron] ${MANUS_SCHEDULE.length} tasks scheduled (timezone: America/Indiana/Indianapolis)`);
} else {
  console.warn('[cron] MANUS_API_KEY not set — scheduled tasks disabled');
}

// ── Event-driven agentic rules (checked every hour) ─────────────────────────

const AGENTIC_RULES = [
  {
    id: 'high_cpl_alert',
    name: 'CPL Kill Threshold',
    description: 'Trigger paid-ads-analyzer if CPL > $60 after $50 spend',
    check: async () => {
      try {
        const perf = await r2Get('bloomington', 'intelligence-db/paid/meta-performance.json') || {};
        return !perf._is_placeholder && perf.cpl > 60 && perf.total_spend > 50;
      } catch { return false; }
    },
    action: 'paid-ads-analyzer.md',
    cooldown_hours: 24,
    notification: 'CPL exceeded $60 kill threshold — paid-ads-analyzer triggered automatically',
  },
  {
    id: 'scale_signal',
    name: 'Scale Signal',
    description: 'Trigger paid-ads-analyzer if CPL < $30 for 3+ days',
    check: async () => {
      try {
        const perf = await r2Get('bloomington', 'intelligence-db/paid/meta-performance.json') || {};
        return !perf._is_placeholder && perf.cpl_3day_avg < 30 && (perf.days_below_target || 0) >= 3;
      } catch { return false; }
    },
    action: 'paid-ads-analyzer.md',
    cooldown_hours: 72,
    notification: 'CPL below $30 for 3 consecutive days — scale signal detected',
  },
  {
    id: 'retention_alert',
    name: 'Member Retention Alert',
    description: 'Trigger retention-early-warning if at-risk member count > 3',
    check: async () => {
      try {
        const retention = await r2Get('bloomington', 'intelligence-db/retention/dropout-alerts.json') || {};
        return (retention.at_risk_count || 0) > 3;
      } catch { return false; }
    },
    action: 'retention-early-warning.md',
    cooldown_hours: 168,
    notification: 'More than 3 members at risk of dropout — retention-early-warning triggered',
  },
];

cron.schedule('0 * * * *', async () => {
  console.log('[rules] Checking agentic rules...');
  for (const rule of AGENTIC_RULES) {
    try {
      const lastFired = await r2Get('bloomington', `intelligence-db/rules/${rule.id}.json`);

      if (lastFired) {
        const hoursSince = (Date.now() - new Date(lastFired.fired_at).getTime()) / 3600000;
        if (hoursSince < rule.cooldown_hours) continue;
      }

      if (await rule.check()) {
        console.log(`[rules] Triggered: ${rule.name}`);
        await triggerManusTask(rule.action, 'rules-engine');
        const record = { id: rule.id, title: rule.name, message: rule.notification, fired_at: new Date().toISOString(), action_taken: rule.action };
        await r2Put('bloomington', `intelligence-db/rules/${rule.id}.json`, record);
      }
    } catch (err) {
      console.error(`[rules] Error checking ${rule.id}:`, err.message);
    }
  }
}, { timezone: 'America/Indiana/Indianapolis' });
