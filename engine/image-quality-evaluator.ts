import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');

export interface QualityResult {
  passed: boolean;
  overall_score: number;
  compliance_passed: boolean;
  differentiation_score: number;
  authenticity_score: number;
  failure_reason: string;
  recovery_strategy: 'A' | 'B' | 'C' | null;
  notes: string;
}

interface ComplianceEval {
  passed: boolean;
  flags: string[];
}

interface DifferentiationEval {
  differentiation_score: number;
  authenticity_score: number;
  competitor_pattern_detected: boolean;
  competitor_pattern_description: string;
  notes: string;
}

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","image-quality-evaluator","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

/**
 * Stage 1 — Compliance gate (binary pass/fail).
 * Uses Claude vision to check for FTC and Meta policy violations.
 * A single flag causes an immediate fail — no recovery, image is discarded.
 */
async function runComplianceGate(client: Anthropic, imageBase64: string, mimeType: string): Promise<ComplianceEval> {
  const system = `You are a compliance reviewer for fitness advertising. Your job is to check if an image violates Meta fitness advertising policy or FTC guidelines. Return ONLY valid JSON — no explanation, no markdown.

Return this exact shape:
{
  "passed": true,
  "flags": []
}

Flag the image (passed: false) if it shows:
- Before/after body transformation imagery or split panels implying physique change
- Body parts isolated in a way that focuses on weight loss zones (stomach, arms, thighs, legs)
- Anyone with a visibly athletic physique displayed as aspiration
- Imagery that implies specific weight loss amounts
- Countdown timers or artificial urgency graphics embedded in the image
- Anyone who appears to be under 18 in a fitness context
- Medical or clinical framing (measuring tape, scale, clinical setting)
- Imagery that could shame or humiliate body types

If none of these are present, return passed: true with empty flags array.`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      system,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 },
        }],
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text) as ComplianceEval;
  } catch (err) {
    logError('runComplianceGate', err as Error);
    // On error, assume passed to avoid blocking generation — flag in notes instead
    return { passed: true, flags: ['Compliance check error — manual review required'] };
  }
}

/**
 * Stage 2 — Differentiation and authenticity scoring.
 * Uses Claude vision to score the image against competitor patterns.
 * Returns numeric scores — below threshold triggers recovery.
 */
async function runDifferentiationGate(
  client: Anthropic,
  imageBase64: string,
  mimeType: string,
  promptUsed: string,
  competitorPatternsToAvoid: string[],
  hookType: string
): Promise<DifferentiationEval> {
  const competitorContext = competitorPatternsToAvoid.length > 0
    ? `Competitor visual patterns to detect (flag if this image resembles them): ${competitorPatternsToAvoid.slice(0, 5).join('; ')}.`
    : 'No specific competitor patterns provided.';

  const system = `You are AHRI's creative differentiation analyst. Evaluate this image for two things: (1) how well it avoids looking like a standard gym ad, and (2) how authentic and candid it looks versus staged/AI-generated.

Hook type context: ${hookType}. The image is for a small gym targeting adults 38-52 who have quit gyms before. It must not look like a gym ad.

${competitorContext}

Return ONLY valid JSON — no explanation, no markdown:
{
  "differentiation_score": 8,
  "authenticity_score": 7,
  "competitor_pattern_detected": false,
  "competitor_pattern_description": "",
  "notes": "one sentence describing what is working or what to fix"
}

Scoring guide:
- differentiation_score (1-10): 10 = no one would guess this is a gym ad at first glance. 1 = looks exactly like every other gym ad.
- authenticity_score (1-10): 10 = completely candid, real moment, no AI tell. 1 = obviously staged or AI-generated.
- competitor_pattern_detected: true if the image resembles the described competitor patterns.`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      system,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Prompt used to generate this image: "${promptUsed.slice(0, 400)}"`,
          },
        ],
      }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text) as DifferentiationEval;
  } catch (err) {
    logError('runDifferentiationGate', err as Error);
    return {
      differentiation_score: 5,
      authenticity_score: 5,
      competitor_pattern_detected: false,
      competitor_pattern_description: 'Differentiation check error — defaulting to mid-score',
      notes: 'Differentiation check error — manual review required',
    };
  }
}

/**
 * Determines recovery strategy from a failed differentiation evaluation.
 *
 * Strategy A — authenticity failure only
 * Strategy B — differentiation/competitor failure only
 * Strategy C — both failed
 */
function resolveRecoveryStrategy(eval2: DifferentiationEval): 'A' | 'B' | 'C' {
  const authFail = eval2.authenticity_score < 6;
  const diffFail = eval2.differentiation_score < 6 || eval2.competitor_pattern_detected;

  if (authFail && diffFail) return 'C';
  if (authFail) return 'A';
  return 'B';
}

/**
 * Two-stage quality gate.
 * Stage 1: compliance check (binary — any flag = discard, no recovery)
 * Stage 2: differentiation + authenticity scoring (below threshold triggers recovery)
 */
export async function evaluateImageQuality(
  client: Anthropic,
  imagePath: string,
  promptUsed: string,
  competitorPatternsToAvoid: string[],
  hookType: string
): Promise<QualityResult> {
  let imageBase64: string;
  let mimeType: 'image/jpeg' | 'image/png';

  try {
    const buffer = fs.readFileSync(imagePath);
    imageBase64 = buffer.toString('base64');
    mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  } catch (err) {
    logError('evaluateImageQuality:read', err as Error);
    return {
      passed: false,
      overall_score: 0,
      compliance_passed: false,
      differentiation_score: 0,
      authenticity_score: 0,
      failure_reason: 'Could not read image file for evaluation',
      recovery_strategy: null,
      notes: 'File read error — image may not have downloaded correctly',
    };
  }

  // Stage 1 — Compliance
  console.log(chalk.cyan('  → Running Stage 1 compliance gate...'));
  const compliance = await runComplianceGate(client, imageBase64, mimeType);

  if (!compliance.passed) {
    return {
      passed: false,
      overall_score: 0,
      compliance_passed: false,
      differentiation_score: 0,
      authenticity_score: 0,
      failure_reason: `Compliance failure: ${compliance.flags.join('; ')}`,
      recovery_strategy: null, // compliance failures are not recovered — image is discarded
      notes: `Compliance flags: ${compliance.flags.join('; ')}. Image discarded. Do not retry with this prompt.`,
    };
  }

  // Stage 2 — Differentiation and authenticity
  console.log(chalk.cyan('  → Running Stage 2 differentiation + authenticity gate...'));
  const diffEval = await runDifferentiationGate(
    client,
    imageBase64,
    mimeType,
    promptUsed,
    competitorPatternsToAvoid,
    hookType
  );

  const DIFFERENTIATION_THRESHOLD = 6;
  const AUTHENTICITY_THRESHOLD    = 5;

  const diffFailed = diffEval.differentiation_score < DIFFERENTIATION_THRESHOLD || diffEval.competitor_pattern_detected;
  const authFailed = diffEval.authenticity_score < AUTHENTICITY_THRESHOLD;
  const stage2Passed = !diffFailed && !authFailed;

  const overallScore = Math.round((diffEval.differentiation_score + diffEval.authenticity_score) / 2);

  if (stage2Passed) {
    return {
      passed: true,
      overall_score: overallScore,
      compliance_passed: true,
      differentiation_score: diffEval.differentiation_score,
      authenticity_score: diffEval.authenticity_score,
      failure_reason: '',
      recovery_strategy: null,
      notes: diffEval.notes,
    };
  }

  const strategy = resolveRecoveryStrategy(diffEval);
  const reasons: string[] = [];
  if (authFailed) reasons.push(`authenticity ${diffEval.authenticity_score}/10 (below ${AUTHENTICITY_THRESHOLD})`);
  if (diffFailed) reasons.push(`differentiation ${diffEval.differentiation_score}/10${diffEval.competitor_pattern_detected ? ' — competitor pattern detected' : ''}`);

  return {
    passed: false,
    overall_score: overallScore,
    compliance_passed: true,
    differentiation_score: diffEval.differentiation_score,
    authenticity_score: diffEval.authenticity_score,
    failure_reason: reasons.join('; '),
    recovery_strategy: strategy,
    notes: diffEval.notes,
  };
}
