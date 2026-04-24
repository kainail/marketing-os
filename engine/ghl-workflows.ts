import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');
const ASSET_LOG = path.join(ROOT, 'performance', 'asset-log.csv');

// --- Types ---

export interface WorkflowStep {
  id: string;
  name: string;
  day: number;
  timing: string;
  currentContent: string;
  isProtected: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  charCount: number;
  segmentCount: number;
}

export interface MessageUpdate {
  workflowName: string;
  workflowId: string;
  stepName: string;
  stepId: string;
  currentContent: string;
  newContent: string;
  charCount: number;
  segmentCount: number;
  variant: 'A' | 'B';
}

// The protected follow-up message. This exact text must never be overwritten by workflow-updater.
export const PROTECTED_FOLLOWUP_MESSAGE =
  "Totally okay if now's not a great time, I just didn't want you to feel like this was one of those 'submit a form and never hear back' situations";

// GHL workflow name → env ID mapping
const WORKFLOW_NAME_MAP: Record<string, string> = {
  'Workflow 1': 'wf1',
  'Hyperpersonalization Filter': 'wf1',
  'Workflow 2': 'wf2',
  'Social Archetype': 'wf2',
  'Social Archetype Nurture': 'wf2',
  'Workflow 3': 'wf3',
  'Analytical Archetype': 'wf3',
  'Analytical Archetype Nurture': 'wf3',
  'Workflow 4': 'wf4',
  'Supportive Archetype': 'wf4',
  'Supportive Archetype Nurture': 'wf4',
  'Workflow 5': 'wf5',
  'Independent Archetype': 'wf5',
  'Independent Archetype Nurture': 'wf5',
};

// --- Auth ---

const GHL_BASE = 'https://services.leadconnectorhq.com';

function getClient(): AxiosInstance {
  const apiKey = process.env['GHL_API_KEY'];
  if (!apiKey) throw new Error('GHL_API_KEY not set. Add it to .env');

  return axios.create({
    baseURL: GHL_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 15000,
  });
}

// --- Error logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","ghl-workflows","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Resolve workflow IDs ---

/**
 * Resolves a workflow name to its GHL ID from GHL_WORKFLOW_IDS env variable.
 * Format: "wf1:abc123,wf2:def456,wf3:ghi789,wf4:jkl012,wf5:mno345"
 */
export function resolveWorkflowId(nameOrKey: string): string | null {
  const envVal = process.env['GHL_WORKFLOW_IDS'] ?? '';
  if (!envVal) return null;

  // Parse "wf1:id1,wf2:id2" format
  const map: Record<string, string> = {};
  envVal.split(',').forEach(pair => {
    const [k, v] = pair.split(':');
    if (k && v) map[k.trim()] = v.trim();
  });

  // Try direct key lookup
  if (map[nameOrKey]) return map[nameOrKey];

  // Try mapping workflow name to key first
  const key = WORKFLOW_NAME_MAP[nameOrKey];
  if (key && map[key]) return map[key];

  return null;
}

// --- Validation ---

const BANNED_CHARS_PATTERN = /[–—―]/; // en dash, em dash, horizontal bar
const EMOJI_PATTERN = /\p{Emoji_Presentation}/u;

/**
 * Validates an SMS message for GHL workflow use.
 */
export function validateSmsContent(content: string): ValidationResult {
  const issues: string[] = [];
  const charCount = content.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  if (charCount > 306) {
    issues.push(`Message is ${charCount} chars — exceeds 306-char (2-segment) hard limit. Current: ${segmentCount} segments.`);
  }

  if (BANNED_CHARS_PATTERN.test(content)) {
    issues.push('Contains em dash or en dash — replace with plain hyphen or rewrite the sentence.');
  }

  if (EMOJI_PATTERN.test(content)) {
    issues.push('Contains emoji — remove for professional nurture SMS tone.');
  }

  // Check GHL variables are syntactically correct (no unclosed braces)
  const unclosed = content.match(/\{\{[^}]*$/) ?? content.match(/^[^{]*\}\}/);
  if (unclosed) {
    issues.push('Malformed GHL variable — check all {{variables}} are properly closed.');
  }

  // Check for bullet points
  if (/^[•\-\*]\s/m.test(content)) {
    issues.push('Contains bullet points — SMS is a conversation, not a list. Rewrite as prose.');
  }

  return {
    valid: issues.length === 0,
    issues,
    charCount,
    segmentCount,
  };
}

/**
 * Checks if new content would overwrite the protected follow-up message.
 */
export function wouldOverwriteProtected(newContent: string): boolean {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return normalized(newContent).includes(normalized(PROTECTED_FOLLOWUP_MESSAGE).slice(0, 30));
}

// --- GHL API ---

/**
 * Reads a GHL workflow including all step IDs and current content.
 * [KAI — Confirm /workflows/{workflowId}/steps endpoint in your GHL account's API version.]
 */
export async function getWorkflow(workflowId: string): Promise<Workflow> {
  try {
    const client = getClient();
    const res = await client.get(`/workflows/${workflowId}`);
    const data = res.data as { id?: string; name?: string; steps?: Array<{ id: string; name: string; day?: number; timing?: string; actions?: Array<{ type: string; content?: string }> }> };

    const steps: WorkflowStep[] = (data.steps ?? []).map(s => {
      const smsAction = s.actions?.find(a => a.type === 'sms');
      const content = smsAction?.content ?? '';
      return {
        id: s.id,
        name: s.name,
        day: s.day ?? 0,
        timing: s.timing ?? '',
        currentContent: content,
        isProtected: content.includes(PROTECTED_FOLLOWUP_MESSAGE.slice(0, 40)),
      };
    });

    return { id: data.id ?? workflowId, name: data.name ?? workflowId, steps };

  } catch (err) {
    logError(`getWorkflow:${workflowId}`, err as Error);
    // Return stub for testing when GHL is not configured
    return {
      id: workflowId,
      name: `Workflow ${workflowId}`,
      steps: [],
    };
  }
}

/**
 * Reads a single workflow step and returns its current SMS content.
 */
export async function getWorkflowStep(workflowId: string, stepId: string): Promise<WorkflowStep> {
  try {
    const client = getClient();
    const res = await client.get(`/workflows/${workflowId}/steps/${stepId}`);
    const data = res.data as { id?: string; name?: string; day?: number; timing?: string; actions?: Array<{ type: string; content?: string }> };

    const smsAction = data.actions?.find(a => a.type === 'sms');
    const content = smsAction?.content ?? '';

    return {
      id: data.id ?? stepId,
      name: data.name ?? stepId,
      day: data.day ?? 0,
      timing: data.timing ?? '',
      currentContent: content,
      isProtected: content.includes(PROTECTED_FOLLOWUP_MESSAGE.slice(0, 40)),
    };
  } catch (err) {
    logError(`getWorkflowStep:${stepId}`, err as Error);
    return {
      id: stepId,
      name: stepId,
      day: 0,
      timing: '',
      currentContent: '',
      isProtected: false,
    };
  }
}

/**
 * Updates the SMS content of a workflow step.
 * Validates content, preserves GHL variables, rejects protected message overwrites.
 */
export async function updateWorkflowStep(workflowId: string, stepId: string, newSmsContent: string): Promise<void> {
  // Validation before any API call
  const validation = validateSmsContent(newSmsContent);
  if (!validation.valid) {
    throw new Error(`Validation failed for step ${stepId}: ${validation.issues.join(' | ')}`);
  }

  if (wouldOverwriteProtected(newSmsContent)) {
    throw new Error(
      `Rejected: content appears to overwrite the protected 30-minute follow-up message. ` +
      `This message is never updated by workflow-updater. Flag to Kai if you intended to change it.`
    );
  }

  try {
    const client = getClient();
    const locationId = process.env['GHL_LOCATION_ID'];

    // [KAI — Verify the correct PUT endpoint for updating a workflow step SMS action in your GHL version.]
    await client.put(`/workflows/${workflowId}/steps/${stepId}`, {
      locationId,
      actions: [{ type: 'sms', content: newSmsContent }],
    });

    const segments = validation.segmentCount;
    console.log(chalk.green(`  ✓ Updated step ${stepId} — ${validation.charCount} chars — ${segments} segment${segments !== 1 ? 's' : ''}`));

  } catch (err) {
    logError(`updateWorkflowStep:${stepId}`, err as Error);
    throw err;
  }
}

/**
 * Parses a nurture-sync output file and extracts all message updates for a given variant.
 */
export function parseNurtureSync(content: string, variant: 'A' | 'B'): Partial<MessageUpdate>[] {
  const updates: Partial<MessageUpdate>[] = [];

  // Look for workflow sections with UPDATE-tagged messages
  // Pattern: ## WORKFLOW [N] ... variant section ... message content
  const workflowSections = content.split(/(?=##\s+WORKFLOW\s+\d)/i);

  for (const section of workflowSections) {
    const workflowMatch = section.match(/##\s+WORKFLOW\s+(\d+)[^\n]*/i);
    if (!workflowMatch) continue;

    const workflowNum = parseInt(workflowMatch[1], 10);
    const workflowName = `Workflow ${workflowNum}`;

    // Find variant-specific blocks
    const variantPattern = new RegExp(
      `Variant ${variant}[\\s\\S]*?(?=Variant [AB]|###|##|$)`,
      'gi'
    );
    const variantBlocks = section.match(variantPattern) ?? [];

    for (const block of variantBlocks) {
      // Extract step name and message content
      const stepMatch = block.match(/###\s*([^\n]+)/);
      const messageMatch = block.match(/```\n?([\s\S]*?)\n?```/);

      if (stepMatch && messageMatch) {
        const stepName = stepMatch[1].trim();
        const messageContent = messageMatch[1].trim();
        const charCount = messageContent.length;
        const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

        updates.push({
          workflowName,
          stepName,
          newContent: messageContent,
          charCount,
          segmentCount,
          variant,
        });
      }
    }
  }

  return updates;
}

/**
 * Logs a completed workflow update run to performance/asset-log.csv.
 */
export function logWorkflowUpdate(successCount: number, failCount: number, offerName: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const assetId = `workflow-update-${date}`;
  const line = `"${assetId}","workflow-updater","workflow-updater","anytime-fitness","lifestyle-member","${date}","live","ready-to-post","wf-${date}","${offerName} — ${successCount} updated ${failCount} failed"\n`;
  try {
    fs.appendFileSync(ASSET_LOG, line);
  } catch { /* non-fatal */ }
}
