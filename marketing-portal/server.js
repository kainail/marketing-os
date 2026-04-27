'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3003;

// --- Path constants ---
// On Railway, __dirname = /app (the marketing-portal/ folder is the service root).
// Asset directories are copied into marketing-portal/ so they exist at /app/distribution etc.
// REPO_ROOT env var can still override if needed.
const ROOT      = process.env.REPO_ROOT || path.join(__dirname);
const INTEL     = path.join(ROOT, 'intelligence-db');
const QUEUE     = path.join(ROOT, 'distribution', 'queue', 'pending-review');
const POSTED    = path.join(ROOT, 'distribution', 'queue', 'posted');
const READY     = path.join(ROOT, 'distribution', 'queue', 'ready-to-post');
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
const MANUS_API_KEY = process.env.MANUS_API_KEY || '';
const DATA_DIR = path.join(__dirname, 'data');
const TASK_RUNS_FILE = path.join(DATA_DIR, 'task-runs.json');
const SCHEMAS_DIR = path.join(ROOT, 'schemas', 'manus-outputs');

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
  console.warn('⚠ RAILWAY_VOLUME_MOUNT_PATH not set. Intelligence files will not persist across deploys. Add a Railway volume mounted at /data to fix this.');
}

// --- Helpers ---

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function safeReadJSON(p) {
  try { const t = safeRead(p); return t ? JSON.parse(t) : {}; } catch { return {}; }
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
};

function loadTaskRuns() {
  try {
    const raw = fs.readFileSync(TASK_RUNS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTaskRun(taskId, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const runs = loadTaskRuns();
    runs[taskId] = { ...data, updated_at: new Date().toISOString() };
    const tmp = TASK_RUNS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(runs, null, 2));
    fs.renameSync(tmp, TASK_RUNS_FILE);
  } catch (err) {
    console.error('[task-runs] save failed:', err.message);
  }
}

function updateTaskRun(taskId, updates) {
  try {
    const runs = loadTaskRuns();
    if (!runs[taskId]) return;
    runs[taskId] = { ...runs[taskId], ...updates, updated_at: new Date().toISOString() };
    const tmp = TASK_RUNS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(runs, null, 2));
    fs.renameSync(tmp, TASK_RUNS_FILE);
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
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/status', (req, res) => {
  res.json({
    version: '1.0',
    portal: 'AHRI Marketing Command Center',
    timestamp: new Date().toISOString(),
    gym_name: process.env.GYM_NAME || 'GymSuite AI',
    ops_url: process.env.OPS_URL || 'https://gymsuiteai-dashboard-production.up.railway.app',
    neural_url: process.env.NEURAL_URL || 'https://gymsuiteai-neural-os-production.up.railway.app',
  });
});

app.get('/api/overview', (req, res) => {
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
  const retention = safeReadJSON(path.join(INTEL, 'retention', 'dropout-alerts.json'));
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const nurturePerf = safeReadJSON(path.join(INTEL, 'nurture', 'sequence-performance.json'));
  const reviewLog = safeReadJSON(path.join(INTEL, 'market', 'review-log.json'));
  const coachAlerts = parseCsvRows(safeRead(path.join(LOGS, 'coaching-alerts.csv')));
  const alerts = buildAlerts(retention, metaPerf, nurturePerf, reviewLog);
  res.json({ alerts, coaching_alerts: coachAlerts });
});

app.get('/api/performance', (req, res) => {
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
  const files = safeReadDir(QUEUE).filter(f => f.endsWith('.md'));
  const assets = files.map(filename => {
    const content = safeRead(path.join(QUEUE, filename)) || '';
    const headers = parseMdHeaders(content);
    const lines = content.split('\n');
    const previewStart = lines.findIndex(l => l.trim() && !l.match(/^[a-z_]+:/i) && !l.startsWith('#'));
    const preview = lines.slice(previewStart, previewStart + 8).join('\n').slice(0, 400);
    const hasBudget = content.includes('[BUDGET REQUIRED]') || (headers.budget_required === 'true');
    let stat;
    try { stat = fs.statSync(path.join(QUEUE, filename)); } catch { stat = { mtimeMs: Date.now() }; }
    const daysOld = Math.floor((Date.now() - stat.mtimeMs) / 86400000);
    return {
      filename,
      skill: headers.skill || filename.split('-')[0] || 'unknown',
      platform: headers.platform || '',
      format: headers.format || '',
      awareness_level: headers.awareness_level || '',
      variant: headers.variant || '',
      asset_id: headers.asset_id || filename.replace('.md', ''),
      created_date: headers.date || '',
      days_in_queue: daysOld,
      has_budget_flag: hasBudget,
      preview
    };
  }).sort((a, b) => a.created_date.localeCompare(b.created_date));
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

app.get('/api/hooks-library', (req, res) => {
  // Correct source: /app/intelligence-db/assets/hooks.json (repo file).
  // Previous code read from asset-log.csv which has no hook_text column — fell back to asset_id strings.
  // Perf overlay reads from PERSISTENT_DATA_DIR (volume) because Manus writes meta-performance there.
  const hooksRaw = safeReadJSON(path.join(ROOT, 'intelligence-db', 'assets', 'hooks.json'));
  const hooks = Array.isArray(hooksRaw) ? hooksRaw : (hooksRaw.hooks || []);
  const metaPerf = safeReadJSON(path.join(PERSISTENT_DATA_DIR, 'paid', 'meta-performance.json'));
  const perfMap = {};
  (metaPerf.hooks || []).forEach(h => { if (h.hook_text) perfMap[h.hook_text.slice(0, 40)] = h; });

  const enriched = hooks.map(hook => {
    const perfKey = Object.keys(perfMap).find(k => (hook.hook_text || '').startsWith(k));
    const perf = perfKey ? perfMap[perfKey] : {};
    return {
      ...hook,
      cpl: hook.cpl ?? perf.cpl ?? null,
      ctr: hook.ctr ?? perf.ctr ?? null,
      thumbstop_rate: hook.thumbstop_rate ?? perf.thumbstop ?? null,
      status: hook.status || (perf.cpl ? (perf.cpl <= 30 ? 'winner' : 'testing') : 'pending'),
    };
  });

  res.json({ hooks: enriched, total: enriched.length, has_performance_data: enriched.some(h => h.cpl) });
});

app.get('/api/nurture', (req, res) => {
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
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({
      response: `AHRI here. I received your message: "${message}". To enable AI responses, add ANTHROPIC_API_KEY to your environment variables. In the meantime, check your approval queue and decision layer for the most urgent actions.`
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
  const runs = loadTaskRuns();
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
        const runs = loadTaskRuns();
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
        for (const output of outputs) {
          try {
            const payload = output.key ? (taskData || {})[output.key] : taskData;
            if (payload && typeof payload === 'object') {
              await atomicWriteJSON(output.path, payload);
              console.log(`[manus/callback] task complete — wrote to ${output.path}`);
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
      for (const output of outputs) {
        try {
          const payload = output.key ? (data || {})[output.key] : data;
          if (payload && typeof payload === 'object') {
            await atomicWriteJSON(output.path, payload);
            console.log(`[manus/callback] wrote ${output.path}`);
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
app.get('/api/manus/recent-runs', (req, res) => {
  const runs = loadTaskRuns();
  const sorted = Object.entries(runs)
    .map(([task_id, run]) => ({ task_id, ...run }))
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
    .slice(0, 20);
  res.json({ runs: sorted, total: Object.keys(runs).length });
});

app.get('/api/debug/env', (req, res) => {
  res.json({
    manus_key_set: !!process.env.MANUS_API_KEY,
    manus_key_length: process.env.MANUS_API_KEY ? process.env.MANUS_API_KEY.length : 0,
    manus_key_preview: process.env.MANUS_API_KEY ? process.env.MANUS_API_KEY.substring(0, 8) + '...' : 'NOT SET',
    node_env: process.env.NODE_ENV,
    railway_env: process.env.RAILWAY_ENVIRONMENT_NAME
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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AHRI Marketing Command Center running on port ${PORT}`);
  console.log(`  Gym: ${process.env.GYM_NAME || 'GymSuite AI'}`);
  console.log(`  Reading from: ${ROOT}`);
});

async function seedIntelligenceIfEmpty() {
  const competitorAdsPath = path.join(PERSISTENT_DATA_DIR, 'market', 'competitor-ads.json');

  try {
    await fs.promises.access(competitorAdsPath);
    console.log('[Seed] competitor-ads.json exists — skipping');
  } catch {
    console.log('[Seed] Writing seed data...');

    await fs.promises.mkdir(path.join(PERSISTENT_DATA_DIR, 'market'), { recursive: true });

    const seedData = {
      last_updated: '2026-04-26T16:00:00Z',
      city: 'Bloomington, IN',
      total_ads_found: 13,
      searches_run: ['gym', 'fitness center', 'personal training', 'anytime fitness', 'workout'],
      active_competitors: ['Orangetheory Fitness', 'Club Pilates', 'Anytime Fitness Bloomington'],
      saturated_hooks: [
        { hook_type: 'risk-free-trial', appears_in_count: 8, example_advertisers: ['Orangetheory Fitness'] },
        { hook_type: 'free-intro-class', appears_in_count: 4, example_advertisers: ['Club Pilates'] },
        { hook_type: 'transformation', appears_in_count: 4, example_advertisers: ['Orangetheory Fitness', 'Club Pilates'] },
      ],
      common_offers: ['30-Day Risk-Free Trial', 'Free Intro Class', '2 Months Free'],
      winning_ads: [
        {
          advertiser: 'Orangetheory Fitness Bloomington',
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
        { advertiser: 'Anytime Fitness Bloomington', summary: 'New campaign launched April 24 — 2 months FREE offer' },
      ],
      disappeared_this_week: [],
      absent_competitors: ['Planet Fitness', 'YMCA', 'Force Fitness & Performance', 'Iron Pit Gym'],
      recommendation_for_ahri: 'Pivot away from free time and discount offers — saturated by Orangetheory and Club Pilates. Attack schedule constraints: run 24/7 access and no-waitlist hooks targeting prospects frustrated by fixed class times.',
    };

    await atomicWriteJSON(competitorAdsPath, seedData);
    console.log('[Seed] competitor-ads.json written successfully');
  }
}

seedIntelligenceIfEmpty().catch(console.error);
