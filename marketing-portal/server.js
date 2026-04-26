'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3003;

// --- Path constants ---
const ROOT      = path.join(__dirname, '..');
const INTEL     = path.join(ROOT, 'intelligence-db');
const QUEUE     = path.join(ROOT, 'distribution', 'queue', 'pending-review');
const POSTED    = path.join(ROOT, 'distribution', 'queue', 'posted');
const READY     = path.join(ROOT, 'distribution', 'queue', 'ready-to-post');
const LOGS      = path.join(ROOT, 'logs');
const OUTPUTS   = path.join(ROOT, 'outputs');
const MANUS     = path.join(ROOT, 'manus-tasks');
const BRIEFS    = path.join(OUTPUTS, 'anytime-fitness', 'morning-briefs');
const THRESHOLDS = path.join(ROOT, 'knowledge-base', 'paid-media', 'thresholds.md');
const ASSET_LOG = path.join(ROOT, 'performance', 'asset-log.csv');
const SESSION_LOG = path.join(LOGS, 'session-log.csv');
const RULES_FILE = path.join(__dirname, 'config', 'agentic-rules.json');

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
  const files = safeReadDir(MANUS).filter(f => f.endsWith('.md'));
  const sessionLog = parseCsvRows(safeRead(SESSION_LOG));

  const tasks = files.map(filename => {
    const content = safeRead(path.join(MANUS, filename)) || '';
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
  const content = safeRead(path.join(MANUS, filename));
  if (!content) return res.status(404).json({ error: 'task not found' });
  res.json({ filename, content });
});

app.get('/api/hooks-library', (req, res) => {
  const assetLog = parseCsvRows(safeRead(ASSET_LOG));
  const metaPerf = safeReadJSON(path.join(INTEL, 'paid', 'meta-performance.json'));
  const perfMap = {};
  (metaPerf.hooks || []).forEach(h => { if (h.hook_text) perfMap[h.hook_text.slice(0, 40)] = h; });

  const hooks = assetLog
    .filter(r => r.skill === 'hook-writer' || r.type === 'hook')
    .map(r => {
      const perfKey = Object.keys(perfMap).find(k => (r.asset_id || '').includes(k));
      const perf = perfKey ? perfMap[perfKey] : {};
      return {
        hook_text: r.hook_text || r.preview || r.asset_id || '',
        hook_type: r.hook_type || 'unknown',
        cpl: perf.cpl || null,
        ctr: perf.ctr || null,
        thumbstop_rate: perf.thumbstop || null,
        status: perf.cpl ? (perf.cpl <= 30 ? 'winner' : 'testing') : 'pending',
        created_date: r.date || '',
        campaign: r.context || ''
      };
    });

  res.json({ hooks, total: hooks.length, has_performance_data: hooks.some(h => h.cpl) });
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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AHRI Marketing Command Center running on port ${PORT}`);
  console.log(`  Gym: ${process.env.GYM_NAME || 'GymSuite AI'}`);
  console.log(`  Reading from: ${ROOT}`);
});
