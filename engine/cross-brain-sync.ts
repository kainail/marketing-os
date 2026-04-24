import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as drive from './drive.js';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');
const BRAIN_STATE = path.join(ROOT, 'brain-state', 'current-state.md');
const CROSS_BRAIN_DIR = path.join(ROOT, 'intelligence-db', 'cross-brain');

// --- Types ---

interface ArchetypeMetrics {
  booking_rate: number;
  conversion_rate: number;
  show_rate: number;
  avg_ltv: number | null;
  sample_size: number;
}

interface SourceMetrics {
  booking_rate: number;
  show_rate: number;
  conversion_rate: number;
  avg_ltv: number | null;
  sample_size: number;
}

interface ArchetypePerformance {
  last_updated: string;
  data_period_days: number;
  sample_size: number;
  by_archetype: {
    social: ArchetypeMetrics;
    analytical: ArchetypeMetrics;
    supportive: ArchetypeMetrics;
    independent: ArchetypeMetrics;
  };
  top_converting_archetype: string;
  insights: string[];
}

interface HookToConversion {
  last_updated: string;
  by_lead_source: {
    facebook_cold: SourceMetrics;
    instagram_warm: SourceMetrics;
    google_search: SourceMetrics;
    referral: SourceMetrics;
    free_pass: SourceMetrics;
    lost_join: SourceMetrics;
  };
  top_performing_source: string;
  insights: string[];
}

interface OfferToLtv {
  last_updated: string;
  active_offer: string;
  avg_ltv_by_source: Record<string, number>;
  insights: string[];
}

export interface SyncReport {
  success: boolean;
  sample_size: number;
  data_period_days: number;
  top_converting_archetype: string;
  top_performing_source: string;
  insights: string[];
  error?: string;
}

// --- Logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","cross-brain-sync","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Sheet parsing helpers ---

function colIndex(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.toLowerCase().trim().includes(candidate.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function emptyMetrics(): ArchetypeMetrics {
  return { booking_rate: 0, conversion_rate: 0, show_rate: 0, avg_ltv: null, sample_size: 0 };
}

function emptySourceMetrics(): SourceMetrics {
  return { booking_rate: 0, show_rate: 0, conversion_rate: 0, avg_ltv: null, sample_size: 0 };
}

// --- Data reading ---

async function readStageLog(spreadsheetId: string): Promise<string[][]> {
  // GymSuite AI Sheets structure — [KAI: confirm the exact sheet name and range for your Stage Log]
  const rows = await drive.readSheet(spreadsheetId, 'Stage Log!A:Z');
  return rows;
}

async function readRevenueData(spreadsheetId: string): Promise<string[][]> {
  // [KAI: confirm sheet name for revenue/LTV data if it exists]
  try {
    return await drive.readSheet(spreadsheetId, 'Revenue!A:Z');
  } catch {
    return [];
  }
}

// --- Calculation ---

function calculateArchetypePerformance(rows: string[][], headers: string[]): ArchetypePerformance['by_archetype'] {
  const archetypeCol = colIndex(headers, 'archetype', 'personality', 'type');
  const bookedCol = colIndex(headers, 'booked', 'booking', 'appointment');
  const showedCol = colIndex(headers, 'showed', 'show', 'attended');
  const convertedCol = colIndex(headers, 'converted', 'member', 'joined');

  const archetypes = ['social', 'analytical', 'supportive', 'independent'] as const;
  type ArchetypeKey = typeof archetypes[number];
  const result: Record<ArchetypeKey, { bookings: number; shows: number; conversions: number; total: number }> = {
    social: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    analytical: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    supportive: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    independent: { bookings: 0, shows: 0, conversions: 0, total: 0 },
  };

  if (archetypeCol < 0) return {
    social: emptyMetrics(),
    analytical: emptyMetrics(),
    supportive: emptyMetrics(),
    independent: emptyMetrics(),
  };

  for (const row of rows) {
    const rawArchetype = (row[archetypeCol] ?? '').toLowerCase().trim();
    const archetype = archetypes.find(a => rawArchetype.includes(a));
    if (!archetype) continue;

    result[archetype].total++;
    if (bookedCol >= 0 && (row[bookedCol] ?? '').toLowerCase().includes('y')) result[archetype].bookings++;
    if (showedCol >= 0 && (row[showedCol] ?? '').toLowerCase().includes('y')) result[archetype].shows++;
    if (convertedCol >= 0 && (row[convertedCol] ?? '').toLowerCase().includes('y')) result[archetype].conversions++;
  }

  const toMetrics = (key: ArchetypeKey): ArchetypeMetrics => ({
    booking_rate: safeRate(result[key].bookings, result[key].total),
    conversion_rate: safeRate(result[key].conversions, result[key].total),
    show_rate: safeRate(result[key].shows, result[key].bookings),
    avg_ltv: null,
    sample_size: result[key].total,
  });

  return {
    social: toMetrics('social'),
    analytical: toMetrics('analytical'),
    supportive: toMetrics('supportive'),
    independent: toMetrics('independent'),
  };
}

function calculateSourcePerformance(rows: string[][], headers: string[]): HookToConversion['by_lead_source'] {
  const sourceCol = colIndex(headers, 'source', 'lead source', 'channel');
  const bookedCol = colIndex(headers, 'booked', 'booking', 'appointment');
  const showedCol = colIndex(headers, 'showed', 'show', 'attended');
  const convertedCol = colIndex(headers, 'converted', 'member', 'joined');

  const sourceMap: Record<string, string> = {
    'facebook': 'facebook_cold',
    'fb': 'facebook_cold',
    'instagram': 'instagram_warm',
    'ig': 'instagram_warm',
    'google': 'google_search',
    'referral': 'referral',
    'ref': 'referral',
    'free pass': 'free_pass',
    'freepass': 'free_pass',
    'lost join': 'lost_join',
    'lostjoin': 'lost_join',
  };

  const sources = ['facebook_cold', 'instagram_warm', 'google_search', 'referral', 'free_pass', 'lost_join'] as const;
  type SourceKey = typeof sources[number];
  const result: Record<SourceKey, { bookings: number; shows: number; conversions: number; total: number }> = {
    facebook_cold: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    instagram_warm: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    google_search: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    referral: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    free_pass: { bookings: 0, shows: 0, conversions: 0, total: 0 },
    lost_join: { bookings: 0, shows: 0, conversions: 0, total: 0 },
  };

  if (sourceCol < 0) {
    const empty = {} as Record<SourceKey, SourceMetrics>;
    sources.forEach(s => { empty[s] = emptySourceMetrics(); });
    return empty;
  }

  for (const row of rows) {
    const rawSource = (row[sourceCol] ?? '').toLowerCase().trim();
    const mappedKey = Object.entries(sourceMap).find(([k]) => rawSource.includes(k))?.[1] as SourceKey | undefined;
    if (!mappedKey) continue;

    result[mappedKey].total++;
    if (bookedCol >= 0 && (row[bookedCol] ?? '').toLowerCase().includes('y')) result[mappedKey].bookings++;
    if (showedCol >= 0 && (row[showedCol] ?? '').toLowerCase().includes('y')) result[mappedKey].shows++;
    if (convertedCol >= 0 && (row[convertedCol] ?? '').toLowerCase().includes('y')) result[mappedKey].conversions++;
  }

  const toSourceMetrics = (key: SourceKey): SourceMetrics => ({
    booking_rate: safeRate(result[key].bookings, result[key].total),
    show_rate: safeRate(result[key].shows, result[key].bookings),
    conversion_rate: safeRate(result[key].conversions, result[key].total),
    avg_ltv: null,
    sample_size: result[key].total,
  });

  const out = {} as Record<SourceKey, SourceMetrics>;
  sources.forEach(s => { out[s] = toSourceMetrics(s); });
  return out;
}

// --- Insights generation ---

async function generateInsights(client: Anthropic, archetypeData: ArchetypePerformance, hookData: HookToConversion): Promise<string[]> {
  const dataString = JSON.stringify({ archetypeData, hookData }, null, 2);

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Given this GymSuite AI performance data, what should AHRI change about how she generates marketing for this gym? Be specific — name the archetype, the channel, and the recommended shift. Return a JSON array of 3-5 insight strings. Each insight must be one specific, actionable sentence. No explanation, just the JSON array.

Data:
${dataString}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : '[]') as string[];
  } catch (err) {
    logError('generateInsights', err as Error);
    return ['Insufficient data for insights — run again after 30 days of lead data.'];
  }
}

// --- Main ---

export async function syncBrains(): Promise<SyncReport> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const spreadsheetId = process.env['GOOGLE_SHEETS_GYMSUITE_ID'];

  if (!spreadsheetId) {
    console.log(chalk.yellow('\n  [Cross-Brain Sync] GOOGLE_SHEETS_GYMSUITE_ID not set.'));
    console.log(chalk.gray('  Writing empty intelligence-db/cross-brain/ placeholders.\n'));

    const placeholderInsights = [
      'No GymSuite AI data available yet — set GOOGLE_SHEETS_GYMSUITE_ID in .env to enable cross-brain sync.',
      'Once connected, AHRI will automatically adjust content strategy based on archetype conversion rates.',
      'High-converting archetypes will receive more content budget allocation when data is available.',
    ];

    await writeAllFiles(
      buildEmptyArchetypeData(placeholderInsights),
      buildEmptyHookData(placeholderInsights),
      buildEmptyLtvData(placeholderInsights)
    );

    updateBrainState(placeholderInsights);

    return {
      success: false,
      sample_size: 0,
      data_period_days: 0,
      top_converting_archetype: 'unknown',
      top_performing_source: 'unknown',
      insights: placeholderInsights,
      error: 'GOOGLE_SHEETS_GYMSUITE_ID not configured',
    };
  }

  console.log(chalk.bold.cyan('\n  [Cross-Brain Sync] Reading GymSuite AI data...\n'));

  // Steps 1-4 — Read sheet data
  const rows = await readStageLog(spreadsheetId);
  const revenueRows = await readRevenueData(spreadsheetId);

  if (rows.length < 2) {
    const msg = 'Stage Log is empty or not found. Verify GOOGLE_SHEETS_GYMSUITE_ID and sheet name.';
    console.log(chalk.yellow(`  ${msg}`));

    return {
      success: false,
      sample_size: 0,
      data_period_days: 30,
      top_converting_archetype: 'unknown',
      top_performing_source: 'unknown',
      insights: [msg],
      error: msg,
    };
  }

  const headers = rows[0].map(h => (h ?? '').toLowerCase().trim());
  const dataRows = rows.slice(1);

  console.log(chalk.gray(`  Stage Log: ${dataRows.length} records`));

  // Calculate period — assume rows have a date column
  const dateCol = colIndex(headers, 'date', 'created', 'timestamp');
  let dataPeriodDays = 30;
  if (dateCol >= 0 && dataRows.length > 0) {
    const dates = dataRows
      .map(r => new Date(r[dateCol] ?? '').getTime())
      .filter(d => !isNaN(d));
    if (dates.length > 1) {
      dataPeriodDays = Math.ceil((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24));
    }
  }

  // Step 2 — Archetype performance
  console.log(chalk.gray('  Calculating archetype conversion rates...'));
  const archetypePerf = calculateArchetypePerformance(dataRows, headers);

  // Step 3 — Source performance (booking rate, show rate)
  console.log(chalk.gray('  Calculating source performance...'));
  const sourcePerf = calculateSourcePerformance(dataRows, headers);

  // Step 4 — Revenue attribution (if available)
  const ltvBySource: Record<string, number> = {};
  if (revenueRows.length > 1) {
    const revHeaders = revenueRows[0].map(h => (h ?? '').toLowerCase().trim());
    const revSourceCol = colIndex(revHeaders, 'source', 'lead source');
    const ltvCol = colIndex(revHeaders, 'ltv', 'revenue', 'value');
    if (revSourceCol >= 0 && ltvCol >= 0) {
      const ltvTotals: Record<string, { sum: number; count: number }> = {};
      for (const row of revenueRows.slice(1)) {
        const source = (row[revSourceCol] ?? '').trim();
        const ltv = parseFloat(row[ltvCol] ?? '0');
        if (source && !isNaN(ltv)) {
          if (!ltvTotals[source]) ltvTotals[source] = { sum: 0, count: 0 };
          ltvTotals[source].sum += ltv;
          ltvTotals[source].count++;
        }
      }
      Object.entries(ltvTotals).forEach(([k, v]) => {
        ltvBySource[k] = Math.round(v.sum / v.count);
      });
    }
  }

  // Find top performers
  const archetypeEntries = Object.entries(archetypePerf) as [string, ArchetypeMetrics][];
  const topArchetype = archetypeEntries.sort((a, b) => b[1].conversion_rate - a[1].conversion_rate)[0]?.[0] ?? 'unknown';

  const sourceEntries = Object.entries(sourcePerf) as [string, SourceMetrics][];
  const topSource = sourceEntries.sort((a, b) => b[1].conversion_rate - a[1].conversion_rate)[0]?.[0] ?? 'unknown';

  // Step 6 — Generate insights
  console.log(chalk.gray('  Generating insights via claude-opus-4-6...'));

  const now = new Date().toISOString();
  const sampleSize = dataRows.length;

  const archetypeOut: ArchetypePerformance = {
    last_updated: now,
    data_period_days: dataPeriodDays,
    sample_size: sampleSize,
    by_archetype: archetypePerf,
    top_converting_archetype: topArchetype,
    insights: [],
  };

  const hookOut: HookToConversion = {
    last_updated: now,
    by_lead_source: sourcePerf,
    top_performing_source: topSource,
    insights: [],
  };

  const ltvOut: OfferToLtv = {
    last_updated: now,
    active_offer: readCurrentOffer(),
    avg_ltv_by_source: ltvBySource,
    insights: [],
  };

  const insights = await generateInsights(client, archetypeOut, hookOut);
  archetypeOut.insights = insights;
  hookOut.insights = insights;
  ltvOut.insights = insights;

  // Step 5+6 — Write files
  await writeAllFiles(archetypeOut, hookOut, ltvOut);
  updateBrainState(insights);

  printSyncReport(archetypeOut, hookOut, insights);

  return {
    success: true,
    sample_size: sampleSize,
    data_period_days: dataPeriodDays,
    top_converting_archetype: topArchetype,
    top_performing_source: topSource,
    insights,
  };
}

// --- Helpers ---

function readCurrentOffer(): string {
  try {
    const bs = fs.readFileSync(BRAIN_STATE, 'utf-8');
    const match = bs.match(/##\s*Active Offer[^\n]*\n([^\n#]+)/i);
    return match ? match[1].trim() : 'unknown';
  } catch { return 'unknown'; }
}

function buildEmptyArchetypeData(insights: string[]): ArchetypePerformance {
  const now = new Date().toISOString();
  return {
    last_updated: now,
    data_period_days: 0,
    sample_size: 0,
    by_archetype: {
      social: emptyMetrics(),
      analytical: emptyMetrics(),
      supportive: emptyMetrics(),
      independent: emptyMetrics(),
    },
    top_converting_archetype: 'unknown',
    insights,
  };
}

function buildEmptyHookData(insights: string[]): HookToConversion {
  const now = new Date().toISOString();
  return {
    last_updated: now,
    by_lead_source: {
      facebook_cold: emptySourceMetrics(),
      instagram_warm: emptySourceMetrics(),
      google_search: emptySourceMetrics(),
      referral: emptySourceMetrics(),
      free_pass: emptySourceMetrics(),
      lost_join: emptySourceMetrics(),
    },
    top_performing_source: 'unknown',
    insights,
  };
}

function buildEmptyLtvData(insights: string[]): OfferToLtv {
  return {
    last_updated: new Date().toISOString(),
    active_offer: readCurrentOffer(),
    avg_ltv_by_source: {},
    insights,
  };
}

async function writeAllFiles(arch: ArchetypePerformance, hook: HookToConversion, ltv: OfferToLtv): Promise<void> {
  fs.ensureDirSync(CROSS_BRAIN_DIR);
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'archetype-performance.json'), JSON.stringify(arch, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'hook-to-conversion.json'), JSON.stringify(hook, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'offer-to-ltv.json'), JSON.stringify(ltv, null, 2), 'utf-8');
  console.log(chalk.gray('  intelligence-db/cross-brain/ updated.'));
}

function updateBrainState(insights: string[]): void {
  try {
    let bs = fs.readFileSync(BRAIN_STATE, 'utf-8');
    const insightBlock = `\n## Cross-Brain Insights\n${insights.map(i => `- ${i}`).join('\n')}\n`;

    if (/##\s*Cross-Brain Insights/i.test(bs)) {
      bs = bs.replace(/##\s*Cross-Brain Insights[^\n]*\n([\s\S]*?)(?=\n##|$)/i, insightBlock);
    } else {
      bs += insightBlock;
    }

    fs.writeFileSync(BRAIN_STATE, bs, 'utf-8');
    console.log(chalk.gray('  Brain state updated with cross-brain insights.'));
  } catch (err) {
    logError('updateBrainState', err as Error);
  }
}

function printSyncReport(arch: ArchetypePerformance, hook: HookToConversion, insights: string[]): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  CROSS-BRAIN SYNC REPORT'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.gray('  Sample size:     ') + chalk.white(arch.sample_size + ' leads'));
  console.log(chalk.gray('  Data period:     ') + chalk.white(arch.data_period_days + ' days'));
  console.log(chalk.gray('  Top archetype:   ') + chalk.green(arch.top_converting_archetype));
  console.log(chalk.gray('  Top source:      ') + chalk.green(hook.top_performing_source));

  console.log(chalk.gray('\n  Archetype conversion rates:'));
  Object.entries(arch.by_archetype).forEach(([k, v]) => {
    const bar = v.conversion_rate > 0 ? `${v.conversion_rate}% (n=${v.sample_size})` : 'no data';
    console.log(chalk.gray(`    ${k.padEnd(15)} `) + chalk.white(bar));
  });

  if (insights.length > 0) {
    console.log(chalk.cyan('\n  Insights:'));
    insights.forEach(i => console.log(chalk.cyan('    · ') + chalk.white(i)));
  }

  console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

// --- CLI entry point ---

if (process.argv[1] && (process.argv[1].endsWith('cross-brain-sync.ts') || process.argv[1].endsWith('cross-brain-sync.js'))) {
  syncBrains()
    .then(() => process.exit(0))
    .catch((err: Error) => {
      console.error(chalk.red('\n[FATAL]'), err.message);
      process.exit(1);
    });
}
