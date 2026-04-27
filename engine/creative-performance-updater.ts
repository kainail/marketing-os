import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');

// --- Types ---

interface HookVisualPerformanceData {
  ctr: number | null;
  cpl: number | null;
  thumbstop_rate: number | null;
  test_runs: number;
  last_tested: string | null;
  status: 'untested' | 'testing' | 'winner' | 'loser' | 'retired';
}

interface PerformanceUpdate {
  hook_type: string;
  variant: string;
  ctr?: number;
  cpl?: number;
  thumbstop_rate?: number;
  status?: HookVisualPerformanceData['status'];
}

interface HookVisualMap {
  hook_types: Record<string, {
    variants: Record<string, {
      performance_data: HookVisualPerformanceData;
    }>;
  }>;
}

interface MetaPerformanceData {
  campaigns?: Array<{
    campaign_name?: string;
    ad_sets?: Array<{
      ad_set_name?: string;
      ads?: Array<{
        ad_name?: string;
        ctr?: number;
        cpl?: number;
        thumbstop_rate?: number;
        hook_type?: string;
        variant?: string;
      }>;
    }>;
  }>;
}

// --- Logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","creative-performance-updater","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Helpers ---

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Determine winner/loser/testing status from performance data.
 * Thresholds from knowledge-base/paid-media/thresholds.md:
 * CPL kill zone: $60+, target: $30
 * Thumbstop kill: below 20%, strong: above 40%
 */
function resolveStatus(perf: HookVisualPerformanceData): HookVisualPerformanceData['status'] {
  if (perf.test_runs < 1) return 'untested';

  // Kill zone — retire immediately
  if (perf.cpl !== null && perf.cpl >= 60) return 'loser';
  if (perf.thumbstop_rate !== null && perf.thumbstop_rate < 20) return 'loser';

  // Winner thresholds
  if (perf.cpl !== null && perf.cpl <= 30 && perf.thumbstop_rate !== null && perf.thumbstop_rate >= 40) {
    return 'winner';
  }

  // Active testing
  if (perf.test_runs > 0) return 'testing';

  return 'untested';
}

/**
 * Apply a batch of performance updates to hook-visual-map.json.
 * Called by the paid-ads-analyzer Manus task result processor.
 */
export function applyPerformanceUpdates(updates: PerformanceUpdate[]): { updated: number; errors: number } {
  const mapPath = path.join(ROOT, 'knowledge-base', 'creative', 'hook-visual-map.json');
  const hookMap = readJson<HookVisualMap>(mapPath);

  if (!hookMap) {
    console.log(chalk.red('  [creative-performance-updater] hook-visual-map.json not found'));
    return { updated: 0, errors: updates.length };
  }

  let updated = 0;
  let errors = 0;

  for (const update of updates) {
    const hookConfig = hookMap.hook_types[update.hook_type];
    if (!hookConfig) {
      console.log(chalk.yellow(`  [creative-performance-updater] Unknown hook type: ${update.hook_type}`));
      errors++;
      continue;
    }

    const variantConfig = hookConfig.variants[update.variant];
    if (!variantConfig) {
      console.log(chalk.yellow(`  [creative-performance-updater] No variant ${update.variant} for ${update.hook_type}`));
      errors++;
      continue;
    }

    const perf = variantConfig.performance_data;

    if (update.ctr !== undefined)            perf.ctr = update.ctr;
    if (update.cpl !== undefined)            perf.cpl = update.cpl;
    if (update.thumbstop_rate !== undefined) perf.thumbstop_rate = update.thumbstop_rate;

    perf.test_runs += 1;
    perf.last_tested = new Date().toISOString().slice(0, 10);
    perf.status = update.status ?? resolveStatus(perf);

    console.log(chalk.gray(
      `  [creative-performance-updater] ${update.hook_type}-${update.variant}: ` +
      `CTR=${perf.ctr ?? '—'}% CPL=$${perf.cpl ?? '—'} thumbstop=${perf.thumbstop_rate ?? '—'}% → ${perf.status}`
    ));
    updated++;
  }

  try {
    fs.writeFileSync(mapPath, JSON.stringify(hookMap, null, 2), 'utf-8');
    console.log(chalk.green(`  [creative-performance-updater] ${updated} variant(s) updated in hook-visual-map.json`));
  } catch (err) {
    logError('applyPerformanceUpdates:write', err as Error);
    errors += updated;
    updated = 0;
  }

  return { updated, errors };
}

/**
 * Read meta-performance.json (written by paid-ads-analyzer Manus task)
 * and extract image performance data for hook-visual-map updates.
 */
export function syncFromMetaPerformance(): { updated: number; errors: number } {
  const metaPath = path.join(ROOT, 'intelligence-db', 'paid', 'meta-performance.json');
  const metaData = readJson<MetaPerformanceData>(metaPath);

  if (!metaData) {
    console.log(chalk.yellow('  [creative-performance-updater] meta-performance.json not found — run paid-ads-analyzer first'));
    return { updated: 0, errors: 0 };
  }

  const updates: PerformanceUpdate[] = [];

  // Extract per-ad performance and map to hook_type/variant
  for (const campaign of (metaData.campaigns ?? [])) {
    for (const adSet of (campaign.ad_sets ?? [])) {
      for (const ad of (adSet.ads ?? [])) {
        if (!ad.hook_type || !ad.variant) continue;
        updates.push({
          hook_type: ad.hook_type,
          variant: ad.variant,
          ctr: ad.ctr,
          cpl: ad.cpl,
          thumbstop_rate: ad.thumbstop_rate,
        });
      }
    }
  }

  if (updates.length === 0) {
    console.log(chalk.gray('  [creative-performance-updater] No image ad performance data found in meta-performance.json'));
    return { updated: 0, errors: 0 };
  }

  return applyPerformanceUpdates(updates);
}

/**
 * Print a summary of current hook-visual-map performance data.
 */
export function printPerformanceSummary(): void {
  const mapPath = path.join(ROOT, 'knowledge-base', 'creative', 'hook-visual-map.json');
  const hookMap = readJson<HookVisualMap>(mapPath);

  if (!hookMap) {
    console.log(chalk.red('  hook-visual-map.json not found'));
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  CREATIVE PERFORMANCE SUMMARY — hook-visual-map.json'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  for (const [hookType, config] of Object.entries(hookMap.hook_types)) {
    console.log(chalk.yellow(`\n  ${hookType}`));
    for (const [variant, vConfig] of Object.entries(config.variants)) {
      const p = vConfig.performance_data;
      const statusColor = p.status === 'winner'
        ? chalk.green
        : p.status === 'loser'
          ? chalk.red
          : p.status === 'testing'
            ? chalk.yellow
            : chalk.gray;

      const metrics = [
        p.ctr !== null ? `CTR ${p.ctr}%` : 'CTR —',
        p.cpl !== null ? `CPL $${p.cpl}` : 'CPL —',
        p.thumbstop_rate !== null ? `thumbstop ${p.thumbstop_rate}%` : 'thumbstop —',
      ].join(' | ');

      console.log(
        chalk.gray(`    ${variant}: `) +
        statusColor(p.status.padEnd(10)) +
        chalk.gray(` ${metrics}  runs=${p.test_runs}`)
      );
    }
  }

  console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

// --- CLI entry point ---

if (process.argv[1] && (process.argv[1].endsWith('creative-performance-updater.ts') || process.argv[1].endsWith('creative-performance-updater.js'))) {
  const command = process.argv[2] ?? 'summary';

  if (command === 'sync') {
    const result = syncFromMetaPerformance();
    console.log(`\n  Done — ${result.updated} updated, ${result.errors} errors\n`);
  } else if (command === 'summary') {
    printPerformanceSummary();
  } else {
    console.log('Usage: tsx engine/creative-performance-updater.ts [sync|summary]');
  }

  process.exit(0);
}
