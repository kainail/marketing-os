import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { buildCompetitorFingerprint } from './competitor-visual-fingerprinter.js';
import { evaluateImageQuality, QualityResult } from './image-quality-evaluator.js';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');
const ASSET_LOG  = path.join(ROOT, 'performance', 'asset-log.csv');

// --- Types ---

export interface ImageGenerationRequest {
  hook_type: string;
  variant: 'A' | 'B' | 'C' | 'D';
  hook_text: string;
  awareness_level: number;
  audience_temperature: 'cold' | 'warm' | 'retargeting';
  placement: string;
  campaign_id: string;
  character_id?: string;
  business_context: string;
  test_id: string;
  asset_id_prefix: string;
}

export interface GeneratedImage {
  asset_id: string;
  fal_image_url: string;
  local_path: string;
  prompt_used: string;
  seed: number;
  hook_type: string;
  variant: string;
  awareness_level: number;
  audience_temperature: string;
  placement: string;
  quality_passed: boolean;
  quality_score: number;
  quality_notes: string;
  recovery_attempts: number;
  generated_at: string;
}

interface FalImageOutput {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

interface FalResponse {
  images: FalImageOutput[];
  seed: number;
  timings?: Record<string, number>;
}

interface HookVisualVariant {
  variant_id: string;
  scene: string;
  subject: string;
  emotion: string;
  lighting: string;
  composition: string;
  do_not_show: string;
  text_overlay_space: string;
}

interface HookVisualMap {
  hook_types: Record<string, {
    visual_strategy: string;
    variants: Record<string, HookVisualVariant>;
  }>;
}

interface SeasonalModifier {
  prompt_append: string;
  avoid: string;
}

interface SeasonalModifiers {
  seasons: Record<string, SeasonalModifier & { months: number[] }>;
}

interface FalProfile {
  image_size: string;
  num_inference_steps: number;
  guidance_scale: number;
  safety_tolerance: string;
  output_format: string;
}

interface FalProfiles {
  model: string;
  profiles: Record<string, FalProfile>;
}

interface CharacterEntry {
  character_id: string;
  seed_offset: number;
  description: string;
  avoid: string;
  used_in: string[];
}

interface CampaignEntry {
  seed_base: number;
  characters: CharacterEntry[];
}

interface CharacterRegistry {
  campaigns: Record<string, CampaignEntry>;
}

// --- Logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","image-generator","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

function logAsset(assetId: string, skill: string, variant: string, status: string, filePath: string): void {
  try {
    fs.ensureDirSync(path.join(ROOT, 'performance'));
    if (!fs.existsSync(ASSET_LOG)) {
      fs.writeFileSync(ASSET_LOG, 'timestamp,asset_id,skill,variant,status,file_path\n', 'utf-8');
    }
    const row = `"${new Date().toISOString()}","${assetId}","${skill}","${variant}","${status}","${filePath}"\n`;
    fs.appendFileSync(ASSET_LOG, row);
  } catch {
    /* non-fatal */
  }
}

// --- Data loaders ---

function loadJson<T>(relPath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf-8')) as T;
  } catch {
    return null;
  }
}

// --- Seasonal resolver ---

function resolveSeasonalModifier(modifiers: SeasonalModifiers): SeasonalModifier {
  const month = new Date().getMonth() + 1;
  for (const season of Object.values(modifiers.seasons)) {
    if (season.months.includes(month)) {
      return { prompt_append: season.prompt_append, avoid: season.avoid };
    }
  }
  return { prompt_append: '', avoid: '' };
}

// --- Character resolver ---

function resolveCharacter(
  registry: CharacterRegistry,
  campaignId: string,
  characterId?: string
): { seed: number; characterDesc: string; characterAvoid: string } {
  const campaign = registry.campaigns[campaignId];
  if (!campaign) {
    return { seed: Math.floor(Math.random() * 999999), characterDesc: '', characterAvoid: '' };
  }

  let char: CharacterEntry | undefined;
  if (characterId) {
    char = campaign.characters.find(c => c.character_id === characterId);
  }
  if (!char) {
    char = campaign.characters[0];
  }
  if (!char) {
    return { seed: campaign.seed_base, characterDesc: '', characterAvoid: '' };
  }

  return {
    seed: campaign.seed_base + char.seed_offset,
    characterDesc: char.description,
    characterAvoid: char.avoid,
  };
}

// --- FAL profile resolver ---

function resolveFalProfile(
  profiles: FalProfiles,
  audienceTemp: string,
  placement: string
): FalProfile {
  const key = placement === 'stories'
    ? 'stories_vertical'
    : audienceTemp === 'cold'
      ? 'cold_audience_static'
      : audienceTemp === 'warm'
        ? 'warm_audience_static'
        : 'retargeting_static';

  return profiles.profiles[key] ?? profiles.profiles['cold_audience_static']!;
}

// --- Prompt builder ---

function buildPrompt(
  variant: HookVisualVariant,
  hookText: string,
  seasonalModifier: SeasonalModifier,
  characterDesc: string,
  characterAvoid: string,
  competitorInstructions: string,
  awarenessLevel: number,
  _audienceTemp: string
): string {
  const parts: string[] = [];

  // Core scene
  parts.push(`Photorealistic documentary-style photograph. ${variant.scene}`);

  // Subject description
  if (characterDesc) {
    parts.push(`Subject: ${characterDesc}.`);
  } else {
    parts.push(`Subject: ${variant.subject}.`);
  }

  // Emotion
  parts.push(`Emotional tone: ${variant.emotion}.`);

  // Lighting
  parts.push(`Lighting: ${variant.lighting}.`);

  // Composition
  parts.push(`Composition: ${variant.composition}.`);

  // Hook text context — used to align the visual with the written hook's emotional register
  if (hookText) {
    parts.push(`The visual must support this written hook without illustrating it literally: "${hookText.slice(0, 120)}"`);
  }

  // Seasonal context
  if (seasonalModifier.prompt_append) {
    parts.push(`Seasonal context: ${seasonalModifier.prompt_append}.`);
  }

  // Awareness-level guidance
  if (awarenessLevel <= 2) {
    parts.push('The image speaks to a life moment — no gym advertising visible anywhere in the scene.');
  } else if (awarenessLevel <= 3) {
    parts.push('A subtle gym context is acceptable but not the focus — the human moment is the subject.');
  } else {
    parts.push('A gym context is acceptable and expected — but real people, not gym models.');
  }

  // Style anchors — aggressive imperfection cues to signal authenticity to FLUX
  parts.push(
    'Photography style: iPhone photo taken quickly without thinking. JPEG compression artifacts visible. Auto white balance slightly off — colour temperature not corrected. Background slightly blown out or underexposed — camera exposed for subject not scene. Subject not perfectly in focus — sharp enough but not tack sharp. Composition slightly tilted 1-2 degrees. One edge of subject partially cut off. No colour grading applied — straight from phone camera roll. Timestamp or notification bar visible in corner is acceptable. The photo was taken by someone who was not thinking about taking a photo.',
    'No text, watermarks, logos, or overlaid graphics in the image itself.'
  );

  // Hard exclusions — merge variant + character + seasonal avoids
  const avoidItems = [
    variant.do_not_show,
    characterAvoid,
    seasonalModifier.avoid || '',
    'stock photo aesthetic, AI-generated look, symmetrical posed composition, fitness model physique, before/after transformation framing, gym equipment as focal point, motivational poster aesthetic, obvious advertising composition',
  ].filter(Boolean).join(', ');
  parts.push(`DO NOT show: ${avoidItems}.`);

  // Competitor differentiation
  if (competitorInstructions) {
    parts.push(competitorInstructions);
  }

  return parts.join(' ');
}

// --- FAL API caller ---

async function callFalApi(
  prompt: string,
  seed: number,
  profile: FalProfile,
  falApiKey: string,
  attempt: number
): Promise<FalResponse> {
  const body = {
    prompt,
    seed,
    image_size: profile.image_size,
    num_inference_steps: profile.num_inference_steps,
    guidance_scale: profile.guidance_scale,
    safety_tolerance: profile.safety_tolerance,
    output_format: profile.output_format,
    num_images: 1,
    enable_safety_checker: true,
  };

  let lastError: Error | null = null;

  for (let retry = 0; retry < 3; retry++) {
    try {
      const resp = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`FAL API ${resp.status}: ${errText.slice(0, 200)}`);
      }

      return await resp.json() as FalResponse;
    } catch (err) {
      lastError = err as Error;
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
      }
    }
  }

  throw lastError ?? new Error(`FAL API failed after 3 retries (attempt ${attempt})`);
}

// --- Image downloader ---

async function downloadImage(url: string, localPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.ensureDirSync(path.dirname(localPath));
  fs.writeFileSync(localPath, buffer);
}

// --- Recovery prompt mutations ---

function applyRecoveryMutation(
  basePrompt: string,
  qualityResult: QualityResult,
  attempt: number
): string {
  const strategy = qualityResult.recovery_strategy;

  if (strategy === 'A') {
    // Authenticity failure — increase documentary cues, reduce polished composition
    return basePrompt
      .replace('Photorealistic documentary-style photograph.', 'Raw, candid, hand-held camera feel. Shot on iPhone or similar — slightly imperfect framing.')
      .replace('authenticity score 9/10', 'authenticity score 10/10 — deliberately imperfect')
      + ` Recovery attempt ${attempt}: prioritise grain, real lighting imperfections, slightly off-centre composition over polish.`;
  }

  if (strategy === 'B') {
    // Differentiation failure — looks too much like competitor ads
    return basePrompt
      + ` Recovery attempt ${attempt}: the previous image was rejected because it resembled competitor gym advertising. Shift setting entirely — move the scene outdoors or to a home environment. Remove all gym equipment from view. Make this look like it was taken by a documentary photographer, not a brand photographer.`;
  }

  if (strategy === 'C') {
    // Both failed — use a completely different scene direction
    return basePrompt
      .replace(/Photorealistic documentary-style photograph\. [^.]+\./, 'Photorealistic candid photograph. Person shown in a completely ordinary life moment unrelated to fitness — morning routine, neighbourhood walk, kitchen table.')
      + ` Recovery attempt ${attempt}: complete scene reset. Prioritise the feeling of privacy and real life over any visual polish.`;
  }

  return basePrompt + ` Recovery attempt ${attempt}.`;
}

// --- Main generator ---

/**
 * Generates one image for a given hook type and variant.
 * Applies two-stage quality gate with up to 2 recovery attempts.
 */
export async function generateImage(
  request: ImageGenerationRequest,
  anthropicClient: Anthropic
): Promise<GeneratedImage | null> {
  const falApiKey = process.env['FAL_API_KEY'];
  if (!falApiKey) {
    throw new Error('FAL_API_KEY not set in .env');
  }

  // Load all data files
  const hookVisualMap  = loadJson<HookVisualMap>('knowledge-base/creative/hook-visual-map.json');
  const seasonalData   = loadJson<SeasonalModifiers>('knowledge-base/creative/seasonal-visual-modifiers.json');
  const falProfiles    = loadJson<FalProfiles>('knowledge-base/creative/fal-parameter-profiles.json');
  const charRegistry   = loadJson<CharacterRegistry>('intelligence-db/creative/character-registry.json');

  if (!hookVisualMap || !seasonalData || !falProfiles || !charRegistry) {
    throw new Error('Missing required data files — run setup to initialise knowledge-base/creative/ and intelligence-db/creative/');
  }

  const hookConfig = hookVisualMap.hook_types[request.hook_type];
  if (!hookConfig) {
    throw new Error(`Unknown hook type: ${request.hook_type}. Valid types: ${Object.keys(hookVisualMap.hook_types).join(', ')}`);
  }

  const variantConfig = hookConfig.variants[request.variant];
  if (!variantConfig) {
    throw new Error(`No variant ${request.variant} for hook type ${request.hook_type}`);
  }

  // Build all context
  const seasonalModifier  = resolveSeasonalModifier(seasonalData);
  const charContext       = resolveCharacter(charRegistry, request.campaign_id, request.character_id);
  const falProfile        = resolveFalProfile(falProfiles, request.audience_temperature, request.placement);
  const fingerprint       = buildCompetitorFingerprint();

  const basePrompt = buildPrompt(
    variantConfig,
    request.hook_text,
    seasonalModifier,
    charContext.characterDesc,
    charContext.characterAvoid,
    fingerprint.differentiation_instructions,
    request.awareness_level,
    request.audience_temperature
  );

  // Asset naming
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix   = Math.random().toString(36).slice(2, 6).toUpperCase();
  const assetId  = `${request.asset_id_prefix}-${dateStr}-${request.variant}-${suffix}`;
  const ext      = falProfile.output_format === 'png' ? 'png' : 'jpg';
  const localDir = path.join(ROOT, 'outputs', request.business_context, 'images', request.hook_type);
  const localPath = path.join(localDir, `${assetId}.${ext}`);

  let currentPrompt = basePrompt;
  let seed = charContext.seed;
  let qualityResult: QualityResult | null = null;
  let falResponse: FalResponse | null = null;
  let recoveryAttempts = 0;

  // Generation loop — up to 3 attempts (1 initial + 2 recovery)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(chalk.gray(`  [image-generator] Attempt ${attempt}/3 — ${request.hook_type}-${request.variant}`));
      console.log(chalk.cyan(`  → Calling fal.ai FLUX Pro v1.1...`));

      falResponse = await callFalApi(currentPrompt, seed, falProfile, falApiKey, attempt);

      const imageUrl = falResponse.images[0]?.url;
      if (!imageUrl) throw new Error('FAL returned no image URL');

      // Download for quality evaluation
      const tempPath = localPath + `.attempt${attempt}.tmp.${ext}`;
      console.log(chalk.cyan(`  → Downloading image...`));
      await downloadImage(imageUrl, tempPath);

      // Two-stage quality gate (stage logs emitted inside evaluateImageQuality)
      qualityResult = await evaluateImageQuality(anthropicClient, tempPath, currentPrompt, fingerprint.competitor_patterns_to_avoid, request.hook_type);

      if (qualityResult.passed) {
        // Move temp file to final path
        fs.moveSync(tempPath, localPath, { overwrite: true });
        console.log(chalk.green(`  → Saved to ${localPath}`));
        console.log(chalk.green(`  [image-generator] PASS — score ${qualityResult.overall_score}/10`));
        break;
      }

      // Quality failed
      console.log(chalk.yellow(`  [image-generator] FAIL — ${qualityResult.failure_reason} (strategy: ${qualityResult.recovery_strategy})`));
      fs.removeSync(tempPath);

      if (attempt < 3) {
        recoveryAttempts++;
        currentPrompt = applyRecoveryMutation(basePrompt, qualityResult, attempt);
        seed = seed + attempt * 37; // shift seed for variation
      }

    } catch (err) {
      logError(`generateImage:attempt${attempt}:${assetId}`, err as Error);
      console.log(chalk.red(`  [image-generator] Error attempt ${attempt}: ${(err as Error).message}`));
      if (attempt === 3) return null;
    }
  }

  if (!falResponse || !qualityResult) return null;

  const imageUrl = falResponse.images[0]?.url;
  if (!imageUrl) return null;

  // If quality never passed, save the last attempt anyway with flag
  if (!fs.existsSync(localPath) && imageUrl) {
    try {
      await downloadImage(imageUrl, localPath);
    } catch {
      return null;
    }
  }

  const result: GeneratedImage = {
    asset_id: assetId,
    fal_image_url: imageUrl,
    local_path: localPath,
    prompt_used: currentPrompt,
    seed: falResponse.seed ?? seed,
    hook_type: request.hook_type,
    variant: request.variant,
    awareness_level: request.awareness_level,
    audience_temperature: request.audience_temperature,
    placement: request.placement,
    quality_passed: qualityResult.passed,
    quality_score: qualityResult.overall_score,
    quality_notes: qualityResult.notes,
    recovery_attempts: recoveryAttempts,
    generated_at: new Date().toISOString(),
  };

  logAsset(assetId, 'image-generator', request.variant, qualityResult.passed ? 'ready-to-post' : 'flagged', localPath);

  // Update character registry used_in
  try {
    const regPath = path.join(ROOT, 'intelligence-db', 'creative', 'character-registry.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as CharacterRegistry;
    const campaign = reg.campaigns[request.campaign_id];
    if (campaign && request.character_id) {
      const char = campaign.characters.find(c => c.character_id === request.character_id);
      if (char && !char.used_in.includes(assetId)) {
        char.used_in.push(assetId);
        fs.writeFileSync(regPath, JSON.stringify(reg, null, 2), 'utf-8');
      }
    }
  } catch { /* non-fatal */ }

  return result;
}

/**
 * Generates a pair of image variants (A + B) for a campaign ad set.
 * Called by generate.ts when skill = 'image-generator'.
 */
export async function generateImagePair(
  hookType: string,
  hookText: string,
  awarenessLevel: number,
  audienceTemp: 'cold' | 'warm' | 'retargeting',
  placement: string,
  campaignId: string,
  businessContext: string,
  testId: string
): Promise<{ variantA: GeneratedImage | null; variantB: GeneratedImage | null }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const base: Omit<ImageGenerationRequest, 'variant'> = {
    hook_type: hookType,
    hook_text: hookText,
    awareness_level: awarenessLevel,
    audience_temperature: audienceTemp,
    placement,
    campaign_id: campaignId,
    character_id: audienceTemp === 'cold' ? 'char-A' : 'char-B',
    business_context: businessContext,
    test_id: testId,
    asset_id_prefix: `image-${hookType}`,
  };

  console.log(chalk.bold.cyan(`\n  [image-generator] Generating ${hookType} × Variant A`));
  const variantA = await generateImage({ ...base, variant: 'A' }, client);

  console.log(chalk.bold.cyan(`\n  [image-generator] Generating ${hookType} × Variant B`));
  const variantB = await generateImage({ ...base, variant: 'B' }, client);

  return { variantA, variantB };
}

/**
 * Builds the prompt that would be sent to fal.ai for a given hook type and text,
 * without making any API call. Used by the AHRI handler to preview the prompt
 * when FAL_API_KEY is not yet configured.
 */
export function buildTestPrompt(hookType: string, hookText: string): string {
  const hookVisualMap  = loadJson<HookVisualMap>('knowledge-base/creative/hook-visual-map.json');
  const seasonalData   = loadJson<SeasonalModifiers>('knowledge-base/creative/seasonal-visual-modifiers.json');
  const charRegistry   = loadJson<CharacterRegistry>('intelligence-db/creative/character-registry.json');

  if (!hookVisualMap || !seasonalData || !charRegistry) {
    return '[Cannot build prompt — missing data files in knowledge-base/creative/ and intelligence-db/creative/]';
  }

  const hookConfig = hookVisualMap.hook_types[hookType];
  if (!hookConfig) return `[Unknown hook type: ${hookType}. Valid: ${Object.keys(hookVisualMap.hook_types).join(', ')}]`;

  const variantConfig = hookConfig.variants['A'];
  if (!variantConfig) return `[No variant A for hook type: ${hookType}]`;

  const seasonalModifier = resolveSeasonalModifier(seasonalData);
  const charContext      = resolveCharacter(charRegistry, 'no-risk-comeback-2026-04', 'char-A');
  const fingerprint      = buildCompetitorFingerprint();

  return buildPrompt(
    variantConfig,
    hookText,
    seasonalModifier,
    charContext.characterDesc,
    charContext.characterAvoid,
    fingerprint.differentiation_instructions,
    2,
    'cold'
  );
}

/** Alias used by AHRI intent handler — same as generateImagePair. */
export const generateCampaignImages = generateImagePair;

// --- CLI entry point ---

if (process.argv[1] && (process.argv[1].endsWith('image-generator.ts') || process.argv[1].endsWith('image-generator.js'))) {
  const hookType   = process.argv[2] ?? 'pain_point';
  const hookText   = process.argv[3] ?? 'You are tired in a way that sleep does not fix anymore.';
  const awareness  = parseInt(process.argv[4] ?? '2', 10);
  const audTemp    = (process.argv[5] ?? 'cold') as 'cold' | 'warm' | 'retargeting';
  const placement  = process.argv[6] ?? 'facebook_feed';
  const campaignId = process.argv[7] ?? 'no-risk-comeback-2026-04';
  const bizContext = process.argv[8] ?? 'anytime-fitness';
  const testId     = `image-test-${Date.now()}`;

  generateImagePair(hookType, hookText, awareness, audTemp, placement, campaignId, bizContext, testId)
    .then(({ variantA, variantB }) => {
      console.log('');
      if (variantA) {
        console.log(chalk.green(`  Variant A: ${variantA.asset_id} — ${variantA.quality_passed ? 'PASS' : 'FLAGGED'} (score ${variantA.quality_score}/10)`));
        console.log(chalk.gray(`    Path: ${variantA.local_path}`));
      } else {
        console.log(chalk.red('  Variant A: generation failed'));
      }
      if (variantB) {
        console.log(chalk.green(`  Variant B: ${variantB.asset_id} — ${variantB.quality_passed ? 'PASS' : 'FLAGGED'} (score ${variantB.quality_score}/10)`));
        console.log(chalk.gray(`    Path: ${variantB.local_path}`));
      } else {
        console.log(chalk.red('  Variant B: generation failed'));
      }
      console.log('');
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error(chalk.red('\n[FATAL]'), err.message);
      process.exit(1);
    });
}
