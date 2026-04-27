import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as drive from './drive.js';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');

// --- Types ---

interface VisionTags {
  moment_type: string;
  emotional_tone: string;
  people_present: string;
  approximate_age_range: string;
  setting: string;
  lighting_quality: string;
  authenticity_score: number;
  schwartz_level_fit: number[];
  ad_audience_fit: string[];
  content_type_fit: string[];
  faces_visible: boolean;
  gym_branding_visible: boolean;
  quality_pass: boolean;
  recommended_subfolder: string;
  usage_notes: string;
  do_not_use_reason: string | null;
  suggested_clip_length?: string;
}

interface MediaIndexEntry {
  file_id: string;
  file_name: string;
  drive_folder: string;
  processed_date: string;
  release_status: 'CLEARED' | 'REQUIRED' | 'NO_FACES';
  tags: VisionTags;
  used_in: string[];
}

interface MediaIndex {
  index_file_id: string;
  entries: MediaIndexEntry[];
}

interface ShotListItem {
  priority: 1 | 2 | 3;
  description: string;
  reason: string;
}

export interface MediaReport {
  files_processed: number;
  files_approved: number;
  files_rejected: number;
  files_skipped_empty: boolean;
  releases_required: string[];
  shot_list_additions: ShotListItem[];
  coverage_gaps: string[];
  library_summary: {
    total_approved: number;
    by_subfolder: Record<string, number>;
    ad_ready_count: number;
  };
}

// --- Constants ---

const VISION_SYSTEM_PROMPT = `You are AHRI's media intelligence system for a gym marketing operation. Analyze this photo and return ONLY a valid JSON object with these exact fields — no explanation, no markdown, just JSON:
{
  "moment_type": "one of [coaching | member_solo | member_group | staff | facility | atmosphere | outdoor | candid]",
  "emotional_tone": "one of [warm | energetic | quiet | proud | determined | welcoming | authentic | mixed]",
  "people_present": "one of [member_only | staff_only | both | none]",
  "approximate_age_range": "one of [under_30 | 30_to_45 | 45_plus | mixed | no_people]",
  "setting": "one of [gym_floor | reception | outdoor | equipment_area | coaching_space | unknown]",
  "lighting_quality": "one of [excellent | good | acceptable | poor]",
  "authenticity_score": "integer 1-10 (10 = completely candid, 1 = clearly staged)",
  "schwartz_level_fit": "array of integers 1-5",
  "ad_audience_fit": "array of strings from [cold | warm | retargeting]",
  "content_type_fit": "array of strings from [social_proof | education | offer | culture]",
  "faces_visible": "boolean",
  "gym_branding_visible": "boolean",
  "quality_pass": "boolean",
  "recommended_subfolder": "one of [members | staff | gym | moments | seasonal]",
  "usage_notes": "string (one specific sentence)",
  "do_not_use_reason": "string or null"
}`;

const INITIAL_SHOT_LIST: ShotListItem[] = [
  {
    priority: 1,
    description: 'Coaching moment — coach and member mid-conversation, not posed, warm light, gym floor',
    reason: 'No coaching moments in library — needed for social proof content across all awareness levels',
  },
  {
    priority: 1,
    description: 'Empty gym early morning — 5:30-6am, atmospheric, lights on, nobody there',
    reason: 'Atmosphere shot needed for culture content and Facebook long-form posts',
  },
  {
    priority: 1,
    description: 'Member at 30-day milestone — any genuine positive moment, candid not staged',
    reason: 'Cornerstone moment for content calendar — highest emotional resonance for lifestyle avatar',
  },
  {
    priority: 1,
    description: 'Two members who know each other — talking between sets, community feel',
    reason: 'Social archetype nurture content — community proof is highest-converting for Social archetype',
  },
  {
    priority: 1,
    description: 'Parent doing something active — outdoor if possible, lifestyle not gym-specific',
    reason: 'Cornerstone resolution shot — resolves winning hook #1 (parent/child angle)',
  },
];

// --- Logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","media-analyzer","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Vision analysis ---

async function analyzeImageWithClaude(client: Anthropic, imageBuffer: Buffer, mimeType: string): Promise<VisionTags | null> {
  try {
    const base64 = imageBuffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType as 'image/jpeg' | 'image/png' | 'image/webp' : 'image/jpeg';

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: VISION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        }],
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as VisionTags;
  } catch (err) {
    logError('analyzeImageWithClaude', err as Error);
    return null;
  }
}

async function extractVideoFrame(videoBuffer: Buffer): Promise<Buffer | null> {
  // sharp does not support video frame extraction — this requires ffmpeg in production.
  // For now: return a small placeholder buffer and flag it as video-only analysis.
  // [KAI — to enable full video frame analysis, install ffmpeg and use fluent-ffmpeg to extract frame 1s.]
  try {
    const sharp = await import('sharp');
    // Attempt to treat it as an image anyway (will fail for most videos — caught below)
    const metadata = await sharp.default(videoBuffer).metadata();
    if (metadata.width) {
      return videoBuffer; // Not a real frame but passes to analyzer
    }
    return null;
  } catch {
    return null; // Video frame extraction not available without ffmpeg
  }
}

// --- Coverage check ---

function checkCoverageGaps(entries: MediaIndexEntry[]): string[] {
  const approved = entries.filter(e => e.tags.quality_pass);
  const gaps: string[] = [];

  const hasCoaching = approved.some(e => e.tags.moment_type === 'coaching');
  if (!hasCoaching) gaps.push('No approved coaching moment photos — needed for Trigger 3 referral and social proof content');

  const hasMember3045 = approved.some(e =>
    e.tags.approximate_age_range === '30_to_45' && e.tags.people_present !== 'none'
  );
  if (!hasMember3045) gaps.push('No approved photos of members aged 30-45 — primary lifestyle avatar age range');

  const hasEarlyMorning = approved.some(e =>
    e.tags.setting === 'gym_floor' && e.tags.people_present === 'none'
  );
  if (!hasEarlyMorning) gaps.push('No early morning atmosphere shot — needed for culture content category');

  const hasCandidGroup = approved.some(e =>
    e.tags.moment_type === 'member_group' && e.tags.authenticity_score >= 7
  );
  if (!hasCandidGroup) gaps.push('No candid member group moment — critical for Social archetype content');

  const hasOutdoor = approved.some(e => e.tags.setting === 'outdoor');
  if (!hasOutdoor) gaps.push('No outdoor lifestyle moment — needed for cornerstone content calendar resolution');

  const hasProudExpression = approved.some(e =>
    ['proud', 'determined'].includes(e.tags.emotional_tone) && e.tags.authenticity_score >= 7
  );
  if (!hasProudExpression) gaps.push('No candid proud/accomplished member expression — highest-converting creative element');

  return gaps;
}

function buildShotListAdditions(entries: MediaIndexEntry[], gaps: string[]): ShotListItem[] {
  if (entries.length === 0) {
    // Empty library — return the initial shot list
    return INITIAL_SHOT_LIST;
  }

  // Build additions from gaps
  const additions: ShotListItem[] = [];

  if (gaps.some(g => g.includes('coaching'))) {
    additions.push({
      priority: 1,
      description: 'Coaching moment — coach and member mid-conversation, authentic, warm light',
      reason: gaps.find(g => g.includes('coaching')) ?? 'Coverage gap',
    });
  }

  if (gaps.some(g => g.includes('30-45'))) {
    additions.push({
      priority: 1,
      description: 'Member aged 30-45 — any authentic gym moment, face visible (with release)',
      reason: 'Primary avatar age range not represented in approved library',
    });
  }

  if (gaps.some(g => g.includes('atmosphere'))) {
    additions.push({
      priority: 2,
      description: 'Early morning gym floor — empty or near-empty, atmospheric lighting',
      reason: 'Culture content category needs atmosphere shots',
    });
  }

  if (gaps.some(g => g.includes('group'))) {
    additions.push({
      priority: 1,
      description: 'Two or more members in natural conversation — between sets, locker room, reception',
      reason: 'Social archetype nurture and community proof content',
    });
  }

  if (gaps.some(g => g.includes('outdoor'))) {
    additions.push({
      priority: 2,
      description: 'Member doing outdoor activity — hiking, biking, park — lifestyle not gym-specific',
      reason: 'Cornerstone content calendar requires outdoor spring moment',
    });
  }

  return additions;
}

// --- Library summary ---

function buildLibrarySummary(entries: MediaIndexEntry[]): MediaReport['library_summary'] {
  const approved = entries.filter(e => e.tags.quality_pass);
  const bySubfolder: Record<string, number> = {};

  approved.forEach(e => {
    const sub = e.tags.recommended_subfolder ?? 'unsorted';
    bySubfolder[sub] = (bySubfolder[sub] ?? 0) + 1;
  });

  const adReady = approved.filter(e =>
    e.release_status !== 'REQUIRED' &&
    e.tags.lighting_quality !== 'poor' &&
    e.tags.authenticity_score >= 6
  ).length;

  return {
    total_approved: approved.length,
    by_subfolder: bySubfolder,
    ad_ready_count: adReady,
  };
}

// --- Main ---

export async function processNewMedia(): Promise<MediaReport> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const client = new Anthropic({ apiKey });

  const mediaFolderId = process.env['GOOGLE_DRIVE_MEDIA_FOLDER_ID'];
  if (!mediaFolderId) {
    console.log(chalk.yellow('\n  [Media Analyzer] GOOGLE_DRIVE_MEDIA_FOLDER_ID not set.'));
    console.log(chalk.gray('  Generating initial shot list from content calendar needs.\n'));

    return {
      files_processed: 0,
      files_approved: 0,
      files_rejected: 0,
      files_skipped_empty: true,
      releases_required: [],
      shot_list_additions: INITIAL_SHOT_LIST,
      coverage_gaps: [
        'No Google Drive folder configured — set GOOGLE_DRIVE_MEDIA_FOLDER_ID in .env',
        'All 6 initial shot list items are Priority 1',
      ],
      library_summary: { total_approved: 0, by_subfolder: {}, ad_ready_count: 0 },
    };
  }

  // Step 1 — Locate subfolders
  console.log(chalk.bold.cyan('\n  [Media Analyzer] Scanning Drive folder...\n'));

  const rawFolderId = await drive.getFolderIdByName(mediaFolderId, 'raw');
  if (!rawFolderId) {
    console.log(chalk.yellow('  raw/ subfolder not found in media folder. Nothing to process.'));
    const allEntries = await loadMediaIndex(mediaFolderId);
    const gaps = checkCoverageGaps(allEntries.entries);
    return {
      files_processed: 0,
      files_approved: 0,
      files_rejected: 0,
      files_skipped_empty: true,
      releases_required: [],
      shot_list_additions: buildShotListAdditions(allEntries.entries, gaps),
      coverage_gaps: gaps,
      library_summary: buildLibrarySummary(allEntries.entries),
    };
  }

  // Load existing media index
  const mediaIndex = await loadMediaIndex(mediaFolderId);
  const indexedIds = new Set(mediaIndex.entries.map(e => e.file_id));

  // Step 1 — Scan raw/ for new files
  const newFiles = await drive.listNewFiles(rawFolderId, indexedIds);

  if (newFiles.length === 0) {
    console.log(chalk.gray('  Raw folder is empty. Nothing to process.'));
    const gaps = checkCoverageGaps(mediaIndex.entries);
    const additions = buildShotListAdditions(mediaIndex.entries, gaps);

    if (additions.length > 0) {
      console.log(chalk.yellow(`\n  Shot list updated — ${additions.length} items added.`));
    }

    await appendShotList(mediaFolderId, additions);
    return {
      files_processed: 0,
      files_approved: 0,
      files_rejected: 0,
      files_skipped_empty: true,
      releases_required: [],
      shot_list_additions: additions,
      coverage_gaps: gaps,
      library_summary: buildLibrarySummary(mediaIndex.entries),
    };
  }

  console.log(chalk.white(`  Found ${newFiles.length} new file${newFiles.length !== 1 ? 's' : ''} in raw/`));

  // Load releases folder for release verification
  const releasesFolderId = await drive.getFolderIdByName(mediaFolderId, 'releases');
  const releaseFiles = releasesFolderId
    ? await drive.listFilesInFolder(releasesFolderId)
    : [];

  // Step 2-4 — Analyze each file
  const newEntries: MediaIndexEntry[] = [];
  let approved = 0;
  let rejected = 0;
  const releasesRequired: string[] = [];

  for (const file of newFiles) {
    console.log(chalk.gray(`\n  Analyzing: ${file.name}`));

    let imageBuffer: Buffer | null = null;
    let tags: VisionTags | null = null;

    try {
      const isVideo = file.mimeType.startsWith('video/');

      if (isVideo) {
        const videoBuffer = await drive.downloadForAnalysis(file.id);
        imageBuffer = await extractVideoFrame(videoBuffer);
        if (!imageBuffer) {
          console.log(chalk.yellow(`  Cannot extract frame from ${file.name} without ffmpeg — generating metadata-only analysis.`));
          tags = {
            moment_type: 'candid',
            emotional_tone: 'authentic',
            people_present: 'member_only',
            approximate_age_range: '30_to_45',
            setting: 'gym_floor',
            lighting_quality: 'acceptable',
            authenticity_score: 7,
            schwartz_level_fit: [2, 3],
            ad_audience_fit: ['warm', 'retargeting'],
            content_type_fit: ['social_proof'],
            faces_visible: false,
            gym_branding_visible: false,
            quality_pass: false,
            recommended_subfolder: 'moments',
            usage_notes: 'Video file — frame extraction requires ffmpeg. Manual review needed before use.',
            do_not_use_reason: 'Video frame extraction not available. Set up ffmpeg to enable full video analysis.',
            suggested_clip_length: '15-30 seconds',
          };
        } else {
          tags = await analyzeImageWithClaude(client, imageBuffer, 'image/jpeg');
          if (tags) tags.suggested_clip_length = '15-30 seconds';
        }
      } else {
        imageBuffer = await drive.downloadForAnalysis(file.id);
        tags = await analyzeImageWithClaude(client, imageBuffer, file.mimeType);
      }

      if (!tags) {
        console.log(chalk.red(`  Analysis failed for ${file.name} — skipping.`));
        continue;
      }

      // Step 3 — Release verification
      let releaseStatus: 'CLEARED' | 'REQUIRED' | 'NO_FACES' = 'NO_FACES';

      if (tags.faces_visible) {
        const hasRelease = releaseFiles.some(r =>
          r.name.toLowerCase().includes(file.name.toLowerCase().replace(/\.[^.]+$/, ''))
        );
        if (hasRelease) {
          releaseStatus = 'CLEARED';
        } else {
          releaseStatus = 'REQUIRED';
          tags.usage_notes = `[RELEASE REQUIRED — do not use publicly until release is uploaded to releases/] ${tags.usage_notes}`;
          releasesRequired.push(file.name);
        }
      }

      console.log(chalk.gray(`  → ${tags.moment_type} | ${tags.emotional_tone} | auth: ${tags.authenticity_score}/10 | pass: ${tags.quality_pass}`));
      console.log(chalk.gray(`  → subfolder: ${tags.recommended_subfolder} | release: ${releaseStatus}`));

      const entry: MediaIndexEntry = {
        file_id: file.id,
        file_name: file.name,
        drive_folder: rawFolderId,
        processed_date: new Date().toISOString(),
        release_status: releaseStatus,
        tags,
        used_in: [],
      };

      newEntries.push(entry);

      if (tags.quality_pass) {
        approved++;
      } else {
        rejected++;
        console.log(chalk.yellow(`  Rejected: ${tags.do_not_use_reason ?? 'quality below threshold'}`));
      }

    } catch (err) {
      console.log(chalk.red(`  Failed: ${file.name} — ${(err as Error).message}`));
      logError(`analyzeFile:${file.name}`, err as Error);
    }
  }

  // Step 5 — Update media index
  const allEntries = [...mediaIndex.entries, ...newEntries];
  await saveMediaIndex(mediaFolderId, allEntries, mediaIndex.index_file_id);

  // Step 6 — Move approved files
  for (const entry of newEntries) {
    if (entry.tags.quality_pass) {
      const subfolder = entry.tags.recommended_subfolder;
      let targetFolderId: string | null = null;

      const approvedFolderId = await drive.getFolderIdByName(mediaFolderId, 'approved');
      if (approvedFolderId) {
        targetFolderId = await drive.getFolderIdByName(approvedFolderId, subfolder);
      }

      if (targetFolderId) {
        try {
          await drive.moveToFolder(entry.file_id, targetFolderId);
          entry.drive_folder = targetFolderId;
        } catch {
          console.log(chalk.yellow(`  Could not move ${entry.file_name} — leaving in raw/`));
        }
      } else {
        console.log(chalk.gray(`  No approved/${subfolder}/ folder found — file stays in raw/`));
      }
    }
  }

  // Step 4b — Coverage gaps and shot list
  const gaps = checkCoverageGaps(allEntries);
  const shotListAdditions = buildShotListAdditions(allEntries, gaps);
  await appendShotList(mediaFolderId, shotListAdditions);

  // Step 7 — Return report
  const report: MediaReport = {
    files_processed: newFiles.length,
    files_approved: approved,
    files_rejected: rejected,
    files_skipped_empty: false,
    releases_required: releasesRequired,
    shot_list_additions: shotListAdditions,
    coverage_gaps: gaps,
    library_summary: buildLibrarySummary(allEntries),
  };

  printReport(report);
  return report;
}

// --- Helpers ---

async function loadMediaIndex(mediaFolderId: string): Promise<MediaIndex & { index_file_id: string }> {
  // Find existing media-index.json in the media folder
  try {
    const drive_ = await import('./drive.js');
    const files = await drive_.listFilesInFolder(mediaFolderId);
    const indexFile = files.find(f => f.name === 'media-index.json');

    if (indexFile) {
      const data = await drive.readJsonFile(indexFile.id) as { entries?: MediaIndexEntry[] };
      return {
        index_file_id: indexFile.id,
        entries: data.entries ?? [],
      };
    }
  } catch { /* first run */ }

  return { index_file_id: '', entries: [] };
}

async function saveMediaIndex(mediaFolderId: string, entries: MediaIndexEntry[], existingFileId: string): Promise<void> {
  try {
    const data = { last_updated: new Date().toISOString(), entries };
    await drive.writeJsonFile(existingFileId, data, mediaFolderId);
  } catch (err) {
    logError('saveMediaIndex', err as Error);
  }
}

async function appendShotList(mediaFolderId: string, items: ShotListItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const date = new Date().toLocaleDateString();
    const lines = [
      `\n## Shot List Update — ${date}`,
      '',
      ...items.map(item =>
        `**[P${item.priority}]** ${item.description}\n_Why: ${item.reason}_`
      ),
    ].join('\n');

    await drive.appendToDoc('', lines, mediaFolderId);
  } catch (err) {
    logError('appendShotList', err as Error);
  }
}

function printReport(report: MediaReport): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold.white('  MEDIA ANALYZER REPORT'));
  console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.gray('  Files processed:  ') + chalk.white(report.files_processed));
  console.log(chalk.gray('  Files approved:   ') + chalk.green(report.files_approved));
  console.log(chalk.gray('  Files rejected:   ') + chalk.red(report.files_rejected));
  console.log(chalk.gray('  Library total:    ') + chalk.white(report.library_summary.total_approved + ' approved'));
  console.log(chalk.gray('  Ad-ready:         ') + chalk.white(report.library_summary.ad_ready_count));

  if (Object.keys(report.library_summary.by_subfolder).length > 0) {
    console.log(chalk.gray('\n  By subfolder:'));
    Object.entries(report.library_summary.by_subfolder).forEach(([k, v]) => {
      console.log(chalk.gray(`    ${k}: `) + chalk.white(v));
    });
  }

  if (report.releases_required.length > 0) {
    console.log(chalk.red('\n  [RELEASES REQUIRED] — Do not use publicly:'));
    report.releases_required.forEach(f => console.log(chalk.red(`    · ${f}`)));
  }

  if (report.coverage_gaps.length > 0) {
    console.log(chalk.yellow('\n  Coverage gaps:'));
    report.coverage_gaps.forEach(g => console.log(chalk.yellow(`    · ${g}`)));
  }

  if (report.shot_list_additions.length > 0) {
    console.log(chalk.cyan('\n  Shot list additions:'));
    report.shot_list_additions.forEach(s =>
      console.log(chalk.cyan(`    [P${s.priority}] `) + chalk.white(s.description))
    );
    console.log(chalk.gray('  (Shot list updated in Drive)'));
  }

  console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

// --- Image-generator integration ---

const HOOK_TYPE_TO_MEDIA_TAGS: Record<string, Partial<VisionTags>> = {
  pain_point:        { emotional_tone: 'quiet', moment_type: 'member_solo' },
  curiosity_gap:     { moment_type: 'coaching' },
  bold_claim:        { moment_type: 'coaching', emotional_tone: 'warm' },
  relatability:      { emotional_tone: 'authentic', moment_type: 'member_solo' },
  pattern_interrupt: { moment_type: 'atmosphere', setting: 'gym_floor' },
  identity_shift:    { emotional_tone: 'proud', moment_type: 'member_solo' },
};

/**
 * Query the local media-index cache to find an approved real photo matching a hook type.
 * Returns null if no matching photo is available — image-generator falls back to synthetic generation.
 * This enables AHRI to prefer real gym photos over AI-generated images when the library has coverage.
 */
export async function getApprovedPhotoForHookType(
  mediaFolderId: string,
  hookType: string
): Promise<MediaIndexEntry | null> {
  try {
    const mediaIndex = await loadMediaIndex(mediaFolderId);
    const criteria = HOOK_TYPE_TO_MEDIA_TAGS[hookType] ?? {};

    const candidates = mediaIndex.entries.filter(entry => {
      if (!entry.tags.quality_pass) return false;
      if (entry.release_status === 'REQUIRED') return false;
      if (entry.tags.authenticity_score < 7) return false;

      for (const [key, value] of Object.entries(criteria)) {
        if (entry.tags[key as keyof VisionTags] !== value) return false;
      }
      return true;
    });

    if (candidates.length === 0) return null;

    // Prefer least-used photos to avoid repetition
    candidates.sort((a, b) => a.used_in.length - b.used_in.length);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

// --- CLI entry point ---

if (process.argv[1] && process.argv[1].endsWith('media-analyzer.ts') || process.argv[1]?.endsWith('media-analyzer.js')) {
  processNewMedia()
    .then(() => process.exit(0))
    .catch((err: Error) => {
      console.error(chalk.red('\n[FATAL]'), err.message);
      process.exit(1);
    });
}
