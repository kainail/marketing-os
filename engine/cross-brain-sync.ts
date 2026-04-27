import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as driveModule from './drive.js';

const ROOT = process.cwd();
const ERRORS_CSV      = path.join(ROOT, 'logs', 'errors.csv');
const BRAIN_STATE     = path.join(ROOT, 'brain-state', 'current-state.md');
const CROSS_BRAIN_DIR = path.join(ROOT, 'intelligence-db', 'cross-brain');
const AVATAR_DIR      = path.join(ROOT, 'intelligence-db', 'avatar');
const PATTERNS_DIR    = path.join(ROOT, 'intelligence-db', 'patterns');
const COACHING_ALERTS = path.join(ROOT, 'logs', 'coaching-alerts.csv');

// --- Fixed column indices: A=0 through S=18 ---
// Source: AI Transcript Review → Sheet1

const COL = {
  timestamp:         0,  // A
  transcript:        1,  // B
  opener_score:      2,  // C
  human_feel_score:  3,  // D
  flow_score:        4,  // E
  stage_reached:     5,  // F
  main_objection:    6,  // G
  drop_off_moment:   7,  // H
  failure_reason:    8,  // I
  suggested_fix:     9,  // J
  contact_id:        10, // K
  rep_name:          11, // L
  lead_source:       12, // M
  subaccount_name:   13, // N
  call_direction:    14, // O
  overall_score:     15, // P
  script_deviation:  16, // Q
  archetype_detected:17, // R
  coaching_priority: 18, // S
} as const;

// --- Types ---

interface ArchetypeStats {
  call_count: number;
  booking_rate: number;
  show_rate: number;
  avg_score: number;
  top_objection: string;
  drop_off_pattern: string;
}

interface ArchetypePerformanceOutput {
  last_updated: string;
  data_source: string;
  data_period: string;
  sample_size: number;
  filter_applied: string;
  by_archetype: {
    social: ArchetypeStats;
    analytical: ArchetypeStats;
    supportive: ArchetypeStats;
    independent: ArchetypeStats;
    unknown: { call_count: number };
  };
  top_converting_archetype: string;
  lowest_converting_archetype: string;
  drop_off_patterns: Record<string, string>;
  insights: string[];
}

interface SourceStats {
  call_count: number;
  booking_rate: number;
  show_rate: number;
  avg_score: number;
}

interface HookToConversionOutput {
  last_updated: string;
  sample_size: number;
  by_lead_source: Record<string, SourceStats>;
  top_performing_source: string;
  lowest_performing_source: string;
  insights: string[];
}

interface OfferToLtvOutput {
  last_updated: string;
  note: string;
  active_offer: string;
  insights: string[];
}

export interface SyncReport {
  success: boolean;
  sample_size: number;
  top_converting_archetype: string;
  top_performing_source: string;
  insights: string[];
  error?: string;
}

// --- Accumulation types ---

interface ArchetypeAccum {
  total: number;
  booked: number;
  showed: number;
  score_sum: number;
  score_count: number;
  objections: Record<string, number>;
  drop_offs: Record<string, number>;
}

interface SourceAccum {
  total: number;
  booked: number;
  showed: number;
  score_sum: number;
  score_count: number;
}

interface RepAccum {
  score_sum: number;
  score_count: number;
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

// --- Cell helpers ---

function cell(row: string[], idx: number): string {
  return (row[idx] ?? '').trim();
}

function cellLower(row: string[], idx: number): string {
  return cell(row, idx).toLowerCase();
}

function safeFloat(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function isOutbound(row: string[]): boolean {
  return cellLower(row, COL.call_direction) === 'outbound';
}

function isBooked(row: string[]): boolean {
  return cellLower(row, COL.stage_reached).includes('book');
}

function isShowed(row: string[]): boolean {
  const stage = cellLower(row, COL.stage_reached);
  return stage.includes('show') || stage.includes('answered');
}

function isHeaderRow(row: string[]): boolean {
  // Detect if row 0 is a header row: opener_score cell should be a number in data rows
  const v = cell(row, COL.opener_score).toLowerCase();
  return isNaN(parseFloat(v)) && v.length > 0;
}

function normalizeArchetype(raw: string): 'social' | 'analytical' | 'supportive' | 'independent' | 'unknown' {
  const v = raw.toLowerCase().trim();
  if (!v || v === 'unknown' || v === 'n/a' || v === 'null') return 'unknown';
  if (v.includes('social') || v === 'a' || v.includes('community') || v.includes('outgoing')) return 'social';
  if (v.includes('analytical') || v === 'b' || v.includes('data') || v.includes('detail') || v.includes('thinker')) return 'analytical';
  if (v.includes('support') || v === 'c' || v.includes('nurt') || v.includes('caring')) return 'supportive';
  if (v.includes('independ') || v === 'd' || v.includes('solo') || v.includes('autonom') || v.includes('self-dir')) return 'independent';
  return 'unknown';
}

function isValidObjection(raw: string): boolean {
  const v = raw.toLowerCase().trim();
  return !(!v || v === 'n/a' || v === 'null' || v === 'none');
}

function topKey(counts: Record<string, number>): string {
  let top = '';
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { max = v; top = k; }
  }
  return top || 'none';
}

function emptyArchetypeAccum(): ArchetypeAccum {
  return { total: 0, booked: 0, showed: 0, score_sum: 0, score_count: 0, objections: {}, drop_offs: {} };
}

// --- Data period helpers ---

function detectDataPeriod(rows: string[][]): string {
  const dates: number[] = [];
  for (const row of rows) {
    const raw = cell(row, COL.timestamp);
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!isNaN(ts)) dates.push(ts);
  }
  if (dates.length < 2) return 'all time';
  const min = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const max = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  return min === max ? min : `${min} to ${max}`;
}

// --- Coaching alerts ---

function ensureCoachingAlertsHeader(): void {
  fs.ensureDirSync(path.join(ROOT, 'logs'));
  if (!fs.existsSync(COACHING_ALERTS)) {
    fs.writeFileSync(COACHING_ALERTS, 'timestamp,rep_name,avg_score,call_count,alert_type\n', 'utf-8');
  }
}

function appendCoachingAlert(repName: string, avgScore: number, callCount: number): void {
  ensureCoachingAlertsHeader();
  const line = `"${new Date().toISOString()}","${repName}","${avgScore.toFixed(2)}","${callCount}","low_score_alert"\n`;
  fs.appendFileSync(COACHING_ALERTS, line);
}

// --- Secondary sheet merge ---

async function mergeSecondarySheet(_primaryRows: string[][], spreadsheetId: string): Promise<Map<string, number>> {
  const scoreBoosts = new Map<string, number>();
  try {
    const secondary = await driveModule.readSheet(spreadsheetId, 'Sheet1');
    if (secondary.length < 2) return scoreBoosts;

    const headers = (secondary[0] ?? []).map(h => (h ?? '').toLowerCase().trim());
    const contactIdx = headers.findIndex(h => h.includes('contact') || h.includes('id'));
    const scoreIdx = headers.findIndex(h => h.includes('score') || h.includes('quality') || h.includes('rating'));

    if (contactIdx < 0 || scoreIdx < 0) return scoreBoosts;

    for (const row of secondary.slice(1)) {
      const contactId = (row[contactIdx] ?? '').trim();
      const score = safeFloat((row[scoreIdx] ?? '').trim());
      if (contactId && score !== null) {
        scoreBoosts.set(contactId, score);
      }
    }
  } catch {
    // secondary sheet unavailable — non-fatal
  }
  return scoreBoosts;
}

// --- Read brain state ---

function readCurrentOffer(): string {
  try {
    const bs = fs.readFileSync(BRAIN_STATE, 'utf-8');
    const match = bs.match(/##\s*Active Offer[^\n]*\n([^\n#]+)/i);
    return match ? match[1].trim() : 'unknown';
  } catch { return 'unknown'; }
}

// --- Insight generation ---

async function generateInsights(client: Anthropic, metricsPayload: object): Promise<string[]> {
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: `You are AHRI's intelligence analyst. You have just processed real performance data from GymSuite AI's Jessica voice agent. Generate 5 specific, actionable insights that tell AHRI exactly how to change her marketing generation to improve results. Each insight must name: the specific metric, the specific finding, and the specific change AHRI should make. Do not give general advice. Be precise.

Format each insight as:
INSIGHT [N]: [metric] shows [finding]. AHRI should [specific action].

Example of the precision required:
"INSIGHT 1: Supportive archetype booking rate is 34% vs 19% for Independent. AHRI should weight Supportive-toned hooks 2:1 over Independent hooks in cold Facebook ad generation and prioritize the supportive archetype sequence in content calendar Week 2."

Return exactly 5 insights, each on its own line, in the INSIGHT [N]: format. No other text.`,
      messages: [{
        role: 'user',
        content: `Here is the performance data:\n${JSON.stringify(metricsPayload, null, 2)}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const lines = text.split('\n').filter(l => l.trim().startsWith('INSIGHT'));
    return lines.length > 0 ? lines : ['Insufficient data for specific insights — re-run after 20+ outbound calls are logged.'];
  } catch (err) {
    logError('generateInsights', err as Error);
    return ['Insight generation failed — re-run sync after verifying ANTHROPIC_API_KEY.'];
  }
}

// --- Write helpers ---

function writeNoDataFiles(message: string): void {
  fs.ensureDirSync(CROSS_BRAIN_DIR);
  const noDataPayload = {
    last_updated: new Date().toISOString(),
    status: 'no_data',
    message,
    sample_size: 0,
    insights: ['Insufficient data for insights. Re-run sync after 20+ outbound calls are logged.'],
  };
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'archetype-performance.json'), JSON.stringify(noDataPayload, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'hook-to-conversion.json'), JSON.stringify(noDataPayload, null, 2), 'utf-8');
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'offer-to-ltv.json'), JSON.stringify({
    ...noDataPayload,
    active_offer: readCurrentOffer(),
  }, null, 2), 'utf-8');
}

function writeArchetypeFile(data: ArchetypePerformanceOutput): void {
  fs.ensureDirSync(CROSS_BRAIN_DIR);
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'archetype-performance.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function writeHookFile(data: HookToConversionOutput): void {
  fs.ensureDirSync(CROSS_BRAIN_DIR);
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'hook-to-conversion.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function writeLtvFile(data: OfferToLtvOutput): void {
  fs.ensureDirSync(CROSS_BRAIN_DIR);
  fs.writeFileSync(path.join(CROSS_BRAIN_DIR, 'offer-to-ltv.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function writeObjectionsFile(objectionCounts: Record<string, number>): void {
  fs.ensureDirSync(AVATAR_DIR);
  const sorted = Object.entries(objectionCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([objection, count]) => ({ objection, count }));
  const payload = {
    last_updated: new Date().toISOString(),
    data_source: 'AI Transcript Review — Sheet1 column G',
    total_objections_logged: sorted.reduce((s, o) => s + o.count, 0),
    by_frequency: sorted,
  };
  fs.writeFileSync(path.join(AVATAR_DIR, 'objections.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function writeWinningPatternsFile(insights: string[], topArchetype: string, topSource: string): void {
  fs.ensureDirSync(PATTERNS_DIR);
  const existing = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(PATTERNS_DIR, 'winning-patterns.json'), 'utf-8')) as Record<string, unknown>;
    } catch { return {}; }
  })();
  const updated = {
    ...existing,
    last_updated: new Date().toISOString(),
    cross_brain_insights: insights,
    top_converting_archetype: topArchetype,
    top_performing_source: topSource,
  };
  fs.writeFileSync(path.join(PATTERNS_DIR, 'winning-patterns.json'), JSON.stringify(updated, null, 2), 'utf-8');
}

function updateBrainState(insights: string[], datePart: string): void {
  try {
    let bs = fs.readFileSync(BRAIN_STATE, 'utf-8');
    const insightBlock = `\n## Cross-Brain Insights (updated ${datePart})\n${insights.map(i => `- ${i}`).join('\n')}\n`;

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

function updateBrainStateTopObjections(top3: string[]): void {
  try {
    let bs = fs.readFileSync(BRAIN_STATE, 'utf-8');
    const topObj = top3.join(' / ');
    if (/##\s*Top Objection This Month/i.test(bs)) {
      bs = bs.replace(
        /(##\s*Top Objection This Month[^\n]*\n)([^\n#]*)/i,
        `$1${topObj}`
      );
      fs.writeFileSync(BRAIN_STATE, bs, 'utf-8');
    }
  } catch { /* non-fatal */ }
}

// --- Main sync ---

export async function syncBrains(): Promise<SyncReport> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY not set');
    logError('syncBrains', err);
    console.log(chalk.red('\n  Cross-brain sync failed — ANTHROPIC_API_KEY not set. Check .env for ANTHROPIC_API_KEY.'));
    throw err;
  }
  const client = new Anthropic({ apiKey });

  const spreadsheetId = process.env['GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID'];
  const callReviewId  = process.env['GOOGLE_SHEETS_CALL_REVIEW_ID'];

  // --- No credentials path ---
  if (!spreadsheetId) {
    console.log(chalk.yellow('\n  [Cross-Brain Sync] GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID not set.'));
    console.log(chalk.gray('  Cross-brain sync complete — no call data yet. AHRI will generate from frameworks until real data is available. Re-run after calls are logged.\n'));

    writeNoDataFiles('GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID not set in .env. Add the spreadsheet ID of the AI Transcript Review sheet to enable cross-brain sync.');
    ensureCoachingAlertsHeader();
    updateBrainState([
      'No GymSuite AI data available yet — set GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID in .env to enable cross-brain sync.',
      'Once connected, AHRI will automatically adjust content strategy based on archetype conversion rates.',
      'High-converting archetypes will receive more content budget allocation when data is available.',
    ], new Date().toISOString().slice(0, 10));

    return {
      success: false,
      sample_size: 0,
      top_converting_archetype: 'unknown',
      top_performing_source: 'unknown',
      insights: ['GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID not configured.'],
      error: 'GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID not set',
    };
  }

  console.log(chalk.bold.cyan('\n  [Cross-Brain Sync] Reading AI Transcript Review...\n'));

  // --- Read primary sheet ---
  let allRows: string[][];
  try {
    allRows = await driveModule.readSheet(spreadsheetId, 'Sheet1');
  } catch (err) {
    const msg = `Failed to read AI Transcript Review: ${(err as Error).message}`;
    logError('readSheet:primary', err as Error);
    console.log(chalk.red(`  Cross-brain sync failed — ${msg}. Check .env for GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID.`));
    writeNoDataFiles(msg);
    ensureCoachingAlertsHeader();
    return { success: false, sample_size: 0, top_converting_archetype: 'unknown', top_performing_source: 'unknown', insights: [], error: msg };
  }

  // Skip header row if present
  const hasHeader = allRows.length > 0 && isHeaderRow(allRows[0]);
  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  // Filter to non-empty rows
  const validRows = dataRows.filter(row => row.some(c => (c ?? '').trim()));

  if (validRows.length === 0) {
    const msg = 'AI Transcript Review has no call data yet. Sync will populate automatically as Jessica completes calls and data flows into the sheet.';
    console.log(chalk.yellow(`\n  Cross-brain sync complete — no call data yet. AHRI will generate from frameworks until real data is available. Re-run after calls are logged.`));
    writeNoDataFiles(msg);
    ensureCoachingAlertsHeader();
    return { success: false, sample_size: 0, top_converting_archetype: 'unknown', top_performing_source: 'unknown', insights: ['Insufficient data for insights. Re-run sync after 20+ outbound calls are logged.'], error: msg };
  }

  console.log(chalk.gray(`  Total rows: ${validRows.length}`));

  // Filter to outbound only
  const outboundRows = validRows.filter(isOutbound);
  console.log(chalk.gray(`  Outbound calls: ${outboundRows.length}`));

  if (outboundRows.length === 0) {
    const msg = 'No outbound calls found in dataset. Ensure column O contains "outbound" for outbound calls.';
    console.log(chalk.yellow(`  ${msg}`));
    writeNoDataFiles(msg);
    ensureCoachingAlertsHeader();
    return { success: false, sample_size: 0, top_converting_archetype: 'unknown', top_performing_source: 'unknown', insights: [], error: msg };
  }

  // --- Read secondary sheet (optional merge) ---
  const secondaryScores = callReviewId ? await mergeSecondarySheet(outboundRows, callReviewId) : new Map<string, number>();
  if (secondaryScores.size > 0) {
    console.log(chalk.gray(`  Secondary sheet (AI Call Review): ${secondaryScores.size} records merged`));
  }

  const datePeriod = detectDataPeriod(outboundRows);
  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);
  const sampleSize = outboundRows.length;

  // --- Calculation 1 & 2: Booking/show by source and archetype ---

  const archetypeMap: Record<string, ArchetypeAccum> = {
    social: emptyArchetypeAccum(),
    analytical: emptyArchetypeAccum(),
    supportive: emptyArchetypeAccum(),
    independent: emptyArchetypeAccum(),
  };
  let unknownArchetypeCount = 0;

  const sourceMap: Record<string, SourceAccum> = {};

  // Calculation 5: drop-off analysis
  const dropOffCounts: Record<string, number> = {};
  const failureReasonCounts: Record<string, number> = {};

  // Calculation 4: objections
  const objectionCounts: Record<string, number> = {};

  // Calculation 6: rep performance
  const repAccum: Record<string, RepAccum> = {};

  // Calculation 8: score correlation
  const highScore = { total: 0, booked: 0 };
  const lowScore  = { total: 0, booked: 0 };

  for (const row of outboundRows) {
    const booked = isBooked(row);
    const showed = isShowed(row);
    const archetype = normalizeArchetype(cell(row, COL.archetype_detected));
    const source = cell(row, COL.lead_source) || 'unknown';
    const repName = cell(row, COL.rep_name);
    const objection = cell(row, COL.main_objection);
    const dropOff = cell(row, COL.drop_off_moment);
    const failureReason = cell(row, COL.failure_reason);
    const contactId = cell(row, COL.contact_id);

    // Get score — prefer secondary sheet merge if available
    const rawScore = secondaryScores.get(contactId) ?? safeFloat(cell(row, COL.overall_score));
    const score = rawScore !== null && rawScore > 0 ? rawScore : null;

    // --- Archetype accumulation ---
    if (archetype === 'unknown') {
      unknownArchetypeCount++;
    } else {
      const a = archetypeMap[archetype];
      a.total++;
      if (booked) a.booked++;
      if (showed) a.showed++;
      if (score !== null) { a.score_sum += score; a.score_count++; }
      if (isValidObjection(objection)) {
        a.objections[objection] = (a.objections[objection] ?? 0) + 1;
      }
      if (dropOff && dropOff.toLowerCase() !== 'n/a' && dropOff.toLowerCase() !== 'null') {
        a.drop_offs[dropOff] = (a.drop_offs[dropOff] ?? 0) + 1;
      }
    }

    // --- Source accumulation (calc 1 & 3) ---
    if (!sourceMap[source]) {
      sourceMap[source] = { total: 0, booked: 0, showed: 0, score_sum: 0, score_count: 0 };
    }
    sourceMap[source].total++;
    if (booked) sourceMap[source].booked++;
    if (showed) sourceMap[source].showed++;
    if (score !== null) { sourceMap[source].score_sum += score; sourceMap[source].score_count++; }

    // --- Objection accumulation (calc 4) ---
    if (isValidObjection(objection)) {
      objectionCounts[objection] = (objectionCounts[objection] ?? 0) + 1;
    }

    // --- Drop-off accumulation (calc 5) ---
    if (dropOff && dropOff.toLowerCase() !== 'n/a' && dropOff.toLowerCase() !== 'null') {
      dropOffCounts[dropOff] = (dropOffCounts[dropOff] ?? 0) + 1;
    }
    if (failureReason && failureReason.toLowerCase() !== 'n/a' && failureReason.toLowerCase() !== 'null') {
      failureReasonCounts[failureReason] = (failureReasonCounts[failureReason] ?? 0) + 1;
    }

    // --- Rep accumulation (calc 6) ---
    if (repName && score !== null) {
      if (!repAccum[repName]) repAccum[repName] = { score_sum: 0, score_count: 0 };
      repAccum[repName].score_sum += score;
      repAccum[repName].score_count++;
    }

    // --- Score correlation (calc 8) ---
    if (score !== null) {
      if (score >= 7) { highScore.total++; if (booked) highScore.booked++; }
      else            { lowScore.total++;  if (booked) lowScore.booked++;  }
    }
  }

  // --- Build archetype output ---

  const archetypeKeys = ['social', 'analytical', 'supportive', 'independent'] as const;

  const byArchetype: Record<string, ArchetypeStats> = {};
  for (const key of archetypeKeys) {
    const a = archetypeMap[key];
    byArchetype[key] = {
      call_count: a.total,
      booking_rate: safeRate(a.booked, a.total),
      show_rate: safeRate(a.showed, a.total),
      avg_score: a.score_count > 0 ? Math.round((a.score_sum / a.score_count) * 10) / 10 : 0,
      top_objection: topKey(a.objections) || 'none logged',
      drop_off_pattern: topKey(a.drop_offs) || 'none logged',
    };
  }

  // Rank archetypes by booking rate
  const sortedArchetypes = archetypeKeys
    .filter(k => byArchetype[k].call_count >= 3)
    .sort((a, b) => byArchetype[b].booking_rate - byArchetype[a].booking_rate);

  const topArchetype = sortedArchetypes[0] ?? 'insufficient data';
  const lowestArchetype = sortedArchetypes[sortedArchetypes.length - 1] ?? 'insufficient data';

  const dropOffPatterns: Record<string, string> = {};
  for (const key of archetypeKeys) {
    const a = archetypeMap[key];
    const top = topKey(a.drop_offs);
    if (top && top !== 'none') dropOffPatterns[key] = top;
  }

  // --- Build source output (calc 1 & 3, min 3 calls) ---

  const byLeadSource: Record<string, SourceStats> = {};
  for (const [src, s] of Object.entries(sourceMap)) {
    if (s.total < 3) continue; // minimum sample requirement
    byLeadSource[src] = {
      call_count: s.total,
      booking_rate: safeRate(s.booked, s.total),
      show_rate: safeRate(s.showed, s.total),
      avg_score: s.score_count > 0 ? Math.round((s.score_sum / s.score_count) * 10) / 10 : 0,
    };
  }

  const sortedSources = Object.entries(byLeadSource).sort(([, a], [, b]) => b.booking_rate - a.booking_rate);
  const topSource = sortedSources[0]?.[0] ?? 'insufficient data';
  const lowestSource = sortedSources[sortedSources.length - 1]?.[0] ?? 'insufficient data';

  // --- Calc 4: Top 3 objections → brain state ---

  const top3Objections = Object.entries(objectionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => k);

  // --- Calc 5: Most common drop-off and failure reason ---

  const topDropOff = topKey(dropOffCounts);
  const topFailureReason = topKey(failureReasonCounts);

  // --- Calc 6: Rep performance → coaching alerts ---

  ensureCoachingAlertsHeader();
  for (const [repName, r] of Object.entries(repAccum)) {
    if (r.score_count === 0) continue;
    const avgScore = Math.round((r.score_sum / r.score_count) * 100) / 100;
    if (avgScore < 6.0) {
      appendCoachingAlert(repName, avgScore, r.score_count);
      console.log(chalk.yellow(`  [Coaching Alert] ${repName}: avg score ${avgScore.toFixed(2)} across ${r.score_count} calls`));
    }
  }

  // --- Calc 8: Score correlation ---

  const highBookingRate = safeRate(highScore.booked, highScore.total);
  const lowBookingRate  = safeRate(lowScore.booked, lowScore.total);
  const correlationInsight = (highBookingRate > 0 && lowBookingRate > 0 && highBookingRate >= lowBookingRate * 1.5)
    ? `Script quality significantly impacts booking rate: high-scoring calls (≥7) book at ${highBookingRate}% vs ${lowBookingRate}% for low-scoring calls — a ${Math.round(highBookingRate / lowBookingRate * 10) / 10}x difference.`
    : null;

  // --- Generate insights ---

  console.log(chalk.gray('  Generating insights via claude-opus-4-6...'));

  const metricsPayload = {
    sample_size: sampleSize,
    data_period: datePeriod,
    archetype_performance: byArchetype,
    source_performance: byLeadSource,
    top_archetype: topArchetype,
    lowest_archetype: lowestArchetype,
    top_source: topSource,
    top_objections: top3Objections,
    most_common_drop_off: topDropOff,
    most_common_failure_reason: topFailureReason,
    score_correlation: { high_scoring_booking_rate: highBookingRate, low_scoring_booking_rate: lowBookingRate },
    archetype_drop_off_patterns: dropOffPatterns,
  };

  const insights = await generateInsights(client, metricsPayload);
  if (correlationInsight) insights.push(`INSIGHT 6: ${correlationInsight}`);

  // --- Assemble output files ---

  const archetypeOutput: ArchetypePerformanceOutput = {
    last_updated: now,
    data_source: 'AI Transcript Review — Sheet1',
    data_period: datePeriod,
    sample_size: sampleSize,
    filter_applied: 'outbound calls only',
    by_archetype: {
      social:      byArchetype['social'] as ArchetypeStats,
      analytical:  byArchetype['analytical'] as ArchetypeStats,
      supportive:  byArchetype['supportive'] as ArchetypeStats,
      independent: byArchetype['independent'] as ArchetypeStats,
      unknown:     { call_count: unknownArchetypeCount },
    },
    top_converting_archetype: topArchetype,
    lowest_converting_archetype: lowestArchetype,
    drop_off_patterns: dropOffPatterns,
    insights,
  };

  const hookOutput: HookToConversionOutput = {
    last_updated: now,
    sample_size: sampleSize,
    by_lead_source: byLeadSource,
    top_performing_source: topSource,
    lowest_performing_source: lowestSource,
    insights,
  };

  const ltvOutput: OfferToLtvOutput = {
    last_updated: now,
    note: 'LTV data not yet available — populate when member revenue data exists',
    active_offer: readCurrentOffer(),
    insights: [],
  };

  // --- Write all files ---

  writeArchetypeFile(archetypeOutput);
  writeHookFile(hookOutput);
  writeLtvFile(ltvOutput);
  writeObjectionsFile(objectionCounts);
  writeWinningPatternsFile(insights, topArchetype, topSource);
  updateBrainState(insights, todayStr);
  if (top3Objections.length > 0) updateBrainStateTopObjections(top3Objections);

  // Sync creative performance data if meta-performance.json has been updated
  try {
    const { syncFromMetaPerformance } = await import('./creative-performance-updater.js');
    const creativeSync = syncFromMetaPerformance();
    if (creativeSync.updated > 0) {
      console.log(chalk.gray(`  hook-visual-map.json updated: ${creativeSync.updated} creative variant(s) synced.`));
    }
  } catch {
    // creative-performance-updater is non-fatal — cross-brain sync continues
  }

  console.log(chalk.gray('  intelligence-db/cross-brain/ updated.'));
  console.log(chalk.gray('  intelligence-db/avatar/objections.json updated.'));

  // --- Print report ---

  printSyncReport(archetypeOutput, hookOutput, insights, topDropOff, topFailureReason);

  return {
    success: true,
    sample_size: sampleSize,
    top_converting_archetype: topArchetype,
    top_performing_source: topSource,
    insights,
  };
}

// --- Report printer ---

function printSyncReport(
  arch: ArchetypePerformanceOutput,
  hook: HookToConversionOutput,
  insights: string[],
  topDropOff: string,
  topFailureReason: string
): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  CROSS-BRAIN SYNC REPORT'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.gray('  Source:          ') + chalk.white('AI Transcript Review — Sheet1'));
  console.log(chalk.gray('  Sample size:     ') + chalk.white(`${arch.sample_size} outbound calls`));
  console.log(chalk.gray('  Data period:     ') + chalk.white(arch.data_period));
  console.log(chalk.gray('  Top archetype:   ') + chalk.green(arch.top_converting_archetype));
  console.log(chalk.gray('  Top source:      ') + chalk.green(hook.top_performing_source));
  if (topDropOff && topDropOff !== 'none') {
    console.log(chalk.gray('  Top drop-off:    ') + chalk.yellow(topDropOff));
  }
  if (topFailureReason && topFailureReason !== 'none') {
    console.log(chalk.gray('  Top failure:     ') + chalk.yellow(topFailureReason));
  }

  console.log(chalk.gray('\n  Booking rates by archetype:'));
  const archetypeKeys = ['social', 'analytical', 'supportive', 'independent'] as const;
  for (const k of archetypeKeys) {
    const s = arch.by_archetype[k];
    const bar = s.call_count >= 3 ? `${s.booking_rate}%  (n=${s.call_count}, avg score ${s.avg_score})` : `n=${s.call_count} (below min sample)`;
    console.log(chalk.gray(`    ${k.padEnd(15)} `) + chalk.white(bar));
  }

  if (Object.keys(hook.by_lead_source).length > 0) {
    console.log(chalk.gray('\n  Booking rates by source:'));
    for (const [src, s] of Object.entries(hook.by_lead_source)) {
      console.log(chalk.gray(`    ${src.padEnd(20)} `) + chalk.white(`${s.booking_rate}%  (n=${s.call_count})`));
    }
  }

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
