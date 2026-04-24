import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();

// --- Types ---

interface Args {
  skill: string;
  context: string;
  variants: number;
  avatar: string | null;
  awareness: number | null;
}

interface SkillConfig {
  skill: string;
  model: string;
  maxTokens: number;
  knowledgeBases: string[];
  awarenessLevel: number;
  instructions: string;
}

interface AssetResult {
  variant: 'A' | 'B';
  assetId: string;
  outputPath: string;
}

interface UserPromptArgs {
  gymProfile: string;
  avatarContent: string;
  brainState: string;
  kbContent: string;
  skillInstructions: string;
  awarenessLevel: number;
  variant: 'A' | 'B';
}

interface GenerateParams {
  client: Anthropic;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  variant: 'A' | 'B';
}

interface WriteParams {
  content: string;
  assetId: string;
  skill: string;
  context: string;
  variant: 'A' | 'B';
  testId: string;
}

// --- Utilities ---

function randomId(len: number): string {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// --- Arg Parsing ---

/** Parse CLI args: --skill, --context, --variants, --avatar, --awareness */
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { skill: '', context: '', variants: 2, avatar: null, awareness: null };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--skill' && next !== undefined) { args.skill = next; i++; }
    else if (flag === '--context' && next !== undefined) { args.context = next; i++; }
    else if (flag === '--variants' && next !== undefined) { args.variants = parseInt(next, 10); i++; }
    else if (flag === '--avatar' && next !== undefined) { args.avatar = next; i++; }
    else if (flag === '--awareness' && next !== undefined) { args.awareness = parseInt(next, 10); i++; }
  }

  if (!args.skill) throw new Error('--skill is required. Usage: npx tsx engine/generate.ts --skill <name> --context <path>');
  if (!args.context) throw new Error('--context is required. Usage: npx tsx engine/generate.ts --skill <name> --context <path>');
  return args;
}

// --- SKILL.md Parser ---

function yamlStr(config: Record<string, string | string[]>, key: string, fallback: string): string {
  const val = config[key];
  return typeof val === 'string' ? val : fallback;
}

function yamlList(config: Record<string, string | string[]>, key: string): string[] {
  const val = config[key];
  return Array.isArray(val) ? val : [];
}

/** Parse YAML frontmatter and body from SKILL.md. Requires --- delimiters. */
function parseSkillMd(content: string): SkillConfig {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter (--- delimiters required at top of file).');

  const yaml = match[1];
  const instructions = match[2].trim();
  const lines = yaml.split(/\r?\n/);
  const config: Record<string, string | string[]> = {};
  let currentKey = '';

  for (const line of lines) {
    const listItem = line.match(/^ {2}- (.+)$/);
    const kv = line.match(/^([a-z][a-z-]*):\s*(.*)$/);
    if (listItem && currentKey) {
      (config[currentKey] as string[]).push(listItem[1]);
    } else if (kv) {
      if (kv[2]) {
        config[kv[1]] = kv[2];
        currentKey = '';
      } else {
        config[kv[1]] = [];
        currentKey = kv[1];
      }
    }
  }

  return {
    skill: yamlStr(config, 'skill', ''),
    model: yamlStr(config, 'model', 'claude-sonnet-4-6'),
    maxTokens: parseInt(yamlStr(config, 'max-tokens', '8192'), 10) || 8192,
    knowledgeBases: yamlList(config, 'knowledge-base'),
    awarenessLevel: parseInt(yamlStr(config, 'awareness-level', '3'), 10),
    instructions,
  };
}

// --- Context Loaders ---

/** Load the active avatar file. Reads active-avatar.md if no override provided. */
function loadAvatar(context: string, avatarOverride: string | null): string {
  const contextDir = path.join(ROOT, context);
  if (avatarOverride) {
    return readFileSafe(path.join(contextDir, 'avatars', `${avatarOverride}.md`));
  }
  const activeFile = readFileSafe(path.join(contextDir, 'active-avatar.md'));
  const nameMatch = activeFile.match(/active\s+avatar:\s*(\S+)/i);
  const name = nameMatch ? nameMatch[1] : 'lifestyle-member';
  return readFileSafe(path.join(contextDir, 'avatars', `${name}.md`));
}

/** Concatenate all knowledge base files listed in SKILL.md frontmatter. */
function loadKnowledgeBases(kbs: string[]): string {
  return kbs
    .map(kb => {
      const content = readFileSafe(path.join(ROOT, kb));
      return content ? `\n\n---\n## Knowledge Base: ${path.basename(kb, '.md')}\n\n${content}` : '';
    })
    .join('');
}

// --- Prompt Builders ---

function awarenessLabel(level: number): string {
  const map: Record<number, string> = {
    1: 'UNAWARE — Speak only to life outcomes. Never mention fitness or gym.',
    2: 'PROBLEM AWARE — Speak to the pain of feeling unfit. No solution pitch yet.',
    3: 'SOLUTION AWARE — Introduce the solution concept. Soft pitch only.',
    4: 'PRODUCT AWARE — Speak to why THIS gym. Compare and differentiate.',
    5: 'MOST AWARE — Full offer. Create urgency. Make it easy to say yes now.',
  };
  return map[level] ?? map[3];
}

function buildUserPrompt(args: UserPromptArgs): string {
  const { gymProfile, avatarContent, brainState, kbContent, skillInstructions, awarenessLevel, variant } = args;
  return `# AHRI Generation Request — Variant ${variant}

**VARIANT:** ${variant}
**AWARENESS LEVEL:** ${awarenessLevel} — ${awarenessLabel(awarenessLevel)}

---

## Gym Profile
${gymProfile || '[gym-profile.md not found — use knowledge base context only]'}

## Active Avatar
${avatarContent || '[avatar file not found — infer from gym profile and seasonal calendar]'}

## Current Brain State
${brainState || '[brain-state/current-state.md is empty — no active offers or test data yet]'}

${kbContent}

---

## Skill Instructions
${skillInstructions}

---

Execute the skill instructions completely for Variant ${variant}. Output the full asset only. No preamble, no meta-commentary, no explanation of what you are about to do. Begin immediately with the first element of the output format specified in the skill instructions above.`;
}

// --- Logging ---

/** Append one line to logs/errors.csv */
function logError(operation: string, model: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","${model}","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.appendFileSync(path.join(ROOT, 'logs', 'errors.csv'), line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

/** Append one row to performance/asset-log.csv */
function logAsset(assetId: string, skill: string, business: string, avatar: string, variant: string, testId: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const line = `"${assetId}","${skill}","${skill}","${business}","${avatar}","${date}","${variant}","pending-review","${testId}",""\n`;
  try {
    fs.appendFileSync(path.join(ROOT, 'performance', 'asset-log.csv'), line);
  } catch (err) {
    process.stderr.write(`[ASSET LOG FAIL] ${(err as Error).message}\n`);
  }
}

// --- Retry Wrapper ---

/** Retry fn up to 3 times with exponential backoff (1s, 2s, 4s). Logs each failure to errors.csv. */
async function withRetry<T>(fn: () => Promise<T>, label: string, model: string): Promise<T> {
  const delays = [1000, 2000, 4000];
  let lastErr: Error = new Error('unknown error');
  for (let i = 0; i <= 2; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      logError(label, model, lastErr);
      if (i < 2) {
        console.log(chalk.yellow(`  Attempt ${i + 1} failed. Retrying in ${delays[i] / 1000}s... (${lastErr.message})`));
        await sleep(delays[i]);
      }
    }
  }
  throw lastErr;
}

// --- Generator ---

/** Stream a single variant from Claude. Returns the complete generated text. */
async function generateVariant(params: GenerateParams): Promise<string> {
  const { client, model, maxTokens, systemPrompt, userPrompt, variant } = params;
  console.log(chalk.cyan(`\n[Variant ${variant}] Streaming from ${model}...\n`));
  console.log(chalk.gray('─'.repeat(60)));

  return withRetry(async () => {
    let fullText = '';
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    stream.on('text', (text) => {
      process.stdout.write(text);
      fullText += text;
    });
    await stream.finalMessage();
    process.stdout.write('\n');
    console.log(chalk.gray('─'.repeat(60)));
    return fullText;
  }, `generate-variant-${variant}`, model);
}

// --- Output Writer ---

/** Write asset to outputs/ and distribution/queue/pending-review/. Returns the output path. */
function writeOutput(params: WriteParams): string {
  const { content, assetId, skill, context, variant, testId } = params;
  const gymName = path.basename(context);
  const outputDir = path.join(ROOT, 'outputs', gymName, skill);
  const queueDir = path.join(ROOT, 'distribution', 'queue', 'pending-review');

  fs.ensureDirSync(outputDir);
  fs.ensureDirSync(queueDir);

  const header = [
    '---',
    `asset_id: ${assetId}`,
    `skill: ${skill}`,
    `variant: ${variant}`,
    `test_id: ${testId}`,
    `date: ${new Date().toISOString()}`,
    `status: pending-review`,
    '---',
    '',
    '',
  ].join('\n');

  const outputPath = path.join(outputDir, `${assetId}.md`);
  const queuePath = path.join(queueDir, `${assetId}.md`);
  fs.writeFileSync(outputPath, header + content, 'utf-8');
  fs.writeFileSync(queuePath, header + content, 'utf-8');
  return outputPath;
}

// --- Main ---

async function main(): Promise<void> {
  console.log(chalk.bold.green('\nAHRI — Acquisition Intelligence'));
  console.log(chalk.gray('marketing-os v1.1.0\n'));

  const args = parseArgs();
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Add it to .env and try again.');

  const client = new Anthropic({ apiKey });

  // Load and parse SKILL.md
  const skillMdPath = path.join(ROOT, 'skills', args.skill, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) throw new Error(`Skill not found: ${skillMdPath}`);
  const skillConfig = parseSkillMd(fs.readFileSync(skillMdPath, 'utf-8'));

  const awarenessLevel = args.awareness ?? skillConfig.awarenessLevel;
  const avatarName = args.avatar ?? 'lifestyle-member';

  console.log(chalk.gray(`  Skill:     ${args.skill}`));
  console.log(chalk.gray(`  Model:     ${skillConfig.model}`));
  console.log(chalk.gray(`  Context:   ${args.context}`));
  console.log(chalk.gray(`  Avatar:    ${avatarName}`));
  console.log(chalk.gray(`  Awareness: Level ${awarenessLevel} — ${awarenessLabel(awarenessLevel)}`));

  // Assemble all context
  const gymProfile = readFileSafe(path.join(ROOT, args.context, 'gym-profile.md'));
  const avatarContent = loadAvatar(args.context, args.avatar);
  const brainState = readFileSafe(path.join(ROOT, 'brain-state', 'current-state.md'));
  const kbContent = loadKnowledgeBases(skillConfig.knowledgeBases);
  const systemPrompt = readFileSafe(path.join(ROOT, 'AHRI.md'));

  const testId = `${args.skill}-${today()}-${randomId(6)}`;
  console.log(chalk.gray(`  Test ID:   ${testId}\n`));

  const results: AssetResult[] = [];

  for (const variant of ['A', 'B'] as const) {
    const assetId = `${args.skill}-${today()}-${variant}-${randomId(4)}`;

    const userPrompt = buildUserPrompt({
      gymProfile,
      avatarContent,
      brainState,
      kbContent,
      skillInstructions: skillConfig.instructions,
      awarenessLevel,
      variant,
    });

    try {
      const content = await generateVariant({ client, model: skillConfig.model, maxTokens: skillConfig.maxTokens, systemPrompt, userPrompt, variant });
      const outputPath = writeOutput({ content, assetId, skill: args.skill, context: args.context, variant, testId });
      logAsset(assetId, args.skill, path.basename(args.context), avatarName, variant, testId);
      results.push({ variant, assetId, outputPath });
      console.log(chalk.green(`[${variant}] Saved → ${outputPath}`));
    } catch (err) {
      console.error(chalk.red(`[${variant}] FAILED — ${(err as Error).message}`));
      if (variant === 'A') throw new Error('Variant A failed. Aborting. Check logs/errors.csv for details.');
      console.log(chalk.yellow('[B] Variant B failed. Variant A was saved successfully.'));
    }
  }

  console.log(chalk.bold.green('\n✓ Generation complete'));
  console.log(chalk.gray(`  Test ID: ${testId}`));
  console.log(chalk.gray(`  Queue:   distribution/queue/pending-review/`));
  results.forEach(r => console.log(chalk.gray(`  [${r.variant}]  ${r.assetId}`)));
  console.log('');
}

main().catch((err: Error) => {
  console.error(chalk.red('\n[FATAL]'), err.message);
  process.exit(1);
});
