import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { createInterface, Interface as RLInterface } from 'readline';
import { spawn } from 'child_process';
import { getFunnelPage, updatePageElement, publishPage } from './ghl-funnel';
import { validateSmsContent, resolveWorkflowId, updateWorkflowStep, parseNurtureSync } from './ghl-workflows';

const ROOT = process.cwd();
const VERSION = '1.4.0';
const VOICE_MODE = process.argv.includes('--voice');

// --- Paths ---

const BRAIN_STATE   = path.join(ROOT, 'brain-state', 'current-state.md');
const PENDING_DIR   = path.join(ROOT, 'distribution', 'queue', 'pending-review');
const READY_DIR     = path.join(ROOT, 'distribution', 'queue', 'ready-to-post');
const ASSET_LOG     = path.join(ROOT, 'performance', 'asset-log.csv');
const SESSION_LOG   = path.join(ROOT, 'logs', 'session-log.csv');
const SESSION_HIST  = path.join(ROOT, 'logs', 'session-history.json');
const BIZ_CONTEXT   = path.join(ROOT, 'business-context');
const CROSS_BRAIN   = path.join(ROOT, 'intelligence-db', 'cross-brain');

// --- Types ---

interface SessionContext {
  activeOffer: string;
  activeAvatar: string;
  activeBusiness: string;
  lastSkillRun: string;
  lastOutputPaths: string[];
  lastAssetIds: string[];
  sessionActions: string[];
  sessionStartTime: Date;
}

interface ParsedIntent {
  intent: IntentType;
  skills: string[];
  context: string;
  avatar_override: string | null;
  awareness_override: number | null;
  budget_required: boolean;
  message: string;
}

type IntentType =
  | 'generate_skill'
  | 'batch_generate'
  | 'review_queue'
  | 'update_brain_state'
  | 'show_status'
  | 'run_campaign'
  | 'switch_context'
  | 'get_help'
  | 'sync_media'
  | 'sync_brains'
  | 'update_funnel'
  | 'update_workflows'
  | 'run_manus_task'
  | 'show_routines'
  | 'run_routine_manually'
  | 'analyze_paid_ads'
  | 'analyze_google_ads'
  | 'check_budget_pacing'
  | 'track_lead_journey'
  | 'analyze_landing_page'
  | 'analyze_nurture'
  | 'check_retention'
  | 'monitor_reviews'
  | 'track_referrals'
  | 'audit_gbp'
  | 'clean_crm'
  | 'generate_monthly_report'
  | 'process_manus_results'
  | 'exit';

interface SessionHistoryEntry {
  date: string;
  duration_minutes: number;
  actions: string[];
  assets_generated: number;
  assets_approved: number;
  brain_state_updates: string[];
  notes: string;
}

// --- Utilities ---

function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
}

function readJsonSafe<T>(p: string): T | null {
  try { return JSON.parse(readSafe(p)) as T; } catch { return null; }
}

function extractField(content: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}[^\\n]*\\n([^#]+)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim().split('\n')[0].trim() : '';
}

function pendingCount(): number {
  try { return fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.md')).length; }
  catch { return 0; }
}

function pendingFiles(): string[] {
  try { return fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.md')); }
  catch { return []; }
}

function readyFiles(): string[] {
  try { return fs.readdirSync(READY_DIR).filter(f => f.endsWith('.md')); }
  catch { return []; }
}

function listContexts(): string[] {
  try {
    return fs.readdirSync(BIZ_CONTEXT)
      .filter(f => !f.startsWith('_') && fs.statSync(path.join(BIZ_CONTEXT, f)).isDirectory());
  } catch { return ['anytime-fitness']; }
}

function loadHistory(): SessionHistoryEntry[] {
  try { return JSON.parse(readSafe(SESSION_HIST)) as SessionHistoryEntry[]; }
  catch { return []; }
}

function saveHistory(entries: SessionHistoryEntry[]): void {
  fs.ensureDirSync(path.join(ROOT, 'logs'));
  fs.writeFileSync(SESSION_HIST, JSON.stringify(entries, null, 2), 'utf-8');
}

function logAction(intent: string, skills: string[], generated: number, budgetFlagged: boolean, notes: string): void {
  fs.ensureDirSync(path.join(ROOT, 'logs'));
  if (!fs.existsSync(SESSION_LOG)) {
    fs.writeFileSync(SESSION_LOG, 'timestamp,intent,skills_run,assets_generated,budget_flagged,notes\n', 'utf-8');
  }
  const row = `"${new Date().toISOString()}","${intent}","${skills.join(';')}","${generated}","${budgetFlagged}","${notes.replace(/"/g, "'")}"\n`;
  fs.appendFileSync(SESSION_LOG, row);
}

function ask(rl: RLInterface, q: string): Promise<string> {
  return new Promise(resolve => {
    try {
      rl.question(q, resolve);
    } catch {
      resolve(''); // readline closed (e.g., piped stdin ended)
    }
  });
}

const PAID_SKILLS = new Set(['ad-copy', 'google-ads', 'image-generator']);
const CAMPAIGN_SKILLS = ['hook-writer', 'ad-copy', 'landing-page', 'email-sequence', 'nurture-sync', 'content-calendar'];

// --- Banner ---

function banner(ctx: SessionContext, history: SessionHistoryEntry[]): void {
  const pend = pendingCount();
  const mode = VOICE_MODE ? 'VOICE' : 'TEXT';

  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

  console.log('');
  console.log(chalk.bold.green('╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║  ') + chalk.bold.white(pad(`AHRI — Acquisition Intelligence  v${VERSION}`, 57)) + chalk.bold.green('║'));
  console.log(chalk.bold.green('╠═══════════════════════════════════════════════════════════╣'));
  console.log(chalk.bold.green('║  ') + chalk.gray(pad(`Mode:     ${mode}`, 57)) + chalk.bold.green('║'));
  console.log(chalk.bold.green('║  ') + chalk.gray(pad(`Business: ${ctx.activeBusiness}`, 57)) + chalk.bold.green('║'));
  console.log(chalk.bold.green('║  ') + chalk.gray(pad(`Avatar:   ${ctx.activeAvatar}`, 57)) + chalk.bold.green('║'));
  const offerLine = ctx.activeOffer.length > 52 ? ctx.activeOffer.slice(0, 49) + '...' : ctx.activeOffer;
  console.log(chalk.bold.green('║  ') + chalk.yellow(pad(`Offer:    ${offerLine}`, 57)) + chalk.bold.green('║'));
  const queueLine = `Queue:    ${pend} asset${pend !== 1 ? 's' : ''} pending review`;
  console.log(chalk.bold.green('║  ') + (pend > 0 ? chalk.red(pad(queueLine, 57)) : chalk.gray(pad(queueLine, 57))) + chalk.bold.green('║'));

  if (history.length > 0) {
    const last = history[history.length - 1];
    const lastDate = new Date(last.date).toLocaleDateString();
    console.log(chalk.bold.green('╠═══════════════════════════════════════════════════════════╣'));
    console.log(chalk.bold.green('║  ') + chalk.cyan(pad(`Last session: ${lastDate}`, 57)) + chalk.bold.green('║'));
    if (last.actions.length > 0) {
      const a = last.actions[last.actions.length - 1];
      const aLine = a.length > 52 ? a.slice(0, 49) + '...' : a;
      console.log(chalk.bold.green('║  ') + chalk.gray(pad(`Last action:  ${aLine}`, 57)) + chalk.bold.green('║'));
    }
  }
  console.log(chalk.bold.green('╚═══════════════════════════════════════════════════════════╝'));
  console.log('');

  if (history.length > 0 && history[history.length - 1].notes) {
    const hint = history[history.length - 1].notes;
    const display = hint.length > 80 ? hint.slice(0, 77) + '...' : hint;
    console.log(chalk.cyan(`  ${display}`));
    console.log('');
  }

  console.log(chalk.white('  What would you like to build today?'));
  console.log(chalk.gray('  (Type "help" for options, "exit" to close)'));
  console.log('');
}

// --- Intent Parser ---

async function parseIntent(client: Anthropic, input: string, ctx: SessionContext): Promise<ParsedIntent> {
  const system = `You are AHRI's intent parser. Read the user's message and return JSON only — no explanation, no markdown.

Return this exact shape:
{"intent":"<type>","skills":[],"context":"<biz>","avatar_override":null,"awareness_override":null,"budget_required":false,"message":""}

intent values: generate_skill | batch_generate | review_queue | update_brain_state | show_status | run_campaign | switch_context | get_help | sync_media | sync_brains | update_funnel | update_workflows | run_manus_task | show_routines | run_routine_manually | analyze_paid_ads | analyze_google_ads | check_budget_pacing | track_lead_journey | analyze_landing_page | analyze_nurture | check_retention | monitor_reviews | track_referrals | audit_gbp | clean_crm | generate_monthly_report | process_manus_results | exit

Rules:
- "run campaign" / "build everything" / "full campaign" → run_campaign
- Multiple skills in one request → batch_generate
- Single skill → generate_skill
- "what's in queue" / "pending" / "review" → review_queue
- "approve [skill/asset/all]" / "approve offer-machine" / "approve hook writer" → review_queue
- "status" / "what's active" / "what's running" / "what's current" → show_status
- "update" / "change brain" / "set offer" / "set objection" → update_brain_state
- "switch to" / "change context" / "use [gym name]" → switch_context
- "help" / "what can you do" → get_help
- "exit" / "quit" / "done" / "bye" → exit
- "sync media" / "analyze media" / "process media library" / "media sync" → sync_media
- "sync brains" / "sync performance data" / "pull GymSuite data" / "cross-brain" / "sync the performance" → sync_brains
- "update funnel" / "push landing page" / "update GHL funnel" / "funnel update" / "push the landing page" → update_funnel
- "push scripts" / "update workflows" / "push SMS" / "push nurture" / "update GHL workflows" / "push the script updates" → update_workflows
- "run manus" / "post content" / "manus post" / "run content posting" / "competitor research" / "run competitor" / "trend monitoring" / "run trend" / "run manus task" → run_manus_task
- "show routines" / "list routines" / "what routines" / "what automations" / "automation schedule" / "show schedule" → show_routines
- "run routine" / "run morning brief" / "run weekly content" / "run monthly campaign" / "manually run" / "trigger routine" → run_routine_manually
- "paid ads analysis" / "meta analysis" / "facebook ads analysis" / "ads analyzer" / "analyze meta" / "analyze facebook ads" → analyze_paid_ads
- "google ads analysis" / "google ads analyzer" / "analyze google ads" / "search ads analysis" → analyze_google_ads
- "budget pacing" / "check pacing" / "ad budget pacing" / "pacing tracker" → check_budget_pacing
- "lead journey" / "attribution report" / "track leads" / "lead tracking" / "lead attribution" → track_lead_journey
- "clarity" / "landing page analytics" / "heatmap" / "clarity analyzer" / "scroll depth" → analyze_landing_page
- "nurture analysis" / "nurture performance" / "sequence analysis" / "analyze nurture" / "sequence performance" → analyze_nurture
- "retention" / "at-risk members" / "early warning" / "dropout" / "check retention" / "retention warning" → check_retention
- "reviews" / "monitor reviews" / "review monitoring" / "check reviews" / "google reviews" → monitor_reviews
- "referrals" / "track referrals" / "referral tracker" / "referral report" → track_referrals
- "GBP audit" / "google business profile" / "GBP optimization" / "audit GBP" / "check GBP" → audit_gbp
- "CRM hygiene" / "clean CRM" / "CRM audit" / "crm cleanup" → clean_crm
- "monthly report" / "generate report" / "executive report" / "monthly brief" → generate_monthly_report
- "process results" / "summarize intelligence" / "what does the data say" / "analyze intelligence" / "intelligence summary" / "what's the data showing" → process_manus_results
- ad-copy, google-ads, image-generator are paid skills → set budget_required: true
- Default context: ${ctx.activeBusiness}
- Available skills: offer-machine, hook-writer, ad-copy, landing-page, email-sequence, nurture-sync, content-calendar, vsl-script, flyer-generator, image-generator, seo-content, google-ads, referral-campaign, reactivation, review-engine, funnel-updater, workflow-updater
- Active offer: ${ctx.activeOffer}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 256,
    system,
    messages: [{ role: 'user', content: input }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : text) as ParsedIntent;
  } catch {
    return { intent: 'get_help', skills: [], context: ctx.activeBusiness, avatar_override: null, awareness_override: null, budget_required: false, message: '' };
  }
}

// --- Intent Handlers ---

function showStatus(ctx: SessionContext): void {
  const bs = readSafe(BRAIN_STATE);
  const pend = pendingCount();

  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  AHRI SYSTEM STATUS'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.gray('  Active offer:    ') + chalk.yellow(ctx.activeOffer));
  console.log(chalk.gray('  Active avatar:   ') + chalk.white(ctx.activeAvatar));
  console.log(chalk.gray('  Business:        ') + chalk.white(ctx.activeBusiness));
  console.log(chalk.gray('  Live ads:        ') + chalk.white(extractField(bs, 'Live Ads') || 'none'));
  console.log(chalk.gray('  Current tests:   ') + chalk.white(extractField(bs, 'Current Tests') || 'none'));
  console.log(chalk.gray('  Pending review:  ') + (pend > 0 ? chalk.red(`${pend} assets`) : chalk.green('queue clear')));
  console.log(chalk.gray('  Top objection:   ') + chalk.white(extractField(bs, 'Top Objection This Month') || 'none logged'));
  console.log(chalk.gray('  Seasonal:        ') + chalk.white(extractField(bs, 'Seasonal Context') || '—'));

  const hooksSection = bs.match(/##\s*Winning Hooks[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
  if (hooksSection) {
    const hooks = hooksSection[1].trim().split('\n').filter(l => l.trim().match(/^\d+\./));
    if (hooks.length > 0) {
      console.log(chalk.gray('\n  Winning hooks:'));
      hooks.forEach(h => console.log(chalk.gray('    ') + chalk.white(h.trim())));
    }
  }

  // Cross-brain insights from brain state
  const crossBrainSection = bs.match(/##\s*Cross-Brain Insights[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
  if (crossBrainSection) {
    const lines = crossBrainSection[1].trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length > 0) {
      console.log(chalk.gray('\n  Cross-brain insights:'));
      lines.slice(0, 3).forEach(l => console.log(chalk.gray('    · ') + chalk.cyan(l.replace(/^[-*]\s*/, '').trim())));
    }
  } else {
    // Fallback: read archetype-performance.json directly
    const archetypeData = readJsonSafe<{ insights?: string[] }>(path.join(CROSS_BRAIN, 'archetype-performance.json'));
    if (archetypeData?.insights && archetypeData.insights.length > 0) {
      console.log(chalk.gray('\n  Cross-brain insights:'));
      archetypeData.insights.slice(0, 2).forEach(i => console.log(chalk.gray('    · ') + chalk.cyan(i)));
    }
  }

  if (ctx.sessionActions.length > 0) {
    console.log(chalk.gray('\n  This session:'));
    ctx.sessionActions.forEach(a => console.log(chalk.gray('    · ') + chalk.white(a)));
  }

  const lastNotes = extractField(bs, 'Last Session Notes');
  if (lastNotes) console.log(chalk.gray('\n  Last session:    ') + chalk.cyan(lastNotes));
  console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

function showHelp(): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  AHRI — WHAT I CAN DO'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  const group = (label: string, lines: string[]) => {
    console.log('\n' + chalk.yellow(`  ${label}`));
    lines.forEach(l => console.log(chalk.gray(`  "${l}"`)));
  };

  group('GENERATE', [
    'Write me hooks for the active offer',
    'Generate ad copy at awareness level 3',
    'Build a landing page for the comeback offer',
    'Run the email sequence skill',
    'Sync the nurture scripts to the active offer',
  ]);
  group('FULL CAMPAIGN', [
    'Build everything for next month',
    'Run the full campaign for the comeback offer',
  ]);
  group('GHL AUTOMATION', [
    'Update the GHL funnel with the approved landing page',
    'Push the script updates to GHL workflows',
  ]);
  group('SYNC INTELLIGENCE', [
    'Sync the media library',
    'Sync the performance data',
  ]);
  group('REVIEW QUEUE', [
    'What\'s in my review queue?',
    'Show pending assets',
  ]);
  group('STATUS', [
    'What\'s the current status?',
    'What\'s running right now?',
  ]);
  group('UPDATE BRAIN STATE', [
    'Update the active offer to...',
    'Set the top objection to...',
  ]);
  group('SWITCH CONTEXT', [
    'Switch to the agency context',
    'Change to [gym name]',
  ]);
  group('EXIT', ['Done', 'Exit', 'Quit', 'Bye']);

  console.log(chalk.gray('\n  Skills: offer-machine, hook-writer, ad-copy, landing-page,'));
  console.log(chalk.gray('  email-sequence, nurture-sync, content-calendar, vsl-script,'));
  console.log(chalk.gray('  flyer-generator, referral-campaign, reactivation, review-engine'));
  console.log(chalk.gray('\n  GHL: funnel-updater, workflow-updater'));
  console.log(chalk.gray('  Sync: analyze-media (Drive), sync-brains (GymSuite AI Sheets)'));
  console.log('\n' + chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

function runSkill(skill: string, context: string, avatarOverride: string | null, awarenessOverride: number | null, ctx: SessionContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['engine/generate.ts', '--skill', skill, '--context', `business-context/${context}`];
    if (avatarOverride) args.push('--avatar', avatarOverride);
    if (awarenessOverride !== null) args.push('--awareness', String(awarenessOverride));

    console.log(chalk.bold.cyan(`\n  Running: ${skill}`));
    console.log(chalk.gray('  ' + '─'.repeat(58)));

    const child = spawn('npx', ['tsx', ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
      shell: true,
    });

    child.on('close', code => {
      if (code === 0) {
        ctx.lastSkillRun = skill;
        ctx.sessionActions.push(`Generated: ${skill}`);
        logAction('generate_skill', [skill], 2, PAID_SKILLS.has(skill), `${skill} for ${context}`);
        resolve();
      } else {
        reject(new Error(`${skill} exited with code ${code ?? '?'}`));
      }
    });
  });
}

function runEngine(scriptRelPath: string, label: string, ctx: SessionContext): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(chalk.bold.cyan(`\n  Running: ${label}`));
    console.log(chalk.gray('  ' + '─'.repeat(58)));

    const child = spawn('npx', ['tsx', scriptRelPath], {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
      shell: true,
    });

    child.on('close', code => {
      if (code === 0) {
        ctx.sessionActions.push(`Synced: ${label}`);
        logAction(label, [], 0, false, `${label} complete`);
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code ?? '?'}`));
      }
    });
  });
}

async function handleGenerateSkill(parsed: ParsedIntent, ctx: SessionContext, rl: RLInterface): Promise<void> {
  const skills = parsed.skills.length > 0 ? parsed.skills : ['hook-writer'];
  const biz = parsed.context || ctx.activeBusiness;

  if (skills.some(s => PAID_SKILLS.has(s))) {
    console.log('');
    console.log(chalk.red('  [BUDGET REQUIRED]') + chalk.white(' This includes paid ad creative.'));
    const budget = await ask(rl, chalk.yellow('  Budget before going live? (amount or "set later") > '));
    ctx.sessionActions.push(`Budget flag: ${budget.trim()} for ${skills.filter(s => PAID_SKILLS.has(s)).join(', ')}`);
  }

  for (const skill of skills) {
    try {
      await runSkill(skill, biz, parsed.avatar_override, parsed.awareness_override, ctx);
    } catch (err) {
      console.log(chalk.red(`  ${(err as Error).message} — skipping.`));
    }
  }

  const newPend = pendingCount();
  console.log('');
  console.log(chalk.bold.green(`  Generated ${skills.length * 2} assets — all in pending-review.`));
  console.log(chalk.gray(`  Total queue: ${newPend} assets. Type "review queue" to approve.`));
  console.log('');
}

async function handleBatch(parsed: ParsedIntent, ctx: SessionContext, rl: RLInterface): Promise<void> {
  const skills = parsed.skills.length > 0 ? parsed.skills : ['hook-writer', 'ad-copy', 'landing-page'];
  const biz = parsed.context || ctx.activeBusiness;

  console.log('');
  console.log(chalk.bold.cyan('  BATCH GENERATION PLAN'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
  skills.forEach((s, i) => {
    const flag = PAID_SKILLS.has(s) ? chalk.red(' [BUDGET REQUIRED]') : '';
    console.log(chalk.gray(`  ${i + 1}. ${s}`) + flag);
  });
  console.log(chalk.gray(`\n  ${skills.length} skills × 2 variants = ${skills.length * 2} assets`));
  console.log(chalk.gray(`  Context: ${biz}\n`));

  const confirm = await ask(rl, chalk.yellow('  Confirm batch run? (y/n) > '));
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(chalk.gray('  Cancelled.\n'));
    return;
  }

  let generated = 0;
  const failed: string[] = [];

  for (const skill of skills) {
    try {
      await runSkill(skill, biz, parsed.avatar_override, parsed.awareness_override, ctx);
      generated += 2;
    } catch {
      failed.push(skill);
    }
  }

  const newPend = pendingCount();
  console.log('');
  console.log(chalk.bold.green('  BATCH COMPLETE'));
  console.log(chalk.gray(`  Generated:  ${generated} assets`));
  if (failed.length > 0) console.log(chalk.red(`  Failed:     ${failed.join(', ')}`));
  console.log(chalk.gray(`  Queue:      ${newPend} assets pending review`));
  console.log(chalk.gray(`  Review first: ${skills.find(s => !failed.includes(s)) ?? '—'}`));
  if (skills.some(s => PAID_SKILLS.has(s))) console.log(chalk.red(`  Budget items: ${skills.filter(s => PAID_SKILLS.has(s)).join(', ')}`));
  console.log('');
}

async function handleCampaign(parsed: ParsedIntent, ctx: SessionContext, rl: RLInterface): Promise<void> {
  const biz = parsed.context || ctx.activeBusiness;

  console.log('');
  console.log(chalk.bold.yellow('  FULL CAMPAIGN BUILD'));
  console.log(chalk.bold.yellow('  ─────────────────────────────────────────────────────────'));
  console.log(chalk.gray(`  Offer:     ${ctx.activeOffer}`));
  console.log(chalk.gray(`  Context:   ${biz}`));
  console.log(chalk.gray(`  Skills:    ${CAMPAIGN_SKILLS.join(', ')}`));
  console.log(chalk.gray(`  Assets:    ${CAMPAIGN_SKILLS.length * 2} variants`));
  console.log(chalk.gray('  Est. time: 15–25 minutes'));
  console.log(chalk.red('  Budget required: yes (ad-copy)\n'));

  const confirm = await ask(rl, chalk.yellow('  Confirm full campaign run? (y/n) > '));
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(chalk.gray('  Cancelled.\n'));
    return;
  }

  const budget = await ask(rl, chalk.red('  Budget for ad-copy before going live? (amount or "set later") > '));
  ctx.sessionActions.push(`Campaign budget: ${budget.trim()}`);
  console.log(chalk.gray(`  Budget noted: ${budget.trim()}. Starting.\n`));

  for (const skill of CAMPAIGN_SKILLS) {
    try {
      await runSkill(skill, biz, parsed.avatar_override, parsed.awareness_override, ctx);
    } catch {
      console.log(chalk.yellow(`  ${skill} failed — continuing.`));
    }
  }

  const newPend = pendingCount();
  console.log('');
  console.log(chalk.bold.green('  CAMPAIGN BUILD COMPLETE'));
  console.log(chalk.gray(`  ${newPend} total assets in pending-review`));
  console.log(chalk.gray('  Review order: hook-writer → ad-copy → landing-page → email'));
  console.log(chalk.gray('  Live this week: ad creative (after budget approval)'));
  console.log(chalk.gray('  GHL implementation: nurture-sync (after Kai review)'));
  console.log('');

  // Optional: push approved content to GHL
  const pushFunnel = await ask(rl, chalk.gray('  Push approved landing page to GHL funnel now? (y/n) > '));
  if (pushFunnel.trim().toLowerCase() === 'y') {
    await handleUpdateFunnel(ctx, rl);
  }

  const pushWorkflows = await ask(rl, chalk.gray('  Push nurture scripts to GHL workflows now? (y/n) > '));
  if (pushWorkflows.trim().toLowerCase() === 'y') {
    await handleUpdateWorkflows(ctx, rl);
  }
}

function approveFiles(files: string[], ctx: SessionContext, budget: string): void {
  fs.ensureDirSync(READY_DIR);
  let count = 0;
  for (const file of files) {
    const src = path.join(PENDING_DIR, file);
    const dst = path.join(READY_DIR, file);
    try {
      let content = readSafe(src);
      content = content.replace(/^status:\s*pending-review/m, 'status: ready-to-post');
      if (budget) content = content.replace(/^(status: ready-to-post)/m, `$1\nbudget_approved: ${budget}`);
      fs.writeFileSync(dst, content, 'utf-8');
      fs.removeSync(src);
      const assetId = file.replace('.md', '');
      const log = readSafe(ASSET_LOG);
      const updated = log.replace(new RegExp(`("${assetId}"[^\\n]*)pending-review`), '$1ready-to-post');
      if (updated !== log) fs.writeFileSync(ASSET_LOG, updated, 'utf-8');
      console.log(chalk.green(`  Approved → ${assetId}`));
      if (budget) console.log(chalk.gray(`  Budget: ${budget}`));
      ctx.sessionActions.push(`Approved: ${assetId}`);
      count++;
    } catch (err) {
      console.log(chalk.red(`  Failed: ${file} — ${(err as Error).message}`));
    }
  }
  logAction('review_queue', [], 0, !!budget, `Approved ${count} asset(s)`);
}

async function reviewQueue(ctx: SessionContext, rl: RLInterface, preFilter?: string): Promise<void> {
  const files = pendingFiles();

  if (files.length === 0) {
    console.log(chalk.green('\n  Queue is clear. Nothing pending review.\n'));
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan(`  PENDING REVIEW — ${files.length} asset${files.length !== 1 ? 's' : ''}`));
  console.log(chalk.bold.cyan('  ─────────────────────────────────────────────────────────'));

  type AssetRow = { file: string; assetId: string; skill: string; variant: string; date: string; paid: boolean };
  const rows: AssetRow[] = [];

  files.forEach((file, i) => {
    const content = readSafe(path.join(PENDING_DIR, file));
    const assetId = (content.match(/^asset_id:\s*(.+)$/m) ?? [])[1]?.trim() ?? file.replace('.md', '');
    const skill   = (content.match(/^skill:\s*(.+)$/m) ?? [])[1]?.trim() ?? '—';
    const variant = (content.match(/^variant:\s*(.+)$/m) ?? [])[1]?.trim() ?? '—';
    const date    = (content.match(/^date:\s*(.+)$/m) ?? [])[1]?.trim().slice(0, 10) ?? '—';
    const paid = PAID_SKILLS.has(skill);
    rows.push({ file, assetId, skill, variant, date, paid });
    const flag = paid ? chalk.red(' [BUDGET REQUIRED]') : '';
    console.log(chalk.gray(`  ${i + 1}.`) + chalk.white(` ${assetId}`) + flag);
    console.log(chalk.gray(`     skill: ${skill}  variant: ${variant}  date: ${date}`));
  });

  console.log('');
  console.log(chalk.gray('  Reply with asset ID, "all", a skill name, or "skip"'));
  console.log('');

  let rawInput: string;
  if (preFilter !== undefined) {
    rawInput = preFilter; // already normalized by caller
    console.log(chalk.gray(`  Auto-filtering: ${preFilter}\n`));
  } else {
    const answer = await ask(rl, chalk.green('  > '));
    rawInput = answer.trim().toLowerCase();
  }

  if (!rawInput || rawInput === 'skip') {
    console.log(chalk.gray('  Skipped.\n'));
    return;
  }

  // Normalize: strip "approve" prefix, replace spaces with hyphens
  const normalizedInput = rawInput
    .replace(/^approve\s+/i, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  const toApprove = normalizedInput === 'all'
    ? rows
    : rows.filter(r =>
        r.assetId.toLowerCase().includes(normalizedInput) ||
        r.skill.toLowerCase().replace(/\s+/g, '-') === normalizedInput
      );

  if (toApprove.length === 0) {
    console.log(chalk.yellow('  No matching assets.\n'));
    return;
  }

  let budget = '';
  if (toApprove.some(r => r.paid)) {
    console.log(chalk.red('\n  [BUDGET REQUIRED]') + chalk.white(' Approval includes paid creative.'));
    budget = await ask(rl, chalk.yellow('  Budget before going live? (amount or "set later") > '));
  }

  console.log('');
  approveFiles(toApprove.map(r => r.file), ctx, budget.trim());
  console.log('');
}

async function handleUpdateBrainState(input: string, ctx: SessionContext, rl: RLInterface, client: Anthropic): Promise<void> {
  const current = readSafe(BRAIN_STATE);

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `User wants to update brain-state/current-state.md. Request: "${input}"

Current:
${current}

What field and value? Return JSON only:
{"field":"<heading name>","current_value":"<current first line>","new_value":"<replacement>"}`
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
  const m = text.match(/\{[\s\S]*\}/);
  let update: { field: string; current_value: string; new_value: string } | null = null;
  try { update = JSON.parse(m ? m[0] : text); } catch {
    console.log(chalk.yellow('  Could not parse what to update. Be more specific.\n'));
    return;
  }
  if (!update) return;

  console.log('');
  console.log(chalk.bold.cyan('  BRAIN STATE UPDATE'));
  console.log(chalk.gray('  Field:    ') + chalk.white(update.field));
  console.log(chalk.gray('  Current:  ') + chalk.red(update.current_value));
  console.log(chalk.gray('  New:      ') + chalk.green(update.new_value));
  console.log('');

  const confirm = await ask(rl, chalk.yellow('  Confirm? (y/n) > '));
  if (confirm.trim().toLowerCase() !== 'y') {
    console.log(chalk.gray('  Cancelled.\n'));
    return;
  }

  const updated = current.replace(
    new RegExp(`(##\\s*${update.field}[^\\n]*\\n)([^#]*)`, 'i'),
    `$1${update.new_value}\n`
  );
  fs.writeFileSync(BRAIN_STATE, updated, 'utf-8');

  if (update.field.toLowerCase().includes('offer')) ctx.activeOffer = update.new_value;
  ctx.sessionActions.push(`Brain state: ${update.field} updated`);
  logAction('update_brain_state', [], 0, false, `Updated ${update.field}`);

  console.log(chalk.green('  Brain state updated. All future generations will use this context.\n'));
}

function handleSwitchContext(ctx: SessionContext, parsed: ParsedIntent): void {
  const contexts = listContexts();

  const allText = (parsed.message + ' ' + parsed.skills.join(' ')).toLowerCase();
  const match = contexts.find(c => allText.includes(c.toLowerCase()));

  if (match && match !== ctx.activeBusiness) {
    ctx.activeBusiness = match;
    ctx.sessionActions.push(`Switched to: ${match}`);
    logAction('switch_context', [], 0, false, `Switched to ${match}`);
    console.log(chalk.green(`\n  Switched to ${match}. All generations will now use this context.\n`));
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('  AVAILABLE BUSINESS CONTEXTS'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
  contexts.forEach((c, i) => {
    const active = c === ctx.activeBusiness ? chalk.green(' (active)') : '';
    console.log(chalk.gray(`  ${i + 1}. `) + chalk.white(c) + active);
  });
  console.log(chalk.gray('\n  "Switch to [name]" to change context.\n'));
}

async function handleSyncMedia(ctx: SessionContext): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  MEDIA LIBRARY SYNC'));
  console.log(chalk.gray('  Scanning Google Drive for new photos and videos...'));
  console.log(chalk.gray('  Analyzing with Claude vision — claude-opus-4-6'));
  console.log(chalk.gray('  Generating shot list and updating media-index.json'));
  console.log('');

  try {
    await runEngine('engine/media-analyzer.ts', 'media-analyzer', ctx);
    console.log(chalk.bold.green('\n  Media sync complete. Check brain-state for updated library status.\n'));
  } catch (err) {
    console.log(chalk.yellow(`\n  Media sync encountered an issue: ${(err as Error).message}`));
    console.log(chalk.gray('  Check GOOGLE_DRIVE_MEDIA_FOLDER_ID and service account credentials in .env\n'));
  }
}

async function handleSyncBrains(ctx: SessionContext): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  CROSS-BRAIN SYNC — GymSuite AI Stage Log'));
  console.log(chalk.gray('  Reading GymSuite AI Google Sheet...'));
  console.log(chalk.gray('  Calculating archetype and source conversion rates...'));
  console.log(chalk.gray('  Generating insights with claude-opus-4-6...'));
  console.log(chalk.gray('  Writing to intelligence-db/cross-brain/'));
  console.log('');

  try {
    await runEngine('engine/cross-brain-sync.ts', 'cross-brain-sync', ctx);
    console.log(chalk.bold.green('\n  Cross-brain sync complete. Brain state updated with latest insights.\n'));
  } catch (err) {
    console.log(chalk.yellow(`\n  Cross-brain sync encountered an issue: ${(err as Error).message}`));
    console.log(chalk.gray('  Check GOOGLE_SHEETS_TRANSCRIPT_REVIEW_ID and service account credentials in .env\n'));
  }
}

async function handleUpdateFunnel(ctx: SessionContext, rl: RLInterface): Promise<void> {
  console.log('');
  console.log(chalk.bold.yellow('  FUNNEL UPDATER — GHL Landing Page'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));

  // Find approved landing page
  const approved = readyFiles().filter(f => f.includes('landing-page'));
  const pending = pendingFiles().filter(f => f.includes('landing-page'));

  let sourceFile = '';
  let sourceDir = '';
  let landingContent = '';

  if (approved.length > 0) {
    sourceFile = approved[approved.length - 1];
    sourceDir = READY_DIR;
    landingContent = readSafe(path.join(READY_DIR, sourceFile));
    console.log(chalk.green(`  Found approved landing page: ${sourceFile}`));
  } else if (pending.length > 0) {
    sourceFile = pending[pending.length - 1];
    sourceDir = PENDING_DIR;
    landingContent = readSafe(path.join(PENDING_DIR, sourceFile));
    console.log(chalk.yellow(`  Found pending landing page (not yet approved): ${sourceFile}`));
    const goAhead = await ask(rl, chalk.yellow('  This is pending review. Push anyway? (y/n) > '));
    if (goAhead.trim().toLowerCase() !== 'y') {
      console.log(chalk.gray('  Approve the landing page in "review queue" first.\n'));
      return;
    }
  } else {
    console.log(chalk.yellow('  No landing page assets found in queue.'));
    console.log(chalk.gray('  Run "generate landing page" first, then approve it.\n'));
    return;
  }

  // Get GHL page ID
  let pageId = process.env['GHL_FUNNEL_PAGE_ID'] ?? '';
  if (!pageId) {
    console.log(chalk.yellow('\n  GHL_FUNNEL_PAGE_ID not set in .env'));
    const inputId = await ask(rl, chalk.yellow('  Enter GHL funnel page ID (or "skip") > '));
    if (!inputId.trim() || inputId.trim().toLowerCase() === 'skip') {
      console.log(chalk.gray('  Set GHL_FUNNEL_PAGE_ID in .env to enable automatic funnel updates.\n'));
      return;
    }
    pageId = inputId.trim();
  }

  // Load current page (gracefully falls back to mock if no credentials)
  console.log(chalk.gray('\n  Reading current GHL funnel page...'));
  const currentPage = await getFunnelPage(pageId);

  // Show before/after
  console.log(chalk.bold.cyan('\n  CURRENT FUNNEL PAGE'));
  currentPage.elements.slice(0, 6).forEach(el => {
    console.log(chalk.gray(`    [${el.type}] `) + chalk.red(el.content.slice(0, 72)));
  });

  // Extract key elements from approved landing page copy
  const headlineMatch = landingContent.match(/##\s*(?:Primary\s+)?Headline[^\n]*\n([^\n#]+)/i);
  const subMatch      = landingContent.match(/##\s*Subheadline[^\n]*\n([^\n#]+)/i);
  const ctaMatch      = landingContent.match(/##\s*(?:Primary\s+)?CTA[^\n]*\n([^\n#]+)/i);
  const guaranteeMatch = landingContent.match(/##\s*Guarantee[^\n]*\n([^\n#]+)/i);

  console.log(chalk.bold.cyan('\n  PROPOSED (from: ' + sourceFile + ')'));
  if (headlineMatch) console.log(chalk.gray('    [headline]    ') + chalk.green(headlineMatch[1].trim().slice(0, 72)));
  if (subMatch)      console.log(chalk.gray('    [subheadline] ') + chalk.green(subMatch[1].trim().slice(0, 72)));
  if (ctaMatch)      console.log(chalk.gray('    [button]      ') + chalk.green(ctaMatch[1].trim().slice(0, 72)));
  if (guaranteeMatch) console.log(chalk.gray('    [guarantee]   ') + chalk.green(guaranteeMatch[1].trim().slice(0, 72)));
  if (!headlineMatch && !subMatch && !ctaMatch) {
    console.log(chalk.gray('  (Preview the full copy in ' + path.join(sourceDir, sourceFile) + ')'));
  }

  console.log('');
  const confirm = await ask(rl, chalk.bold.red('  Type YES to publish these changes live > '));
  if (confirm.trim() !== 'YES') {
    console.log(chalk.gray('  Cancelled — must type YES exactly.\n'));
    return;
  }

  // Push updates
  console.log(chalk.gray('\n  Publishing to GHL...'));
  try {
    if (headlineMatch) await updatePageElement(pageId, 'headline-1', headlineMatch[1].trim());
    if (subMatch)      await updatePageElement(pageId, 'subheadline-1', subMatch[1].trim());
    if (ctaMatch)      await updatePageElement(pageId, 'cta-1', ctaMatch[1].trim());
    if (guaranteeMatch) await updatePageElement(pageId, 'guarantee-1', guaranteeMatch[1].trim());
    await publishPage(pageId);
    ctx.sessionActions.push('Funnel updated and published');
    logAction('update_funnel', [], 0, false, `Published funnel page ${pageId}`);
    console.log(chalk.bold.green('\n  Funnel updated. Changes are now live.\n'));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('GHL_API_KEY') || msg.includes('not set')) {
      console.log(chalk.yellow('\n  GHL not configured — update queued for manual implementation.'));
      console.log(chalk.gray('  Set GHL_API_KEY and GHL_FUNNEL_PAGE_ID in .env for automatic publishing.'));
      console.log(chalk.gray('  Copy from: ' + path.join(sourceDir, sourceFile) + '\n'));
    } else {
      console.log(chalk.red(`\n  Push failed: ${msg}`));
      console.log(chalk.gray('  Check logs/errors.csv for details.\n'));
    }
  }
}

async function handleUpdateWorkflows(ctx: SessionContext, rl: RLInterface): Promise<void> {
  console.log('');
  console.log(chalk.bold.yellow('  WORKFLOW UPDATER — GHL SMS Scripts'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));

  // Find nurture-sync package
  const approvedPkgs = readyFiles().filter(f => f.includes('nurture-sync'));
  const pendingPkgs  = pendingFiles().filter(f => f.includes('nurture-sync'));

  let nurtureContent = '';
  let sourceName = '';

  if (approvedPkgs.length > 0) {
    sourceName = approvedPkgs[approvedPkgs.length - 1];
    nurtureContent = readSafe(path.join(READY_DIR, sourceName));
    console.log(chalk.green(`  Found approved nurture-sync package: ${sourceName}`));
  } else if (pendingPkgs.length > 0) {
    sourceName = pendingPkgs[pendingPkgs.length - 1];
    nurtureContent = readSafe(path.join(PENDING_DIR, sourceName));
    console.log(chalk.yellow(`  Found pending nurture-sync (not yet approved): ${sourceName}`));
    const goAhead = await ask(rl, chalk.yellow('  This is pending review. Push anyway? (y/n) > '));
    if (goAhead.trim().toLowerCase() !== 'y') {
      console.log(chalk.gray('  Approve the nurture-sync package in "review queue" first.\n'));
      return;
    }
  } else {
    console.log(chalk.yellow('  No nurture-sync package found in queue.'));
    console.log(chalk.gray('  Run "sync the nurture scripts" first, then approve it.\n'));
    return;
  }

  // Choose variant
  const variantChoice = await ask(rl, chalk.yellow('  Which variant to push? (A/B) > '));
  const variant = variantChoice.trim().toUpperCase() === 'B' ? 'B' : 'A';

  const updates = parseNurtureSync(nurtureContent, variant as 'A' | 'B');

  if (updates.length === 0) {
    console.log(chalk.yellow(`\n  No Variant ${variant} messages parsed from the package.`));
    console.log(chalk.gray('  Check that the nurture-sync output uses the expected format.\n'));
    return;
  }

  // Validate all messages
  console.log(chalk.bold.cyan(`\n  VARIANT ${variant} — UPDATE MANIFEST`));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));

  let hasErrors = false;
  updates.forEach((u, i) => {
    const content = u.newContent ?? '';
    const result = validateSmsContent(content);
    const segLabel = result.segmentCount === 1
      ? chalk.green(`${result.charCount}c · 1-seg`)
      : chalk.yellow(`${result.charCount}c · 2-seg`);
    const status = result.valid ? chalk.green('PASS') : chalk.red('FAIL');
    console.log(chalk.gray(`  ${i + 1}. ${u.workflowName ?? '—'} › ${u.stepName ?? '—'}`));
    console.log(chalk.gray('     ') + status + chalk.gray('  ') + segLabel);
    if (!result.valid) {
      hasErrors = true;
      result.issues.forEach(issue => console.log(chalk.red(`       ! ${issue}`)));
    }
  });

  if (hasErrors) {
    console.log(chalk.red('\n  Validation errors found — fix messages before pushing to GHL.\n'));
    return;
  }

  console.log(chalk.gray(`\n  ${updates.length} messages — all validation passed.`));

  // Check GHL configuration
  const hasApiKey = !!process.env['GHL_API_KEY'];
  const hasWorkflowIds = !!process.env['GHL_WORKFLOW_IDS'];

  if (!hasApiKey || !hasWorkflowIds) {
    console.log(chalk.yellow('\n  GHL not fully configured:'));
    if (!hasApiKey) console.log(chalk.yellow('    ! GHL_API_KEY not set in .env'));
    if (!hasWorkflowIds) console.log(chalk.yellow('    ! GHL_WORKFLOW_IDS not set in .env'));
    console.log(chalk.gray('  The update manifest above is ready for manual implementation in GHL.'));
    console.log(chalk.gray('  See skills/workflow-updater/SKILL.md for step-by-step instructions.\n'));
    ctx.sessionActions.push(`Workflow manifest prepared: ${updates.length} messages (manual push required)`);
    return;
  }

  const confirm = await ask(rl, chalk.bold.red(`  Type YES to push Variant ${variant} to GHL workflows > `));
  if (confirm.trim() !== 'YES') {
    console.log(chalk.gray('  Cancelled — must type YES exactly.\n'));
    return;
  }

  // Push each update
  console.log(chalk.gray('\n  Pushing to GHL workflows...'));
  let success = 0;
  let failed = 0;

  for (const update of updates) {
    if (!update.workflowName || !update.newContent) continue;
    const wfId = resolveWorkflowId(update.workflowName);
    if (!wfId) {
      console.log(chalk.yellow(`  No workflow ID for "${update.workflowName}" — check GHL_WORKFLOW_IDS`));
      failed++;
      continue;
    }
    const stepId = update.stepId ?? '';
    try {
      await updateWorkflowStep(wfId, stepId, update.newContent);
      success++;
    } catch (err) {
      console.log(chalk.yellow(`  Failed: ${update.workflowName} › ${update.stepName ?? '—'}`));
      failed++;
    }
  }

  console.log('');
  if (success > 0) console.log(chalk.green(`  ${success} messages pushed successfully.`));
  if (failed > 0)  console.log(chalk.yellow(`  ${failed} failed — check GHL credentials and step IDs.`));
  ctx.sessionActions.push(`Workflows updated: Variant ${variant}, ${success} pushed, ${failed} failed`);
  logAction('update_workflows', [], 0, false, `Variant ${variant}: ${success} pushed ${failed} failed`);
  console.log('');
}

async function handleExit(ctx: SessionContext, rl: RLInterface): Promise<void> {
  const mins = Math.round((Date.now() - ctx.sessionStartTime.getTime()) / 60000);
  const note = ctx.sessionActions.length > 0
    ? `Session ${new Date().toLocaleDateString()}: ${ctx.sessionActions.slice(0, 3).join(', ')}${ctx.sessionActions.length > 3 ? ` +${ctx.sessionActions.length - 3} more` : ''}.`
    : `Session ${new Date().toLocaleDateString()}: status check only.`;

  console.log('');
  console.log(chalk.bold.cyan('  SESSION SUMMARY'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
  console.log(chalk.gray(`  Duration:  ${mins} minute${mins !== 1 ? 's' : ''}`));
  console.log(chalk.gray(`  Business:  ${ctx.activeBusiness}`));
  if (ctx.lastSkillRun) console.log(chalk.gray(`  Last skill: ${ctx.lastSkillRun}`));
  if (ctx.sessionActions.length > 0) {
    console.log(chalk.gray('  Actions:'));
    ctx.sessionActions.forEach(a => console.log(chalk.gray('    · ') + chalk.white(a)));
  } else {
    console.log(chalk.gray('  Actions:   none'));
  }
  console.log('');

  const bs = readSafe(BRAIN_STATE);
  const bsUpdated = bs.replace(
    /(##\s*Last Session Notes[^\n]*\n)([\s\S]*?)(?=\n##|$)/i,
    `$1${note}\n`
  );
  fs.writeFileSync(BRAIN_STATE, bsUpdated, 'utf-8');

  const hist = loadHistory();
  hist.push({
    date: new Date().toISOString(),
    duration_minutes: mins,
    actions: ctx.sessionActions,
    assets_generated: ctx.sessionActions.filter(a => a.startsWith('Generated:')).length * 2,
    assets_approved: ctx.sessionActions.filter(a => a.startsWith('Approved:')).length,
    brain_state_updates: ctx.sessionActions.filter(a => a.includes('Brain state:')),
    notes: note,
  });
  saveHistory(hist);
  logAction('exit', [], 0, false, note);

  console.log(chalk.bold.green('  Session logged. See you next time.\n'));
  rl.close();
  process.exit(0);
}

// --- Automation Handlers ---

const MANUS_TASKS: Record<string, string> = {
  'content-posting':              path.join(ROOT, 'manus-tasks', 'content-posting.md'),
  'competitor-research':          path.join(ROOT, 'manus-tasks', 'competitor-research.md'),
  'trend-monitoring':             path.join(ROOT, 'manus-tasks', 'trend-monitoring.md'),
  'paid-ads-analyzer':            path.join(ROOT, 'manus-tasks', 'paid-ads-analyzer.md'),
  'google-ads-analyzer':          path.join(ROOT, 'manus-tasks', 'google-ads-analyzer.md'),
  'budget-pacing-tracker':        path.join(ROOT, 'manus-tasks', 'budget-pacing-tracker.md'),
  'lead-journey-tracker':         path.join(ROOT, 'manus-tasks', 'lead-journey-tracker.md'),
  'clarity-analyzer':             path.join(ROOT, 'manus-tasks', 'clarity-analyzer.md'),
  'nurture-performance-analyzer': path.join(ROOT, 'manus-tasks', 'nurture-performance-analyzer.md'),
  'retention-early-warning':      path.join(ROOT, 'manus-tasks', 'retention-early-warning.md'),
  'review-monitoring':            path.join(ROOT, 'manus-tasks', 'review-monitoring.md'),
  'crm-hygiene':                  path.join(ROOT, 'manus-tasks', 'crm-hygiene.md'),
  'referral-tracker':             path.join(ROOT, 'manus-tasks', 'referral-tracker.md'),
  'gbp-optimization':             path.join(ROOT, 'manus-tasks', 'gbp-optimization.md'),
  'monthly-report':               path.join(ROOT, 'manus-tasks', 'monthly-report.md'),
};

const INTENT_TO_MANUS_TASK: Record<string, string> = {
  'analyze_paid_ads':        'paid-ads-analyzer',
  'analyze_google_ads':      'google-ads-analyzer',
  'check_budget_pacing':     'budget-pacing-tracker',
  'track_lead_journey':      'lead-journey-tracker',
  'analyze_landing_page':    'clarity-analyzer',
  'analyze_nurture':         'nurture-performance-analyzer',
  'check_retention':         'retention-early-warning',
  'monitor_reviews':         'review-monitoring',
  'track_referrals':         'referral-tracker',
  'audit_gbp':               'gbp-optimization',
  'clean_crm':               'crm-hygiene',
  'generate_monthly_report': 'monthly-report',
};

const TASK_INTELLIGENCE_FILES: Record<string, string[]> = {
  'paid-ads-analyzer':            ['intelligence-db/paid/meta-performance.json'],
  'google-ads-analyzer':          ['intelligence-db/paid/google-performance.json'],
  'budget-pacing-tracker':        ['intelligence-db/paid/pacing-log.json'],
  'lead-journey-tracker':         ['intelligence-db/lead-journey/attribution-report.json'],
  'clarity-analyzer':             ['intelligence-db/clarity/heatmap-insights.json'],
  'nurture-performance-analyzer': ['intelligence-db/nurture/sequence-performance.json'],
  'retention-early-warning':      ['intelligence-db/retention/dropout-alerts.json'],
  'review-monitoring':            ['intelligence-db/market/review-log.json'],
  'crm-hygiene':                  ['intelligence-db/crm/crm-hygiene-report.csv', 'logs/crm-hygiene-log.json'],
  'referral-tracker':             ['intelligence-db/market/referral-log.json'],
  'gbp-optimization':             ['intelligence-db/market/gbp-audit-report.csv'],
  'monthly-report':               ['outputs/anytime-fitness/monthly-reports/'],
};

const ROUTINES: Record<string, { file: string; script: string; description: string }> = {
  'morning-brief':      { file: path.join(ROOT, 'routines', 'ahri-morning-brief.md'), script: 'npm run morning-brief', description: 'Monday 7:00 AM — weekly status brief for Kai' },
  'weekly-media':       { file: path.join(ROOT, 'routines', 'weekly-media-processing.md'), script: 'npm run analyze-media', description: 'Monday 5:45 AM — scan and index new Drive media' },
  'weekly-content':     { file: path.join(ROOT, 'routines', 'weekly-content.md'), script: 'npm run weekly-content', description: 'Monday 7:00 AM — generate 30-piece content calendar' },
  'monthly-campaign':   { file: path.join(ROOT, 'routines', 'monthly-campaign.md'), script: 'npm run monthly-campaign', description: 'First Monday 7:00 AM — full offer + campaign package' },
  'funnel-check':       { file: path.join(ROOT, 'routines', 'funnel-performance-check.md'), script: 'npm run funnel-check', description: 'Triggered 72h after funnel update — CVR comparison' },
  'cross-brain-sync':   { file: path.join(ROOT, 'routines', 'weekly-cross-brain-sync.md'), script: 'npm run sync-brains', description: 'Sunday 11:00 PM — read Stage Log, update intelligence-db' },
};

/** Display the Manus task instruction file for Kai/Manus to follow. */
async function handleRunManusTask(parsed: ParsedIntent, rl: RLInterface): Promise<void> {
  const taskNames = Object.keys(MANUS_TASKS);
  const inputLower = parsed.message.toLowerCase() + ' ' + parsed.skills.join(' ').toLowerCase();

  let taskKey = taskNames.find(k => inputLower.includes(k.replace(/-/g, ' ')) || inputLower.includes(k));
  if (!taskKey && inputLower.includes('post')) taskKey = 'content-posting';
  if (!taskKey && inputLower.includes('competitor')) taskKey = 'competitor-research';
  if (!taskKey && inputLower.includes('trend')) taskKey = 'trend-monitoring';
  if (!taskKey && (inputLower.includes('paid ads') || inputLower.includes('meta ads') || inputLower.includes('facebook ads'))) taskKey = 'paid-ads-analyzer';
  if (!taskKey && inputLower.includes('google ads')) taskKey = 'google-ads-analyzer';
  if (!taskKey && inputLower.includes('pacing')) taskKey = 'budget-pacing-tracker';
  if (!taskKey && (inputLower.includes('lead journey') || inputLower.includes('attribution'))) taskKey = 'lead-journey-tracker';
  if (!taskKey && (inputLower.includes('clarity') || inputLower.includes('heatmap'))) taskKey = 'clarity-analyzer';
  if (!taskKey && (inputLower.includes('nurture') && inputLower.includes('analy'))) taskKey = 'nurture-performance-analyzer';
  if (!taskKey && (inputLower.includes('retention') || inputLower.includes('dropout') || inputLower.includes('at risk'))) taskKey = 'retention-early-warning';
  if (!taskKey && (inputLower.includes('review') && !inputLower.includes('queue'))) taskKey = 'review-monitoring';
  if (!taskKey && inputLower.includes('referral')) taskKey = 'referral-tracker';
  if (!taskKey && (inputLower.includes('gbp') || inputLower.includes('google business'))) taskKey = 'gbp-optimization';
  if (!taskKey && inputLower.includes('crm')) taskKey = 'crm-hygiene';
  if (!taskKey && (inputLower.includes('monthly report') || inputLower.includes('executive report'))) taskKey = 'monthly-report';

  if (!taskKey) {
    console.log('');
    console.log(chalk.bold.cyan('  MANUS TASKS AVAILABLE'));
    console.log(chalk.gray('  ──────────────────────────────────────────────'));
    taskNames.forEach(k => {
      const taskFile = MANUS_TASKS[k];
      const exists = fs.existsSync(taskFile!);
      console.log(chalk.gray(`  · ${k.padEnd(30)} `) + (exists ? chalk.green('ready') : chalk.red('file missing')));
    });
    console.log('');
    console.log(chalk.white('  Which task should Manus run?'));
    const answer = await ask(rl, chalk.green('  AHRI > '));
    taskKey = taskNames.find(k => answer.toLowerCase().includes(k.replace(/-/g, ' ')) || answer.toLowerCase().includes(k));
    if (!taskKey) {
      console.log(chalk.red('  Task not recognized. No action taken.\n'));
      return;
    }
  }

  const taskFile = MANUS_TASKS[taskKey]!;
  if (!fs.existsSync(taskFile)) {
    console.log(chalk.red(`  Task file not found: ${taskFile}\n`));
    return;
  }

  const content = readSafe(taskFile);
  console.log('');
  console.log(chalk.bold.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(chalk.bold.white(`  MANUS TASK — ${taskKey.toUpperCase()}`));
  console.log(chalk.bold.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(chalk.yellow('\n  ⚠  Hand this file to Manus. Manus follows every step in order.'));
  console.log(chalk.yellow('     Step 0 (account verification) is mandatory — never skip it.\n'));
  console.log(chalk.white(content));
  console.log('');
  logAction('run_manus_task', [taskKey], 0, false, `Manus task displayed: ${taskKey}`);
}

/** Display any Manus task by key — generic handler for all intelligence tasks. */
async function handleDisplayManusTask(taskKey: string): Promise<void> {
  const taskFile = MANUS_TASKS[taskKey];
  if (!taskFile || !fs.existsSync(taskFile)) {
    console.log(chalk.red(`\n  Task file not found for: ${taskKey}\n`));
    return;
  }
  const content = readSafe(taskFile);
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white(`  MANUS TASK — ${taskKey.toUpperCase()}`));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.yellow('\n  Hand this file to Manus. Manus follows every step in order.'));
  console.log(chalk.yellow('  Step 0 (account verification) is mandatory — never skip it.\n'));
  console.log(chalk.white(content));
  console.log('');
  logAction('run_manus_task', [taskKey], 0, false, `Manus task displayed: ${taskKey}`);
}

/** Read all available intelligence files and generate a prioritized action brief. */
async function handleProcessManusResults(_parsed: ParsedIntent, ctx: SessionContext, client: Anthropic): Promise<void> {
  console.log('');
  console.log(chalk.bold.cyan('  INTELLIGENCE SUMMARY — Reading all data files...'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));

  const allFiles = Object.values(TASK_INTELLIGENCE_FILES).flat();
  const fileContents: string[] = [];

  for (const relPath of allFiles) {
    const fullPath = path.join(ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      const content = readSafe(fullPath);
      if (content.trim()) {
        fileContents.push(`--- ${relPath} ---\n${content.slice(0, 2000)}`);
      }
    }
  }

  if (fileContents.length === 0) {
    console.log(chalk.yellow('  No intelligence data found yet. Run Manus tasks first to populate intelligence-db/.\n'));
    return;
  }

  console.log(chalk.gray(`  Found ${fileContents.length} data files. Analyzing with claude-opus-4-6...\n`));

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: `You are AHRI, an acquisition intelligence system for a gym chain. You have read all available intelligence data files. Summarize the most actionable insights in 5-7 bullet points. Focus on: what's working, what's broken, what needs immediate action. Be specific — include numbers when available. Be decisive — tell Kai what to do. Format: one bullet per insight, lead with the action or finding, not the source.`,
      messages: [{
        role: 'user',
        content: `Intelligence data:\n\n${fileContents.join('\n\n')}\n\nActive offer: ${ctx.activeOffer}`,
      }],
    });

    const summary = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(chalk.bold.white('  INTELLIGENCE BRIEF'));
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
    summary.split('\n').forEach(line => {
      if (line.trim()) console.log(chalk.white('  ' + line));
    });
    console.log('');
    ctx.sessionActions.push('Intelligence summary generated');
    logAction('process_manus_results', [], 0, false, `Summarized ${fileContents.length} intelligence files`);
  } catch (err) {
    console.log(chalk.red(`  Intelligence summary failed: ${(err as Error).message}\n`));
  }
}

/** List all routines with their schedule and status. */
function handleShowRoutines(): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  AHRI AUTOMATION ROUTINES'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');

  Object.entries(ROUTINES).forEach(([key, r]) => {
    const exists = fs.existsSync(r.file);
    const statusColor = exists ? chalk.green : chalk.red;
    console.log(chalk.bold.white(`  ${key}`));
    console.log(chalk.gray(`    Schedule:  `) + chalk.white(r.description));
    console.log(chalk.gray(`    Script:    `) + chalk.cyan(r.script));
    console.log(chalk.gray(`    File:      `) + statusColor(exists ? r.file.replace(ROOT, '.') : 'MISSING'));
    console.log('');
  });

  console.log(chalk.gray('  Manus tasks:'));
  Object.entries(MANUS_TASKS).forEach(([key, file]) => {
    const exists = fs.existsSync(file);
    console.log(chalk.gray(`    · ${key.padEnd(30)} `) + (exists ? chalk.green('ready') : chalk.red('missing')));
  });

  console.log('');
  console.log(chalk.gray('  To trigger a routine: "run [routine name]"'));
  console.log(chalk.gray('  To run a Manus task:  "run manus [task name]"\n'));

  logAction('show_routines', [], 0, false, 'Routine list displayed');
}

/** Display a routine file and optionally run its npm script. */
async function handleRunRoutineManually(parsed: ParsedIntent, ctx: SessionContext, rl: RLInterface): Promise<void> {
  const routineKeys = Object.keys(ROUTINES);
  const inputLower = parsed.message.toLowerCase() + ' ' + parsed.skills.join(' ').toLowerCase();

  let routineKey = routineKeys.find(k =>
    inputLower.includes(k.replace(/-/g, ' ')) || inputLower.includes(k)
  );
  if (!routineKey && inputLower.includes('morning')) routineKey = 'morning-brief';
  if (!routineKey && inputLower.includes('media')) routineKey = 'weekly-media';
  if (!routineKey && inputLower.includes('content')) routineKey = 'weekly-content';
  if (!routineKey && inputLower.includes('monthly') || inputLower.includes('campaign')) routineKey = 'monthly-campaign';
  if (!routineKey && inputLower.includes('funnel')) routineKey = 'funnel-check';
  if (!routineKey && (inputLower.includes('sync') || inputLower.includes('cross'))) routineKey = 'cross-brain-sync';

  if (!routineKey) {
    console.log('');
    console.log(chalk.white('  Which routine should I run manually?'));
    routineKeys.forEach(k => console.log(chalk.gray(`    · ${k}`)));
    console.log('');
    const answer = await ask(rl, chalk.green('  AHRI > '));
    routineKey = routineKeys.find(k => answer.toLowerCase().includes(k.replace(/-/g, ' ')) || answer.toLowerCase().includes(k));
    if (!routineKey) {
      console.log(chalk.red('  Routine not recognized. No action taken.\n'));
      return;
    }
  }

  const routine = ROUTINES[routineKey]!;

  console.log('');
  console.log(chalk.bold.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(chalk.bold.white(`  ROUTINE — ${routineKey.toUpperCase()}`));
  console.log(chalk.bold.cyan(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  console.log(chalk.gray(`  Schedule: `) + chalk.white(routine.description));
  console.log(chalk.gray(`  Script:   `) + chalk.cyan(routine.script));
  console.log('');

  console.log(chalk.white(`  Run ${routine.script} now? (yes / no)`));
  const confirm = await ask(rl, chalk.green('  AHRI > '));

  if (!/^y(es)?$/i.test(confirm.trim())) {
    console.log(chalk.gray('  Cancelled — no action taken.\n'));
    return;
  }

  const [cmd, ...args] = routine.script.split(' ');
  console.log(chalk.cyan(`\n  Running: ${routine.script}\n`));

  await new Promise<void>((resolve) => {
    const proc = spawn(cmd!, args, { stdio: 'inherit', shell: true, cwd: ROOT });
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green(`\n  Routine completed successfully.\n`));
      } else {
        console.log(chalk.red(`\n  Routine exited with code ${code}. Check logs/errors.csv.\n`));
      }
      resolve();
    });
    proc.on('error', (err) => {
      console.log(chalk.red(`\n  Failed to start routine: ${err.message}\n`));
      resolve();
    });
  });

  ctx.sessionActions.push(`Manual routine: ${routineKey}`);
  logAction('run_routine_manually', [routineKey], 0, false, `Manual run: ${routineKey}`);
}

// --- Voice stubs ---

async function voiceInput(): Promise<string> {
  try {
    const mod = await import('./voice.js');
    return mod.listenForInput();
  } catch {
    return '';
  }
}

async function voiceSpeak(text: string): Promise<void> {
  if (!VOICE_MODE) return;
  try {
    const mod = await import('./voice.js');
    mod.speakResponse(text).catch(() => {});
  } catch { /* voice unavailable */ }
}

// --- Main ---

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to .env and try again.');
  const client = new Anthropic({ apiKey });

  const bs = readSafe(BRAIN_STATE);
  const avatarFile = readSafe(path.join(ROOT, 'business-context', 'anytime-fitness', 'active-avatar.md'));
  const avatarMatch = avatarFile.match(/active\s+avatar:\s*(\S+)/i);

  const ctx: SessionContext = {
    activeOffer: extractField(bs, 'Active Offer') || 'No active offer set',
    activeAvatar: avatarMatch ? avatarMatch[1] : 'lifestyle-member',
    activeBusiness: 'anytime-fitness',
    lastSkillRun: '',
    lastOutputPaths: [],
    lastAssetIds: [],
    sessionActions: [],
    sessionStartTime: new Date(),
  };

  const history = loadHistory();
  banner(ctx, history);

  if (VOICE_MODE) {
    const greeting = `Good morning. AHRI online. Active offer: ${ctx.activeOffer}. ${pendingCount()} assets pending review. What would you like to build?`;
    console.log(chalk.cyan(`  [Speaking] ${greeting}\n`));
    await voiceSpeak(greeting);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let stdinEnded = false;
  rl.on('close', () => { stdinEnded = true; });

  const loop = async (): Promise<void> => {
    while (true) {
      let input: string;

      if (VOICE_MODE) {
        const spoken = await voiceInput();
        if (spoken) {
          console.log(chalk.gray(`  I heard: "${spoken}"`));
          input = spoken;
        } else {
          input = await ask(rl, chalk.green('  AHRI [voice unavailable — type] > '));
        }
      } else {
        input = await ask(rl, chalk.green('  AHRI > '));
      }

      const trimmed = input.trim();
      if (!trimmed) {
        if (stdinEnded) { await handleExit(ctx, rl); return; }
        continue;
      }

      if (/^(exit|quit|done|bye)$/i.test(trimmed)) {
        await handleExit(ctx, rl);
        return;
      }

      let parsed: ParsedIntent;
      try {
        parsed = await parseIntent(client, trimmed, ctx);
      } catch (err) {
        console.log(chalk.red(`  Error: ${(err as Error).message}\n`));
        continue;
      }

      switch (parsed.intent) {
        case 'show_status':
          showStatus(ctx);
          await voiceSpeak(`Active offer: ${ctx.activeOffer}. ${pendingCount()} assets pending review.`);
          break;

        case 'get_help':
          showHelp();
          break;

        case 'generate_skill':
          await handleGenerateSkill(parsed, ctx, rl);
          await voiceSpeak(`Generated ${parsed.skills.join(' and ')}. Assets are in pending review.`);
          break;

        case 'batch_generate':
          await handleBatch(parsed, ctx, rl);
          break;

        case 'run_campaign':
          await handleCampaign(parsed, ctx, rl);
          break;

        case 'review_queue': {
          const approveMatch = trimmed.match(/^approve\s+(.+)$/i);
          const preFilter = approveMatch
            ? approveMatch[1].trim().replace(/\s+/g, '-').toLowerCase()
            : undefined;
          await reviewQueue(ctx, rl, preFilter);
          break;
        }

        case 'update_brain_state':
          await handleUpdateBrainState(trimmed, ctx, rl, client);
          await voiceSpeak('Brain state updated.');
          break;

        case 'switch_context':
          handleSwitchContext(ctx, parsed);
          break;

        case 'sync_media':
          await handleSyncMedia(ctx);
          break;

        case 'sync_brains':
          await handleSyncBrains(ctx);
          break;

        case 'update_funnel':
          await handleUpdateFunnel(ctx, rl);
          break;

        case 'update_workflows':
          await handleUpdateWorkflows(ctx, rl);
          break;

        case 'run_manus_task':
          await handleRunManusTask(parsed, rl);
          break;

        case 'show_routines':
          handleShowRoutines();
          break;

        case 'run_routine_manually':
          await handleRunRoutineManually(parsed, ctx, rl);
          break;

        case 'analyze_paid_ads':
        case 'analyze_google_ads':
        case 'check_budget_pacing':
        case 'track_lead_journey':
        case 'analyze_landing_page':
        case 'analyze_nurture':
        case 'check_retention':
        case 'monitor_reviews':
        case 'track_referrals':
        case 'audit_gbp':
        case 'clean_crm':
        case 'generate_monthly_report': {
          const taskKey = INTENT_TO_MANUS_TASK[parsed.intent];
          if (taskKey) await handleDisplayManusTask(taskKey);
          break;
        }

        case 'process_manus_results':
          await handleProcessManusResults(parsed, ctx, client);
          break;

        case 'exit':
          await handleExit(ctx, rl);
          return;

        default:
          console.log(chalk.yellow("  Unknown intent. Type 'help' for options.\n"));
      }
    }
  };

  await loop();
}

main().catch((err: Error) => {
  console.error(chalk.red('\n[FATAL]'), err.message);
  process.exit(1);
});
