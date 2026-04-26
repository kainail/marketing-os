const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3002;

const META_PIXEL_ID       = process.env.META_PIXEL_ID       || '';
const META_CAPI_TOKEN     = process.env.META_CAPI_TOKEN     || '';
const GHL_LOCATION_ID     = process.env.GHL_LOCATION_ID     || 'h4FkKJzyBbX0vR71RJFI';
const DEFAULT_DESTINATION = process.env.DEFAULT_DESTINATION || 'https://www.anytimefitness.com/find-a-gym/';
const REPORT_KEY          = process.env.REPORT_KEY          || '';

const JOURNEY_LOG = path.join(__dirname, 'journey-log.json');

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || '').digest('hex').slice(0, 16);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const eq = c.indexOf('=');
    if (eq < 0) return;
    const k = c.slice(0, eq).trim();
    const v = c.slice(eq + 1).trim();
    try { cookies[k] = decodeURIComponent(v); } catch { cookies[k] = v; }
  });
  return cookies;
}

function readJourneyLog() {
  try { return JSON.parse(fs.readFileSync(JOURNEY_LOG, 'utf8')); } catch { return []; }
}

function appendJourneyLog(entry) {
  const log = readJourneyLog();
  log.push(entry);
  fs.writeFileSync(JOURNEY_LOG, JSON.stringify(log.slice(-10000), null, 2));
}

function fireCapiAsync(pixelId, token, eventData) {
  const payload = JSON.stringify({
    data: [eventData],
    access_token: token,
  });
  const req = https.request({
    hostname: 'graph.facebook.com',
    path: `/v18.0/${pixelId}/events`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  });
  req.on('error', err => console.error('[CAPI]', err.message));
  req.write(payload);
  req.end();
}

// ── GET /go — tracking redirect ──────────────────────────────────────────────

app.get('/go', (req, res) => {
  const dest        = req.query.dest        || DEFAULT_DESTINATION;
  const utmSource   = req.query.utm_source  || 'direct';
  const utmMedium   = req.query.utm_medium  || 'none';
  const utmCampaign = req.query.utm_campaign || 'none';
  const utmContent  = req.query.utm_content  || '';
  const queryLeadId = req.query.lead_id      || '';

  const cookies     = parseCookies(req.headers.cookie);
  const cookieLeadId = cookies.gymsuite_lead_id || '';
  const leadId      = queryLeadId || cookieLeadId;
  const isReturning = !!cookieLeadId;
  const timestamp   = new Date().toISOString();

  // Build visit event
  const visitEvent = {
    timestamp,
    destination:  dest,
    utm_source:   utmSource,
    utm_medium:   utmMedium,
    utm_campaign: utmCampaign,
    utm_content:  utmContent,
    lead_id:      leadId,
    returning:    isReturning,
    ip_hash:      hashIp(req.ip),
    user_agent:   req.headers['user-agent'] || '',
  };

  // Fire CAPI async — never blocks redirect
  if (META_PIXEL_ID && META_CAPI_TOKEN) {
    fireCapiAsync(META_PIXEL_ID, META_CAPI_TOKEN, {
      event_name:        'PageView',
      event_time:        Math.floor(Date.now() / 1000),
      event_source_url:  dest,
      user_data: {
        client_ip_address: req.ip,
        client_user_agent: req.headers['user-agent'] || '',
      },
      custom_data: {
        lead_journey_event: 'redirect_click',
        utm_source:   utmSource,
        destination:  dest,
      },
    });
  }

  // Log to journey-log.json (sync write — fast enough for this volume)
  try { appendJourneyLog(visitEvent); } catch (err) {
    console.error('[Log]', err.message);
  }

  // Set first-party cookies (1-year expiry)
  const age  = 365 * 24 * 3600;
  const opts = `; Max-Age=${age}; Path=/; SameSite=Lax`;
  const setCookies = [
    `gymsuite_source=${encodeURIComponent(utmSource)}${opts}`,
    `gymsuite_last_touch=${encodeURIComponent(timestamp)}${opts}`,
    `gymsuite_touch_count=${(parseInt(cookies.gymsuite_touch_count || '0', 10) + 1)}${opts}`,
  ];
  if (!cookies.gymsuite_first_touch) {
    setCookies.push(`gymsuite_first_touch=${encodeURIComponent(timestamp)}${opts}`);
  }
  res.setHeader('Set-Cookie', setCookies);

  const finalDest = dest.startsWith('http') ? dest : `https://${dest}`;
  res.redirect(301, finalDest);
});

// ── GET /health ───────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.status(200).send('OK'));

// ── GET /report — analytics summary (key-protected) ──────────────────────────

app.get('/report', (req, res) => {
  if (REPORT_KEY && req.query.key !== REPORT_KEY) {
    return res.status(401).json({ error: 'Unauthorized — pass ?key=REPORT_KEY' });
  }
  const log      = readJourneyLog();
  const last100  = log.slice(-100);
  const unique   = new Set(last100.map(e => e.ip_hash)).size;
  const returning = last100.filter(e => e.returning).length;

  const tally = (field) => {
    const counts = {};
    last100.forEach(e => { const k = e[field] || 'unknown'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  const topDests = (() => {
    const counts = {};
    last100.forEach(e => {
      const k = (e.destination || '').replace(/https?:\/\//, '').split('?')[0];
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  res.json({
    total_events:      last100.length,
    unique_visitors:   unique,
    returning_visitors: returning,
    new_visitors:      last100.length - returning,
    top_sources:       tally('utm_source'),
    top_campaigns:     tally('utm_campaign'),
    top_destinations:  topDests,
    first_event:       last100[0]?.timestamp   || null,
    last_event:        last100[last100.length - 1]?.timestamp || null,
  });
});

app.listen(PORT, () => {
  console.log(`Tracking redirect running on port ${PORT}`);
  console.log(`GHL location: ${GHL_LOCATION_ID}`);
  console.log(`CAPI enabled: ${!!(META_PIXEL_ID && META_CAPI_TOKEN)}`);
});
