import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { createInterface, Interface as RLInterface } from 'readline';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const VERSION = '1.1.0';
const VOICE_MODE = process.argv.includes('--voice');

// --- Paths ---

const BRAIN_STATE   = path.join(ROOT, 'brain-state', 'current-state.md');
const PENDING_DIR   = path.join(ROOT, 'distribution', 'queue', 'pending-review');
const READY_DIR     = path.join(ROOT, 'distribution', 'queue', 'ready-to-post');
const ASSET_LOG     = path.join(ROOT, 'performance', 'asset-log.csv');
const SESSION_LOG   = path.join(ROOT, 'logs', 'session-log.csv');
const SESSION_HIST  = path.join(ROOT, 'logs', 'session-history.json');
const BIZ_CONTEXT   = path.join(ROOT, 'business-context');

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
  return new Promise(resolve => rl.question(q, resolve));
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

intent values: generate_skill | batch_generate | review_queue | update_brain_state | show_status | run_campaign | switch_context | get_help | exit

Rules:
- "run campaign" / "build everything" / "full campaign" → run_campaign
- Multiple skills in one request → batch_generate
- Single skill → generate_skill
- "what's in queue" / "pending" / "review" → review_queue
- "status" / "what's active" / "what's running" / "what's current" → show_status
- "update" / "change brain" / "set offer" / "set objection" → update_brain_state
- "switch to" / "change context" / "use [gym name]" → switch_context
- "help" / "what can you do" → get_help
- "exit" / "quit" / "done" / "bye" → exit
- ad-copy, google-ads, image-generator are paid skills → set budget_required: true
- Default context: ${ctx.activeBusiness}
- Available skills: offer-machine, hook-writer, ad-copy, landing-page, email-sequence, nurture-sync, content-calendar, vsl-script, flyer-generator, image-generator, seo-content, google-ads, referral-campaign, reactivation, review-engine
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
      // update asset-log
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

async function reviewQueue(ctx: SessionContext, rl: RLInterface): Promise<void> {
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

  const answer = await ask(rl, chalk.green('  > '));
  const input = answer.trim().toLowerCase();

  if (!input || input === 'skip') {
    console.log(chalk.gray('  Skipped.\n'));
    return;
  }

  const toApprove = input === 'all'
    ? rows
    : rows.filter(r => r.assetId.toLowerCase().includes(input) || r.skill.toLowerCase() === input);

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

  // Try to match a specific context from the parsed message or skills
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

  // Update brain state last session notes
  const bs = readSafe(BRAIN_STATE);
  const bsUpdated = bs.replace(
    /(##\s*Last Session Notes[^\n]*\n)([\s\S]*?)(?=\n##|$)/i,
    `$1${note}\n`
  );
  fs.writeFileSync(BRAIN_STATE, bsUpdated, 'utf-8');

  // Append session history
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

  // Build session context
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
      if (!trimmed) continue;

      // Fast-path exits
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

        case 'review_queue':
          await reviewQueue(ctx, rl);
          break;

        case 'update_brain_state':
          await handleUpdateBrainState(trimmed, ctx, rl, client);
          await voiceSpeak('Brain state updated.');
          break;

        case 'switch_context':
          handleSwitchContext(ctx, parsed);
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
