import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { buildCompetitorFingerprint } from './competitor-visual-fingerprinter.js';
import { evaluateImageQuality, QualityResult } from './image-quality-evaluator.js';
import { uploadFileToDrive } from './drive.js';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');
const ASSET_LOG  = path.join(ROOT, 'performance', 'asset-log.csv');
const DRIVE_RAW_FOLDER_ID = process.env['GOOGLE_DRIVE_RAW_FOLDER_ID'];
const MEDIA_INDEX_PATH = path.join(ROOT, 'intelligence-db', 'assets', 'media-index.json');
const PORTAL_MEDIA_INDEX_PATH = path.join(ROOT, 'marketing-portal', 'intelligence-db', 'assets', 'media-index.json');

if (!DRIVE_RAW_FOLDER_ID) {
  console.warn('[image-generator] ⚠ GOOGLE_DRIVE_RAW_FOLDER_ID not set');
  console.warn('[image-generator] Images will save locally only');
  console.warn('[image-generator] Add to .env to enable Drive upload');
}

// --- Types ---

export interface ImageGenerationRequest {
  scene_id: string;            // O1, E1, P1, etc. — unique scene identifier from v3.0 visual map
  category: string;             // object_shots | environment_shots | interrupted_action_shots
  hook_text: string;
  awareness_level: number;
  audience_temperature: 'cold' | 'warm' | 'retargeting';
  placement: string;
  campaign_id: string;
  character_id?: string;        // only meaningful for interrupted_action_shots (character_registry: true)
  business_context: string;
  test_id: string;
  asset_id_prefix: string;
}

export interface GeneratedImage {
  asset_id: string;
  fal_image_url: string;
  local_path: string;
  drive_file_id?: string;
  drive_url?: string;
  prompt_used: string;
  seed: number;
  scene_id: string;
  category: string;
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

// --- v3.0 Visual Map interfaces ---

interface V3ScenePerformance {
  ctr: null;
  cpl: null;
  thumbstop_rate: null;
  test_runs: number;
  last_tested: null;
  status: string;
}

interface V3Scene {
  scene_id: string;
  name: string;
  scene: string;
  composition: string;
  lighting: string;
  do_not_show: string;
  text_overlay_space: string;
  use_for?: string[];
  performance_data: V3ScenePerformance;
  // interrupted_action_shots only:
  subject?: string;
  emotion?: string;
}

interface V3CategoryRules {
  no_person?: boolean;
  no_person_or_behind_only?: boolean;
  no_posed_portraits?: boolean;
  no_camera_facing?: boolean;
  character_registry: boolean;
  style_anchor?: string;
  flux_generation?: boolean;
  portal_rendered?: boolean;
}

interface V3Category {
  label: string;
  description: string;
  generation_rules: V3CategoryRules;
  scenes?: Record<string, V3Scene>;
}

interface V3VisualMap {
  version: string;
  philosophy: string;
  single_test: string;
  categories: Record<string, V3Category>;
  generation_priority: Record<string, string[]>;
  retired_permanently: string[];
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

interface MediaIndexEntry {
  file_id: string;
  filename: string;
  source: 'ai_generated';
  generator: string;
  scene_id: string;
  category: string;
  platform: string;
  season: string;
  campaign_id: string;
  quality_scores: { differentiation: number; authenticity: number; overall: number };
  prompt_used: string;
  parameter_profile: string;
  status: 'pending_review';
  approved_at: null;
  drive_url: string;
  local_path: string;
  created_at: string;
  performance: { thumbstop_rate: null; ctr: null; updated_at: null };
}

interface MediaIndex {
  assets: MediaIndexEntry[];
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

function logAsset(assetId: string, skill: string, sceneId: string, status: string, filePath: string): void {
  try {
    fs.ensureDirSync(path.join(ROOT, 'performance'));
    if (!fs.existsSync(ASSET_LOG)) {
      fs.writeFileSync(ASSET_LOG, 'timestamp,asset_id,skill,scene_id,status,file_path\n', 'utf-8');
    }
    const row = `"${new Date().toISOString()}","${assetId}","${skill}","${sceneId}","${status}","${filePath}"\n`;
    fs.appendFileSync(ASSET_LOG, row);
  } catch {
    /* non-fatal */
  }
}

// --- Season helper ---

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month <= 2) return 'new_year';
  if (month === 3) return 'early_spring';
  if (month <= 5) return 'late_spring';
  if (month <= 8) return 'summer';
  if (month <= 10) return 'back_to_routine';
  return 'holiday_stretch';
}

// --- Drive upload ---

async function uploadToRawFolder(
  localPath: string,
  filename: string,
  sceneId: string,
  category: string,
  platform: string,
  qualityScore: number
): Promise<{ driveFileId: string; driveUrl: string } | null> {
  if (!DRIVE_RAW_FOLDER_ID) {
    console.log(chalk.gray('  [drive-upload] GOOGLE_DRIVE_RAW_FOLDER_ID not set — skipping Drive upload'));
    return null;
  }
  try {
    console.log(chalk.cyan('  → Uploading to Google Drive raw/...'));
    const fileBuffer = await fs.promises.readFile(localPath);
    const mimeType = localPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const driveFile = await uploadFileToDrive({
      buffer: fileBuffer,
      filename,
      mimeType,
      folderId: DRIVE_RAW_FOLDER_ID,
      description: JSON.stringify({
        scene_id: sceneId,
        category,
        platform,
        quality_score: qualityScore,
        source: 'ai_generated',
        generator: 'fal-flux-pro-v1.1',
        created_at: new Date().toISOString(),
      }),
    });
    console.log(chalk.green(`  → Uploaded to Drive: ${driveFile.webViewLink}`));
    return { driveFileId: driveFile.id, driveUrl: driveFile.webViewLink };
  } catch (error) {
    logError('uploadToRawFolder', error as Error);
    console.log(chalk.yellow(`  [drive-upload] Failed: ${(error as Error).message}`));
    console.log(chalk.gray('  [drive-upload] Continuing with local save only'));
    return null;
  }
}

// --- Media index ---

function updateMediaIndex(entry: MediaIndexEntry): void {
  try {
    let index: MediaIndex = { assets: [] };
    if (fs.existsSync(MEDIA_INDEX_PATH)) {
      index = JSON.parse(fs.readFileSync(MEDIA_INDEX_PATH, 'utf-8')) as MediaIndex;
      if (!Array.isArray(index.assets)) index.assets = [];
    }
    index.assets.push(entry);
    const json = JSON.stringify(index, null, 2);
    fs.ensureDirSync(path.dirname(MEDIA_INDEX_PATH));
    fs.writeFileSync(MEDIA_INDEX_PATH, json, 'utf-8');
    const portalRoot = path.join(ROOT, 'marketing-portal');
    if (fs.existsSync(portalRoot)) {
      fs.ensureDirSync(path.dirname(PORTAL_MEDIA_INDEX_PATH));
      fs.writeFileSync(PORTAL_MEDIA_INDEX_PATH, json, 'utf-8');
    }
    console.log(chalk.green(`  → Media index updated: ${index.assets.length} asset(s)`));
  } catch (err) {
    logError('updateMediaIndex', err as Error);
    console.log(chalk.yellow('  [media-index] Failed to update media index — non-fatal'));
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

// --- v3.0 Scene helpers ---

interface FoundScene {
  scene: V3Scene;
  rules: V3CategoryRules;
  category: string;
}

function findScene(map: V3VisualMap, sceneId: string): FoundScene | null {
  for (const [catKey, cat] of Object.entries(map.categories)) {
    if (!cat.scenes) continue;
    const scene = cat.scenes[sceneId];
    if (scene) return { scene, rules: cat.generation_rules, category: catKey };
  }
  return null;
}

function getAllSceneIds(map: V3VisualMap): string[] {
  const ids: string[] = [];
  for (const cat of Object.values(map.categories)) {
    if (cat.scenes) ids.push(...Object.keys(cat.scenes));
  }
  return ids;
}

function resolvePriorityKey(audienceTemp: string, awarenessLevel: number): string {
  if (audienceTemp === 'retargeting') return 'retargeting';
  if (audienceTemp === 'warm') return 'warm_audience';
  return awarenessLevel <= 2 ? 'cold_audience_awareness_2' : 'cold_audience_awareness_3';
}

function selectScenesFromPriority(map: V3VisualMap, priorityKey: string, count: number): string[] {
  const pool = (map.generation_priority[priorityKey] ?? []).filter(id => !id.startsWith('T'));
  const unique = [...new Set(pool)];
  // Shuffle
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j]!, unique[i]!];
  }
  return unique.slice(0, count);
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

// --- Character resolver (interrupted_action_shots only) ---

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
  if (!char) char = campaign.characters[0];
  if (!char) return { seed: campaign.seed_base, characterDesc: '', characterAvoid: '' };

  return {
    seed: campaign.seed_base + char.seed_offset,
    characterDesc: char.description,
    characterAvoid: char.avoid,
  };
}

// --- FAL profile resolver ---

function resolveFalProfile(profiles: FalProfiles, audienceTemp: string, placement: string): FalProfile {
  const key = placement === 'stories'
    ? 'stories_vertical'
    : audienceTemp === 'cold'
      ? 'cold_audience_static'
      : audienceTemp === 'warm'
        ? 'warm_audience_static'
        : 'retargeting_static';

  return profiles.profiles[key] ?? profiles.profiles['cold_audience_static']!;
}

// --- v3.0 Prompt builder ---

function buildPromptV3(
  scene: V3Scene,
  rules: V3CategoryRules,
  hookText: string,
  seasonalModifier: SeasonalModifier,
  characterDesc: string,
  characterAvoid: string,
  competitorInstructions: string,
  awarenessLevel: number
): string {
  const parts: string[] = [];

  const hasHuman = !rules.no_person && !rules.no_person_or_behind_only;
  const styleAnchor = rules.style_anchor ?? 'iPhone photo taken quickly without thinking.';

  // Core scene
  parts.push(`Photorealistic photograph. ${scene.scene}`);

  // Subject — only for interrupted_action_shots
  if (hasHuman && scene.subject) {
    if (characterDesc) {
      parts.push(`Subject: ${characterDesc}.`);
    } else {
      parts.push(`Subject: ${scene.subject}.`);
    }
  }

  // Emotion — only for interrupted_action_shots
  if (hasHuman && scene.emotion) {
    parts.push(`Emotional tone: ${scene.emotion}.`);
  }

  // Lighting
  parts.push(`Lighting: ${scene.lighting}.`);

  // Composition
  parts.push(`Composition: ${scene.composition}.`);

  // Hook text alignment — only for human shots (object/env shots have no human to feel the hook)
  if (hasHuman && hookText) {
    parts.push(`The visual must support this written hook without illustrating it literally: "${hookText.slice(0, 120)}"`);
  }

  // Seasonal context
  if (seasonalModifier.prompt_append) {
    parts.push(`Seasonal context: ${seasonalModifier.prompt_append}.`);
  }

  // Awareness-level guidance
  if (awarenessLevel <= 2) {
    parts.push('No gym advertising, gym signage, or fitness context visible anywhere in the scene.');
  } else if (awarenessLevel <= 3) {
    parts.push('A subtle gym context is acceptable but not the focus — the specific object or human moment is the subject.');
  } else {
    parts.push('A gym context is acceptable — but real people and real spaces, not staged photography.');
  }

  // Style anchor — drives authenticity in FLUX
  parts.push(`Photography style: ${styleAnchor}`);
  parts.push(
    'JPEG compression artifacts acceptable. Auto white balance acceptable — colour temperature not corrected. Background slightly blown out or underexposed. Slightly imperfect framing — horizon not perfectly level, one edge of subject may be cut off. No colour grading applied — straight from phone camera roll. No text, watermarks, logos, or overlaid graphics in the image itself.'
  );

  // Hard exclusions
  const avoidParts = [
    scene.do_not_show,
    hasHuman ? characterAvoid : '',
    seasonalModifier.avoid || '',
    'stock photo aesthetic, AI-generated look, symmetrical posed composition, fitness model physique, before/after transformation framing, motivational poster aesthetic, obvious advertising composition, studio lighting, ring light, professional backdrop',
    rules.no_person ? 'any person visible anywhere in the frame' : '',
    rules.no_posed_portraits ? 'posed portrait, camera-facing direct gaze, intentional expression for camera' : '',
  ].filter(s => s.length > 0).join(', ');
  parts.push(`DO NOT show: ${avoidParts}.`);

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
    return basePrompt
      .replace('Photorealistic photograph.', 'Raw, candid, hand-held feel. Shot on iPhone — slightly imperfect.')
      + ` Recovery attempt ${attempt}: prioritise imperfection, real lighting, off-centre composition over any polish. The image must pass this test: would someone stop scrolling because they recognise this as their own life, not because it is beautiful?`;
  }

  if (strategy === 'B') {
    return basePrompt
      + ` Recovery attempt ${attempt}: previous image was rejected for resembling competitor gym advertising. Shift setting entirely — move the scene outdoors or to a home environment. Remove all gym equipment from view. Documentary photographer, not brand photographer.`;
  }

  if (strategy === 'C') {
    return basePrompt
      .replace(/Photorealistic photograph\. [^.]+\./, 'Photorealistic candid photograph. Person shown in a completely ordinary life moment unrelated to fitness — morning routine, neighbourhood walk, kitchen table.')
      + ` Recovery attempt ${attempt}: complete scene reset. Prioritise the feeling of privacy and real life over any visual polish.`;
  }

  return basePrompt + ` Recovery attempt ${attempt}.`;
}

// --- Main generator ---

/**
 * Generates one image for a given scene_id.
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

  // Load data files
  const visualMap   = loadJson<V3VisualMap>('knowledge-base/creative/hook-visual-map.json');
  const seasonalData = loadJson<SeasonalModifiers>('knowledge-base/creative/seasonal-visual-modifiers.json');
  const falProfiles  = loadJson<FalProfiles>('knowledge-base/creative/fal-parameter-profiles.json');
  // Character registry is optional — only used for interrupted_action_shots
  const charRegistry = loadJson<CharacterRegistry>('intelligence-db/creative/character-registry.json');

  if (!visualMap || !seasonalData || !falProfiles) {
    throw new Error('Missing required data files — knowledge-base/creative/ must contain hook-visual-map.json, seasonal-visual-modifiers.json, fal-parameter-profiles.json');
  }

  // Find the scene in the visual map
  const found = findScene(visualMap, request.scene_id);
  if (!found) {
    throw new Error(`Unknown scene_id: ${request.scene_id}. Valid IDs: ${getAllSceneIds(visualMap).join(', ')}`);
  }
  const { scene, rules } = found;

  // Build context
  const seasonalModifier = resolveSeasonalModifier(seasonalData);
  const falProfile = resolveFalProfile(falProfiles, request.audience_temperature, request.placement);
  const fingerprint = buildCompetitorFingerprint();

  // Character: only for interrupted_action_shots (character_registry: true)
  let characterDesc = '';
  let characterAvoid = '';
  let seed = Math.floor(Math.random() * 999999);

  if (rules.character_registry && charRegistry) {
    const charContext = resolveCharacter(charRegistry, request.campaign_id, request.character_id);
    characterDesc = charContext.characterDesc;
    characterAvoid = charContext.characterAvoid;
    seed = charContext.seed;
  }

  const basePrompt = buildPromptV3(
    scene,
    rules,
    request.hook_text,
    seasonalModifier,
    characterDesc,
    characterAvoid,
    fingerprint.differentiation_instructions,
    request.awareness_level
  );

  // Asset naming
  const dateStr   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix    = Math.random().toString(36).slice(2, 6).toUpperCase();
  const assetId   = `${request.asset_id_prefix}-${dateStr}-${request.scene_id}-${suffix}`;
  const ext       = falProfile.output_format === 'png' ? 'png' : 'jpg';
  const localDir  = path.join(ROOT, 'outputs', request.business_context, 'images', found.category);
  const localPath = path.join(localDir, `${assetId}.${ext}`);
  const profileKey = request.placement === 'stories' ? 'stories_vertical'
    : request.audience_temperature === 'cold' ? 'cold_audience_static'
    : request.audience_temperature === 'warm' ? 'warm_audience_static'
    : 'retargeting_static';

  let currentPrompt = basePrompt;
  let qualityResult: QualityResult | null = null;
  let falResponse: FalResponse | null = null;
  let recoveryAttempts = 0;
  let driveResult: { driveFileId: string; driveUrl: string } | null = null;

  // Generation loop — up to 3 attempts (1 initial + 2 recovery)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(chalk.gray(`  [image-generator] Attempt ${attempt}/3 — ${request.scene_id} (${scene.name})`));
      console.log(chalk.cyan('  → Calling fal.ai FLUX Pro v1.1...'));

      falResponse = await callFalApi(currentPrompt, seed, falProfile, falApiKey, attempt);

      const imageUrl = falResponse.images[0]?.url;
      if (!imageUrl) throw new Error('FAL returned no image URL');

      const tempPath = localPath + `.attempt${attempt}.tmp.${ext}`;
      console.log(chalk.cyan('  → Downloading image...'));
      await downloadImage(imageUrl, tempPath);

      qualityResult = await evaluateImageQuality(
        anthropicClient, tempPath, currentPrompt,
        fingerprint.competitor_patterns_to_avoid, request.scene_id
      );

      if (qualityResult.passed) {
        fs.moveSync(tempPath, localPath, { overwrite: true });
        console.log(chalk.green(`  → Saved locally: ${localPath}`));

        const filename = path.basename(localPath);
        driveResult = await uploadToRawFolder(
          localPath, filename, request.scene_id, found.category,
          request.placement, qualityResult.overall_score
        );

        if (driveResult) {
          updateMediaIndex({
            file_id: driveResult.driveFileId,
            filename,
            source: 'ai_generated',
            generator: 'fal-flux-pro-v1.1',
            scene_id: request.scene_id,
            category: found.category,
            platform: request.placement,
            season: getCurrentSeason(),
            campaign_id: request.campaign_id,
            quality_scores: {
              differentiation: qualityResult.differentiation_score,
              authenticity: qualityResult.authenticity_score,
              overall: qualityResult.overall_score,
            },
            prompt_used: currentPrompt,
            parameter_profile: profileKey,
            status: 'pending_review',
            approved_at: null,
            drive_url: driveResult.driveUrl,
            local_path: localPath,
            created_at: new Date().toISOString(),
            performance: { thumbstop_rate: null, ctr: null, updated_at: null },
          });
        } else {
          console.log(chalk.gray('  [drive-upload] Manual upload needed to Drive raw/ folder'));
        }

        console.log(chalk.green(`  [image-generator] PASS — score ${qualityResult.overall_score}/10`));
        break;
      }

      // Quality failed
      console.log(chalk.yellow(`  [image-generator] FAIL — ${qualityResult.failure_reason} (strategy: ${qualityResult.recovery_strategy})`));
      fs.removeSync(tempPath);

      if (attempt < 3) {
        recoveryAttempts++;
        currentPrompt = applyRecoveryMutation(basePrompt, qualityResult, attempt);
        seed = seed + attempt * 37;
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

  // Save the last attempt if quality never passed (flagged)
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
    drive_file_id: driveResult?.driveFileId,
    drive_url: driveResult?.driveUrl,
    prompt_used: currentPrompt,
    seed: falResponse.seed ?? seed,
    scene_id: request.scene_id,
    category: found.category,
    awareness_level: request.awareness_level,
    audience_temperature: request.audience_temperature,
    placement: request.placement,
    quality_passed: qualityResult.passed,
    quality_score: qualityResult.overall_score,
    quality_notes: qualityResult.notes,
    recovery_attempts: recoveryAttempts,
    generated_at: new Date().toISOString(),
  };

  logAsset(assetId, 'image-generator', request.scene_id, qualityResult.passed ? 'ready-to-post' : 'flagged', localPath);

  // Update character registry used_in (interrupted_action_shots only)
  if (rules.character_registry && request.character_id) {
    try {
      const regPath = path.join(ROOT, 'intelligence-db', 'creative', 'character-registry.json');
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as CharacterRegistry;
      const campaign = reg.campaigns[request.campaign_id];
      if (campaign) {
        const char = campaign.characters.find(c => c.character_id === request.character_id);
        if (char && !char.used_in.includes(assetId)) {
          char.used_in.push(assetId);
          fs.writeFileSync(regPath, JSON.stringify(reg, null, 2), 'utf-8');
        }
      }
    } catch { /* non-fatal */ }
  }

  return result;
}

/**
 * Generates a pair of images for a campaign ad set.
 * Randomly selects two different scenes from the generation_priority pool
 * for the given audience temperature and awareness level.
 */
export async function generateImagePair(
  audienceTemp: 'cold' | 'warm' | 'retargeting',
  awarenessLevel: number,
  hookText: string,
  placement: string,
  campaignId: string,
  businessContext: string,
  testId: string
): Promise<{ variantA: GeneratedImage | null; variantB: GeneratedImage | null }> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const visualMap = loadJson<V3VisualMap>('knowledge-base/creative/hook-visual-map.json');
  if (!visualMap) throw new Error('hook-visual-map.json not found');

  const priorityKey = resolvePriorityKey(audienceTemp, awarenessLevel);
  const sceneIds = selectScenesFromPriority(visualMap, priorityKey, 2);
  const sceneAId = sceneIds[0] ?? 'O1';
  const sceneBId = sceneIds[1] ?? 'O2';

  const foundA = findScene(visualMap, sceneAId);
  const foundB = findScene(visualMap, sceneBId);
  if (!foundA) throw new Error(`Scene ${sceneAId} not found in visual map`);
  if (!foundB) throw new Error(`Scene ${sceneBId} not found in visual map`);

  const base = {
    hook_text: hookText,
    awareness_level: awarenessLevel,
    audience_temperature: audienceTemp,
    placement,
    campaign_id: campaignId,
    business_context: businessContext,
    test_id: testId,
  };

  console.log(chalk.bold.cyan(`\n  [image-generator] Scene A: ${sceneAId} — ${foundA.scene.name}`));
  const variantA = await generateImage({
    ...base,
    scene_id: sceneAId,
    category: foundA.category,
    character_id: foundA.rules.character_registry ? 'char-A' : undefined,
    asset_id_prefix: `image-${sceneAId.toLowerCase()}`,
  }, client);

  console.log(chalk.bold.cyan(`\n  [image-generator] Scene B: ${sceneBId} — ${foundB.scene.name}`));
  const variantB = await generateImage({
    ...base,
    scene_id: sceneBId,
    category: foundB.category,
    character_id: foundB.rules.character_registry ? 'char-B' : undefined,
    asset_id_prefix: `image-${sceneBId.toLowerCase()}`,
  }, client);

  return { variantA, variantB };
}

/**
 * Builds the prompt that would be sent to fal.ai for a given scene_id,
 * without making any API call. Used by the AHRI handler to preview the prompt.
 */
export function buildTestPrompt(sceneId: string, hookText: string): string {
  const visualMap   = loadJson<V3VisualMap>('knowledge-base/creative/hook-visual-map.json');
  const seasonalData = loadJson<SeasonalModifiers>('knowledge-base/creative/seasonal-visual-modifiers.json');

  if (!visualMap || !seasonalData) {
    return '[Cannot build prompt — missing data files in knowledge-base/creative/]';
  }

  const found = findScene(visualMap, sceneId);
  if (!found) {
    return `[Unknown scene: ${sceneId}. Valid IDs: ${getAllSceneIds(visualMap).join(', ')}]`;
  }

  const seasonalModifier = resolveSeasonalModifier(seasonalData);
  const fingerprint = buildCompetitorFingerprint();

  return buildPromptV3(
    found.scene,
    found.rules,
    hookText,
    seasonalModifier,
    '',
    '',
    fingerprint.differentiation_instructions,
    2
  );
}

/**
 * Returns the generation priority pool for a given audience context.
 * Used by the AHRI handler to show the generation plan before calling FAL.
 */
export function getGenerationPlan(
  audienceTemp: 'cold' | 'warm' | 'retargeting',
  awarenessLevel: number
): { priorityKey: string; scenes: Array<{ id: string; name: string; category: string }> } {
  const visualMap = loadJson<V3VisualMap>('knowledge-base/creative/hook-visual-map.json');
  if (!visualMap) return { priorityKey: 'unknown', scenes: [] };

  const priorityKey = resolvePriorityKey(audienceTemp, awarenessLevel);
  const pool = [...new Set((visualMap.generation_priority[priorityKey] ?? []).filter(id => !id.startsWith('T')))];

  const scenes = pool.map(id => {
    const found = findScene(visualMap, id);
    return { id, name: found?.scene.name ?? id, category: found?.category ?? 'unknown' };
  });

  return { priorityKey, scenes };
}

/** Alias used by AHRI intent handler — same as generateImagePair. */
export const generateCampaignImages = generateImagePair;

// --- CLI entry point ---

if (process.argv[1] && (process.argv[1].endsWith('image-generator.ts') || process.argv[1].endsWith('image-generator.js'))) {
  const sceneId   = process.argv[2] ?? 'O1';
  const hookText  = process.argv[3] ?? 'You are tired in a way that sleep does not fix anymore.';
  const awareness = parseInt(process.argv[4] ?? '2', 10);
  const audTemp   = (process.argv[5] ?? 'cold') as 'cold' | 'warm' | 'retargeting';
  const placement = process.argv[6] ?? 'facebook_feed';
  const campaignId = process.argv[7] ?? 'no-risk-comeback-2026-04';
  const bizContext = process.argv[8] ?? 'anytime-fitness';
  const testId    = `image-test-${Date.now()}`;

  // If sceneId is a category key or 'pair', generate a pair from priority
  if (sceneId === 'pair' || ['cold', 'warm', 'retargeting'].includes(sceneId)) {
    const temp = ['cold', 'warm', 'retargeting'].includes(sceneId) ? sceneId as 'cold' | 'warm' | 'retargeting' : audTemp;
    generateImagePair(temp, awareness, hookText, placement, campaignId, bizContext, testId)
      .then(({ variantA, variantB }) => {
        console.log('');
        if (variantA) {
          console.log(chalk.green(`  Scene A (${variantA.scene_id}): ${variantA.quality_passed ? 'PASS' : 'FLAGGED'} — score ${variantA.quality_score}/10`));
          console.log(chalk.gray(`    Path: ${variantA.local_path}`));
        } else {
          console.log(chalk.red('  Scene A: generation failed'));
        }
        if (variantB) {
          console.log(chalk.green(`  Scene B (${variantB.scene_id}): ${variantB.quality_passed ? 'PASS' : 'FLAGGED'} — score ${variantB.quality_score}/10`));
          console.log(chalk.gray(`    Path: ${variantB.local_path}`));
        } else {
          console.log(chalk.red('  Scene B: generation failed'));
        }
        console.log('');
        process.exit(0);
      })
      .catch((err: Error) => {
        console.error(chalk.red('\n[FATAL]'), err.message);
        process.exit(1);
      });
  } else {
    // Single scene generation
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) { console.error('[FATAL] ANTHROPIC_API_KEY not set'); process.exit(1); }
    const client = new Anthropic({ apiKey });

    const visualMap = loadJson<V3VisualMap>('knowledge-base/creative/hook-visual-map.json');
    const found = visualMap ? findScene(visualMap, sceneId) : null;
    if (!found) {
      console.error(`[FATAL] Unknown scene_id: ${sceneId}. Valid IDs: ${visualMap ? getAllSceneIds(visualMap).join(', ') : 'map not loaded'}`);
      process.exit(1);
    }

    generateImage({
      scene_id: sceneId,
      category: found.category,
      hook_text: hookText,
      awareness_level: awareness,
      audience_temperature: audTemp,
      placement,
      campaign_id: campaignId,
      character_id: found.rules.character_registry ? 'char-A' : undefined,
      business_context: bizContext,
      test_id: testId,
      asset_id_prefix: `image-${sceneId.toLowerCase()}`,
    }, client)
      .then(result => {
        console.log('');
        if (result) {
          console.log(chalk.green(`  ${result.scene_id} (${result.category}): ${result.quality_passed ? 'PASS' : 'FLAGGED'} — score ${result.quality_score}/10`));
          console.log(chalk.gray(`    Path: ${result.local_path}`));
        } else {
          console.log(chalk.red('  Generation failed after 3 attempts'));
        }
        console.log('');
        process.exit(0);
      })
      .catch((err: Error) => {
        console.error(chalk.red('\n[FATAL]'), err.message);
        process.exit(1);
      });
  }
}
