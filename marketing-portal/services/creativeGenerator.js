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

// Pain/emotion hooks → object or environment (context over action)
// Social proof hooks → interrupted action (real people in motion)
const HOOK_IMAGE_CATEGORY = {
  'Pain Point':        'environment',
  'Relatability':      'object',
  'Pattern Interrupt': 'object',
  'Curiosity Gap':     'environment',
  'Social Proof':      'interrupted_action',
  'Bold Claim':        'interrupted_action',
  'Testimonial':       'interrupted_action',
  'Community':         'interrupted_action',
  'default':           'environment',
};

function getKieApiKey(gymId) {
  const key = gymId
    ? process.env[`KIE_API_KEY_${gymId.toUpperCase()}`]
    : null;

  // fallback to global key if no gym-specific one set
  const fallback = process.env.KIE_API_KEY;

  if (!key && !fallback) throw new Error(`KIE_API_KEY not set for gym ${gymId}`);
  console.log(`[Creative] KIE key source: ${key ? `KIE_API_KEY_${(gymId || '').toUpperCase()}` : 'KIE_API_KEY (fallback)'}`);
  return key || fallback;
}

/**
 * Load KB files and session metadata from R2. Returns an object with
 * { brainState, avatar, objections, research, confirmedHooks, gymId }.
 * gymId is derived from session.gymName using the same formula as server.js.
 */
async function loadSessionContext(sessionId) {
  const [brainState, avatar, objections, research, confirmedHooks, sessionData] = await Promise.all([
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/brain-state/current-state.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/lifestyle-avatar.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/knowledge-base/fitness/objection-vault.md`),
    r2GetShared(`onboarding/sessions/${sessionId}/prospect-research.json`),
    r2GetShared(`onboarding/sessions/${sessionId}/confirmed-hooks.json`),
    r2GetShared(`onboarding/sessions/${sessionId}/session.json`),
  ]);
  const gymId = sessionData?.gymName
    ? sessionData.gymName.toLowerCase().replace(/[^a-z0-9]/g, '_')
    : null;
  return { brainState, avatar, objections, research, confirmedHooks, gymId };
}

/**
 * Extract the hook type from the confirmed hooks to select image category.
 * Falls back to keyword matching when framework name is not in the static map.
 */
function pickImageCategory(confirmedHooks) {
  const hooks = Array.isArray(confirmedHooks)
    ? confirmedHooks
    : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
    : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
    : [];
  const first = hooks[0];
  const framework = first?.framework || '';

  if (HOOK_IMAGE_CATEGORY[framework]) return HOOK_IMAGE_CATEGORY[framework];

  // Keyword fallback for AHRI-generated framework names not in the static map
  const fw = framework.toLowerCase();
  if (/social|proof|testimonial|community|real member/.test(fw)) return 'interrupted_action';
  if (/pain|emotion|struggle|problem|relat/.test(fw)) return 'environment';

  return HOOK_IMAGE_CATEGORY.default;
}

/**
 * Build a fal.ai image prompt from session context using AHRI's R2 knowledge base data.
 * Pulls confirmed hook text, full avatar description, market gap, and competitor ad styles
 * so every gym gets prompts specific to their onboarding data — not generic fitness imagery.
 *
 * category: 'object' | 'environment' | 'interrupted_action'
 */
function buildImagePrompt(ctx, category, variant) {
  const { brainState, avatar, research, confirmedHooks } = ctx;

  // ── brain-state/current-state.md → city, market gap, active offer
  const brainLines = (typeof brainState === 'string' ? brainState : '').split('\n');
  const city = brainLines.find(l => l.toLowerCase().startsWith('city:'))?.replace(/city:\s*/i, '').trim() || '';
  const brainMarketGap = brainLines.find(l => l.toLowerCase().startsWith('market gap:'))?.replace(/market gap:\s*/i, '').trim() || '';

  // ── knowledge-base/fitness/lifestyle-avatar.md → full avatar description
  const avatarLines = (typeof avatar === 'string' ? avatar : '').split('\n');
  const whoIdx = avatarLines.findIndex(l => /##\s*(who they are|the avatar)/i.test(l));
  const momentIdx = avatarLines.findIndex(l => /##\s*the moment/i.test(l));

  const avatarDescription = (whoIdx !== -1 ? avatarLines.slice(whoIdx + 1) : avatarLines)
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 3).join(' ').substring(0, 300)
    || 'busy adult who let fitness slip and is ready to make a change';

  const triggerMoment = momentIdx !== -1
    ? avatarLines.slice(momentIdx + 1).filter(l => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').substring(0, 200)
    : avatarDescription.substring(0, 200);

  // ── confirmed-hooks.json → active hook text
  const hooks = Array.isArray(confirmedHooks)
    ? confirmedHooks
    : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
    : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
    : [];
  const confirmedHook = hooks[0]?.hook || hooks[0]?.text || hooks[0]?.headline || triggerMoment;

  // ── prospect-research.json → competitors and their ad styles
  const competitorList = (research?.competitors || []).slice(0, 3);
  const competitorNames = competitorList.map(c => c.name).join(', ') || 'typical gyms';
  const competitorStyles = competitorList.length
    ? competitorList.map(c => `${c.name} (shows: ${(c.adThemes || c.themes || []).slice(0, 2).join(', ') || 'generic fitness imagery'})`).join('; ')
    : 'typical gym stock photography';

  // Market gap — prefer research.json if it has a richer value, fall back to brain-state
  const marketGap = research?.marketGap || research?.market_gap || brainMarketGap || 'community over performance';

  // Variant tweaks so 5 generations differ meaningfully
  const variantNotes = [
    'morning light, golden hour',
    'candid mid-movement, slightly blurred',
    'wide shot showing the whole space',
    'close-up on one person in conversation',
    'overhead angle, group dynamic',
  ];

  const categoryDirections = {
    object: `Object shot: A meaningful object from the avatar's daily life — coffee mug, car keys, work laptop, kid's backpack. Represents the life ${avatarDescription.substring(0, 80)} is living. NOT gym equipment.`,
    environment: `Environment shot: The gym space as a supporting character. Real, slightly imperfect, community feel. People visible in background. NOT the polished look of ${competitorNames}.`,
    interrupted_action: `Interrupted action shot: A real member caught mid-moment — not posed. They look like ${avatarDescription.substring(0, 80)}, not a fitness model. Authentic, unguarded.`,
  };

  return `Photorealistic ${category.replace('_', ' ')} shot for fitness ad in ${city || 'a midwestern city'}.

Avatar: ${avatarDescription}
Hook angle: ${confirmedHook}
Market gap: ${marketGap} — do NOT show: ${competitorStyles}
Style: ${variantNotes[variant % variantNotes.length]}, authentic, candid, real phone photo aesthetic, not stock photo

${categoryDirections[category] || categoryDirections.environment}

NO: before/after framing, fitness model physiques, gym equipment as hero, staged poses`.trim();
}

/**
 * Stage 1 compliance gate — rules that automatically disqualify an image prompt.
 * Returns true if the prompt passes (is compliant).
 *
 * Prohibited categories (strict):
 *   1. Before/after comparison framing
 *   2. Fitness model physiques or body transformation claims
 *   3. Body shaming language
 *   4. Weight loss percentage claims
 *
 * General gym language, location names, photorealistic descriptions, and
 * "gym marketing" phrasing are explicitly allowed.
 */
function passesComplianceGate(prompt) {
  const lower = prompt.toLowerCase();
  const violations = [
    // Category 1 — before/after comparison framing
    /\bbefore\s*(and\s*)?after\b/,
    /\bside[- ]by[- ]side\s*(comparison|result)/,

    // Category 2 — fitness model physiques / body transformation claims
    /\b(six|6)[- ]?pack\b/,
    /\bshredded\b/,
    /\bripped\b/,
    /\bbody\s*(transformation|fat\s*percentage|fat%)\b/,
    /\bfitness\s*model\s*physique\b/,
    /\bmuscle\s*definition\s*reveal\b/,

    // Category 3 — body shaming language
    /\b(fat|overweight|obese|flabby|ugly|embarrassed?\s*by\s*(your|my|their)\s*body)\b/,
    /\bhate\s*(your|my|their)\s*body\b/,
    /\blose\s+(the\s+)?(belly|gut|flab)\b/,

    // Category 4 — weight loss percentage / numeric claims
    /\blose\s+\d+\s*(lbs?|pounds?|kg|kilos?)\b/,
    /\b\d+\s*%\s*(body\s*fat|weight\s*loss)\b/,
    /\bdrop\s+\d+\s*(lbs?|pounds?|kg)\b/,
  ];
  return !violations.some(v => v.test(lower));
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
  console.log(`[Creative] ── generateOnboardingCreative START session=${sessionId} generatedFolderId=${generatedFolderId}`);
  try {
    // ── Step 1: Load session KB from R2 (gymId needed before key lookup)
    console.log('[Creative] loading session context from R2...');
    const ctx = await loadSessionContext(sessionId);
    console.log('[Creative] R2 context loaded:', {
      hasBrainState: !!ctx.brainState,
      hasAvatar: !!ctx.avatar,
      hasObjVault: !!ctx.objections,
      hasResearch: !!ctx.research,
      hasConfirmedHooks: !!ctx.confirmedHooks,
      confirmedHooksType: Array.isArray(ctx.confirmedHooks) ? 'array' : typeof ctx.confirmedHooks,
      gymId: ctx.gymId || '(null — will use fallback key)',
    });

    // ── Step 2: Configure fal with gym-specific KIE key
    const falKey = getKieApiKey(ctx.gymId);
    fal.config({ credentials: falKey });
    console.log('[Creative] fal.config() called with KIE key');

    // ── Step 3: Pick image category
    const category = pickImageCategory(ctx.confirmedHooks);
    console.log(`[Creative] image category selected: ${category}`);

    // ── Step 4: Anthropic client
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_BLOOMINGTON;
    if (!anthropicKey) throw new Error('No Anthropic API key available (checked ANTHROPIC_API_KEY, ANTHROPIC_API_KEY_BLOOMINGTON)');
    console.log('[Creative] Anthropic key source:', process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_API_KEY_BLOOMINGTON');
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicKey });

    async function generateAndGate(attempt) {
      console.log(`[Creative] generateAndGate attempt=${attempt + 1}`);
      const results = [];

      // Build and validate prompts first
      const prompts = Array.from({ length: 5 }, (_, i) => {
        const prompt = buildImagePrompt(ctx, category, i + (attempt * 5));
        const passes = passesComplianceGate(prompt);
        console.log(`[Creative] prompt ${i + 1} compliance: ${passes ? 'PASS' : 'FAIL'} (${prompt.substring(0, 80)}...)`);
        return { prompt, passes, idx: i };
      });

      // Generate images via fal.ai
      console.log(`[Creative] calling fal.subscribe on model ${FAL_MODEL} for ${prompts.length} images...`);
      const generations = await Promise.allSettled(
        prompts.map(({ prompt, passes }) => {
          if (!passes) return Promise.reject(new Error('Prompt failed compliance gate'));
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
        const gen = generations[i];
        if (gen.status === 'rejected') {
          console.warn(`[Creative] image ${i + 1} REJECTED by fal.ai:`, gen.reason?.message, gen.reason?.stack?.split('\n')[1] || '');
          continue;
        }

        console.log(`[Creative] image ${i + 1} fal.ai response keys:`, Object.keys(gen.value || {}));
        const imageUrl = gen.value?.images?.[0]?.url;
        if (!imageUrl) {
          console.warn(`[Creative] image ${i + 1}: no URL in fal.ai response. Full value:`, JSON.stringify(gen.value)?.substring(0, 300));
          continue;
        }
        console.log(`[Creative] image ${i + 1} URL received: ${imageUrl.substring(0, 80)}...`);

        // Authenticity gate
        console.log(`[Creative] image ${i + 1}: running authenticityGate...`);
        const gate = await authenticityGate(imageUrl, client);
        console.log(`[Creative] image ${i + 1}: score=${gate.score} passes=${gate.passes} reason="${gate.reason}"`);
        if (!gate.passes) continue;

        // Download
        console.log(`[Creative] image ${i + 1}: downloading from fal.ai URL...`);
        const fetchRes = await fetch(imageUrl);
        if (!fetchRes.ok) {
          console.warn(`[Creative] image ${i + 1}: download failed — HTTP ${fetchRes.status}`);
          continue;
        }
        const buffer = Buffer.from(await fetchRes.arrayBuffer());
        console.log(`[Creative] image ${i + 1}: downloaded ${buffer.length} bytes`);

        // Upload to Drive
        const fileName = `creative-${attempt + 1}-${i + 1}-score${gate.score}.jpg`;
        console.log(`[Creative] image ${i + 1}: uploading to Drive folder ${generatedFolderId} as ${fileName}...`);
        const uploaded = await uploadFileToDrive(generatedFolderId, fileName, buffer, 'image/jpeg');
        if (uploaded) {
          console.log(`[Creative] image ${i + 1}: Drive upload OK — fileId=${uploaded.id}`);
          results.push({ fileId: uploaded.id, webViewLink: uploaded.webViewLink, score: gate.score, reason: gate.reason });
        } else {
          console.warn(`[Creative] image ${i + 1}: Drive upload returned null — see Drive logs above`);
        }
      }

      console.log(`[Creative] attempt ${attempt + 1} complete: ${results.length}/${generations.length} uploaded`);
      return results;
    }

    let passed = await generateAndGate(0);

    if (passed.length < 2) {
      console.log(`[Creative] only ${passed.length} passed on attempt 1 — running attempt 2`);
      const second = await generateAndGate(1);
      passed = [...passed, ...second];
    }

    console.log(`[Creative] ── generateOnboardingCreative DONE session=${sessionId}: ${passed.length} images uploaded`);
    return passed;
  } catch (err) {
    console.error(`[Creative] generateOnboardingCreative FATAL (session ${sessionId}): ${err.message}`);
    console.error('[Creative] stack:', err.stack);
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
