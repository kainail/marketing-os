import fs from 'fs-extra';
import path from 'path';

const ROOT = process.cwd();

interface CompetitorAd {
  visual_style?: string;
  hook_type?: string;
  hook_text?: string;
  cta?: string;
  saturated_hooks?: string[];
  visual_patterns?: string[];
}

interface CompetitorData {
  competitors?: Record<string, { ads?: CompetitorAd[] }>;
  saturated_hooks?: string[];
}

export interface VisualFingerprint {
  competitor_patterns_to_avoid: string[];
  saturated_hooks: string[];
  differentiation_instructions: string;
}

/**
 * Reads competitor-ads.json and returns a fingerprint of visual patterns to avoid.
 * Called by image-generator.ts before building every prompt.
 */
export function buildCompetitorFingerprint(): VisualFingerprint {
  const competitorPath = path.join(ROOT, 'intelligence-db', 'market', 'competitor-ads.json');

  let data: CompetitorData = {};
  try {
    const raw = fs.readFileSync(competitorPath, 'utf-8');
    data = JSON.parse(raw) as CompetitorData;
  } catch {
    return {
      competitor_patterns_to_avoid: [],
      saturated_hooks: [],
      differentiation_instructions: 'No competitor data available — apply default differentiation rules.',
    };
  }

  const patterns = new Set<string>();
  const saturatedHooks: string[] = [];

  // Collect top-level saturated hooks
  if (Array.isArray(data.saturated_hooks)) {
    saturatedHooks.push(...data.saturated_hooks);
  }

  // Extract visual patterns from each competitor's ads
  if (data.competitors && typeof data.competitors === 'object') {
    for (const [, competitor] of Object.entries(data.competitors)) {
      if (!competitor.ads || !Array.isArray(competitor.ads)) continue;

      for (const ad of competitor.ads) {
        if (ad.visual_style) patterns.add(ad.visual_style);
        if (ad.visual_patterns && Array.isArray(ad.visual_patterns)) {
          ad.visual_patterns.forEach(p => patterns.add(p));
        }
        if (ad.saturated_hooks && Array.isArray(ad.saturated_hooks)) {
          saturatedHooks.push(...ad.saturated_hooks);
        }
      }
    }
  }

  const patternList = Array.from(patterns);

  const differentiation = buildDifferentiationInstructions(patternList, saturatedHooks);

  return {
    competitor_patterns_to_avoid: patternList,
    saturated_hooks: [...new Set(saturatedHooks)],
    differentiation_instructions: differentiation,
  };
}

function buildDifferentiationInstructions(patterns: string[], saturatedHooks: string[]): string {
  const lines: string[] = [
    'DIFFERENTIATION MANDATE — your image must look nothing like these competitor patterns:',
  ];

  if (patterns.length > 0) {
    lines.push(`Visual patterns to avoid: ${patterns.slice(0, 6).join('; ')}.`);
  }

  if (saturatedHooks.length > 0) {
    lines.push(`Saturated hooks to avoid (do not illustrate these themes): ${saturatedHooks.slice(0, 4).join('; ')}.`);
  }

  lines.push(
    'Instead: documentary style, real people, no gym equipment as focal point, no athletic bodies, no transformation imagery, no motivational poster aesthetic.',
    'The image must not look like a gym ad at first glance — it must look like a moment from real life.'
  );

  return lines.join(' ');
}
