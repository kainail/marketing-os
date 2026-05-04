'use strict';

/**
 * Creative generator — fal.ai image generation + content shot list for onboarding sessions.
 *
 * generateOnboardingCreative: builds 5 images from session KB, runs a two-stage quality gate,
 * uploads passing images to the Generated folder.
 *
 * generateContentSchedule: builds an 8-shot shot list as a .txt file and uploads it to the
 * Content Schedule folder.
 */

const { fal } = require('@fal-ai/client');
const { r2GetShared } = require('../lib/r2');
const { uploadFileToDrive } = require('./googleDrive');

const FAL_MODEL = 'fal-ai/flux/dev';

// Categories mapped from hook types — determines image composition
const HOOK_IMAGE_CATEGORY = {
  'Curiosity Gap':    'interrupted_action',
  'Relatability':     'environment',
  'Pattern Interrupt': 'object',
  'Pain Point':       'environment',
  'Bold Claim':       'interrupted_action',
  'default':          'environment',
};

function getFalApiKey() {
  const key = process.env.FAL_KEY || process.env.FAL_AI_API_KEY;
  if (!key) throw new Error('[Creative] FAL_KEY not set');
  return key;
}

/**
 * Load the four KB files from R2 for a session. Returns an object with
 * { brainState, avatar, brainObj, researchData }.
 */
async function loadSessionContext(sessionId) {
  const [brainState, avatar, objections, research, confirmedHooks] = await Promise.all([
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/brain-state/current-state.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/lifestyle-avatar.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/objection-vault.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/prospect-research.json`),
    r2GetShared(`onboarding/sessions/${sessionId}/confirmed-hooks.json`),
  ]);
  return { brainState, avatar, objections, research, confirmedHooks };
}

/**
 * Extract the hook type from the confirmed hooks to select image category.
 */
function pickImageCategory(confirmedHooks) {
  const hooks = Array.isArray(confirmedHooks)
    ? confirmedHooks
    : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
    : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
    : [];
  const first = hooks[0];
  const framework = first?.framework || '';
  return HOOK_IMAGE_CATEGORY[framework] || HOOK_IMAGE_CATEGORY.default;
}

/**
 * Build a fal.ai image prompt from session context.
 * category: 'object' | 'environment' | 'interrupted_action'
 */
function buildImagePrompt(ctx, category, variant) {
  const { brainState, avatar, research } = ctx;

  // Extract key signals from KB text
  const brainLines = (typeof brainState === 'string' ? brainState : '').split('\n');
  const gymName = brainLines.find(l => l.startsWith('# Brain State'))?.replace('# Brain State —', '').trim() || 'the gym';
  const city = brainLines.find(l => l.toLowerCase().startsWith('city:'))?.replace(/city:\s*/i, '').trim() || '';
  const marketGap = brainLines.find(l => l.toLowerCase().startsWith('market gap:'))?.replace(/market gap:\s*/i, '').trim() || '';

  const avatarLines = (typeof avatar === 'string' ? avatar : '').split('\n');
  const triggerMoment = avatarLines
    .slice(avatarLines.findIndex(l => l.includes('## The Moment')) + 1)
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 2).join(' ').substring(0, 200);

  const competitors = (research?.competitors || []).map(c => c.name).join(', ') || 'competitors';

  // Variant tweaks so 5 generations differ meaningfully
  const variantNotes = [
    'morning light, golden hour',
    'candid mid-movement, slightly blurred',
    'wide shot showing the whole space',
    'close-up on one person in conversation',
    'overhead angle, group dynamic',
  ];

  const categoryDirections = {
    object: `A meaningful object that represents the avatar's life — not gym equipment. Think: a coffee mug, car keys, a work laptop, a kid's backpack. The object tells the story of the life the avatar is living.`,
    environment: `The gym environment as a supporting character — not the focus. Real, slightly imperfect, community feel. People in background. NOT polished like a stock photo. What ${competitors} are NOT showing.`,
    interrupted_action: `A real person caught mid-action — not posed. They look like a real member, not a fitness model. The moment captures the avatar's trigger: ${triggerMoment || 'deciding to make a change'}.`,
  };

  return `Photorealistic image for gym marketing in ${city || 'a midwestern city'}.

${categoryDirections[category] || categoryDirections.environment}

Avatar context: ${triggerMoment || 'busy adult who let fitness slip, now ready to change'}
Market gap positioning: ${marketGap || 'community over performance'}
Style: ${variantNotes[variant % variantNotes.length]}

CRITICAL: No before/after framing. No fitness models with six-packs. No gym equipment as primary subject. Looks like a real phone photo, not a stock image. Authentic, slightly raw, community-focused. Different from what ${competitors || 'typical gyms'} are running in ads right now.`.trim();
}

/**
 * Stage 1 compliance gate — rules that automatically disqualify an image prompt.
 * Returns true if the prompt passes (is compliant).
 */
function passesComplianceGate(prompt) {
  const lower = prompt.toLowerCase();
  const violations = [
    'before.*after', 'transformation', 'six.?pack', 'abs', 'weight loss',
    'shredded', 'ripped', 'toned body', 'body fat', 'physique',
    'before and after', 'results',
  ];
  return !violations.some(v => new RegExp(v).test(lower));
}

/**
 * Stage 2 authenticity gate — Claude Vision scores the generated image.
 * Returns { passes: boolean, score: number, reason: string }
 */
async function authenticityGate(imageUrl, client) {
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `Score this image 1-10 on authenticity for gym Facebook/Instagram ads.

8-10: Looks like a real phone photo — imperfect, candid, community feel. Completely different from typical gym stock photos.
5-7: Usable but has some stock-photo qualities.
1-4: Clearly AI-generated looking, over-produced, or could be any gym's stock image.

Also flag: any before/after framing, exposed physiques, or body shaming imagery (automatic disqualify).

Respond with JSON only: {"score": 7, "passes": true, "reason": "one sentence"}`,
          },
        ],
      }],
    });

    const raw = msg.content[0]?.text?.trim() || '{}';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return {
      passes: parsed.passes !== false && (parsed.score || 0) >= 6,
      score: parsed.score || 0,
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.error('[Creative] authenticityGate failed:', err.message);
    return { passes: false, score: 0, reason: 'Vision check failed' };
  }
}

/**
 * Generate 5 images, run both quality gates, upload passing images to the Generated folder.
 * Minimum 2 must pass — if fewer pass on first attempt, regenerates once with adjusted prompt.
 *
 * Returns array of { fileId, webViewLink, score, reason } for uploaded images.
 */
async function generateOnboardingCreative(sessionId, generatedFolderId) {
  try {
    const falKey = getFalApiKey();
    fal.config({ credentials: falKey });

    const ctx = await loadSessionContext(sessionId);
    const category = pickImageCategory(ctx.confirmedHooks);

    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_BLOOMINGTON;
    if (!apiKey) throw new Error('No Anthropic API key available');
    const client = new Anthropic({ apiKey });

    async function generateAndGate(attempt) {
      const results = [];

      // Generate 5 images concurrently
      const generations = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) => {
          const prompt = buildImagePrompt(ctx, category, i + (attempt * 5));
          if (!passesComplianceGate(prompt)) {
            return Promise.reject(new Error('Prompt failed compliance gate'));
          }
          return fal.subscribe(FAL_MODEL, {
            input: {
              prompt,
              image_size: 'landscape_4_3',
              num_inference_steps: 28,
              guidance_scale: 3.5,
              num_images: 1,
              enable_safety_checker: true,
            },
          });
        })
      );

      for (let i = 0; i < generations.length; i++) {
        if (generations[i].status === 'rejected') {
          console.warn(`[Creative] image ${i + 1} generation failed:`, generations[i].reason?.message);
          continue;
        }

        const imageUrl = generations[i].value?.images?.[0]?.url;
        if (!imageUrl) { console.warn(`[Creative] image ${i + 1}: no URL in response`); continue; }

        const gate = await authenticityGate(imageUrl, client);
        console.log(`[Creative] image ${i + 1}: score=${gate.score} passes=${gate.passes} — ${gate.reason}`);

        if (!gate.passes) continue;

        // Download and upload to Drive
        const fetchRes = await fetch(imageUrl);
        if (!fetchRes.ok) { console.warn(`[Creative] failed to download image ${i + 1}`); continue; }
        const buffer = Buffer.from(await fetchRes.arrayBuffer());

        const fileName = `creative-${attempt + 1}-${i + 1}-score${gate.score}.jpg`;
        const uploaded = await uploadFileToDrive(generatedFolderId, fileName, buffer, 'image/jpeg');
        if (uploaded) {
          results.push({ fileId: uploaded.id, webViewLink: uploaded.webViewLink, score: gate.score, reason: gate.reason });
        }
      }

      return results;
    }

    let passed = await generateAndGate(0);

    if (passed.length < 2) {
      console.log(`[Creative] only ${passed.length} passed on attempt 1 — regenerating`);
      const second = await generateAndGate(1);
      passed = [...passed, ...second];
    }

    console.log(`[Creative] session ${sessionId}: ${passed.length} images uploaded to Generated folder`);
    return passed;
  } catch (err) {
    console.error(`[Creative] generateOnboardingCreative failed (session ${sessionId}):`, err.message);
    return [];
  }
}

/**
 * Generate a shot list as a structured .txt file and upload to the Content Schedule folder.
 * Returns { fileId, webViewLink } or null on failure.
 */
async function generateContentSchedule(sessionId, contentScheduleFolderId) {
  try {
    const ctx = await loadSessionContext(sessionId);
    const { brainState, avatar, research, confirmedHooks } = ctx;

    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_BLOOMINGTON;
    if (!apiKey) throw new Error('No Anthropic API key available');
    const client = new Anthropic({ apiKey });

    // Extract hook angle and competitor context
    const hooks = Array.isArray(confirmedHooks)
      ? confirmedHooks
      : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
      : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
      : [];
    const hookSummary = hooks.slice(0, 2).map(h => h.hook || h).join('\n');

    const brainLines = (typeof brainState === 'string' ? brainState : '').split('\n');
    const marketGap = brainLines.find(l => l.toLowerCase().startsWith('market gap:'))?.replace(/market gap:\s*/i, '').trim() || '';
    const city = brainLines.find(l => l.toLowerCase().startsWith('city:'))?.replace(/city:\s*/i, '').trim() || 'your city';

    const competitors = (research?.competitors || []).slice(0, 3).map(c => `${c.name} (${(c.adThemes || []).join(', ')})`).join('\n');

    const prompt = `You are AHRI generating a shot list for a gym in ${city}.

CONFIRMED HOOKS:
${hookSummary || 'No hooks yet'}

MARKET GAP (what no competitor is saying):
${marketGap || 'Community over performance'}

AVATAR:
${typeof avatar === 'string' ? avatar.substring(0, 600) : ''}

COMPETITORS AND WHAT THEY SHOW:
${competitors || 'No competitor data'}

Generate exactly 8 specific shots the gym owner should capture with their phone.
Each shot must be tied to:
1. The confirmed hook angle
2. What the avatar cares about
3. What competitors are NOT showing

For each shot provide:
SHOT [number]: [title]
WHAT TO CAPTURE: [specific, concrete description — what's in frame, who, where]
WHY IT WORKS: [reference the actual market gap or a specific competitor by name]
BEST TIME: [time of day or gym schedule context]
CAPTION STARTER: [first 10 words of the post caption — use VoC language from avatar]

RULES:
- Never: before/after, body transformation, exposed physiques, gym equipment as hero shot
- Always: real people, candid moments, community feel, specific to THIS gym's story
- The shots should feel like a documentary of the gym, not a brochure`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const shotListText = msg.content[0]?.text?.trim() || '';
    if (!shotListText) throw new Error('Empty shot list response');

    const header = [
      `AHRI SHOT LIST — ${city}`,
      `Generated: ${new Date().toISOString()}`,
      `Session: ${sessionId}`,
      `Market Gap: ${marketGap}`,
      '',
      '='.repeat(60),
      '',
      shotListText,
    ].join('\n');

    const uploaded = await uploadFileToDrive(
      contentScheduleFolderId,
      `shot-list-${sessionId.slice(-8)}.txt`,
      header,
      'text/plain'
    );

    console.log(`[Creative] content schedule uploaded for session ${sessionId}: ${uploaded?.id}`);
    return uploaded;
  } catch (err) {
    console.error(`[Creative] generateContentSchedule failed (session ${sessionId}):`, err.message);
    return null;
  }
}

module.exports = { generateOnboardingCreative, generateContentSchedule };
