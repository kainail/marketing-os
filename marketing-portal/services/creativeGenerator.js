'use strict';

/**
 * Creative generator — kie.ai image generation + content shot list for onboarding sessions.
 *
 * generateOnboardingCreative: builds 5 images from session KB, runs a two-stage quality gate,
 * uploads passing images to the Generated folder.
 *
 * generateContentSchedule: builds an 8-shot shot list as a .txt file and uploads it to the
 * Content Schedule folder.
 */

const crypto = require('crypto');
const sharp = require('sharp');
const { r2GetShared, r2PutSharedBinary } = require('../lib/r2');
const { uploadFileToDrive } = require('./googleDrive');

const KIE_MODEL = 'nano-banana-pro';
const KIE_CREATE_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const KIE_QUERY_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

/**
 * Compress a raw image buffer and store the bytes permanently in R2. Returns
 * the permanent public-proxy URL on success, null on failure.
 *
 * Shared tail of all rehost paths — kie URL fetch, Drive SDK download, future
 * sources all pipe through here so the on-disk shape stays uniform.
 *
 * Path:  shared/gyms/<scopeId>/creatives/<slotPrefix>-<uuid>.jpg
 * URL:   /api/public/creative/<scopeId>/<slotPrefix>-<uuid>.jpg
 *   (the public route validates scopeId is UUID-shaped, the filename is
 *   plain, and the resolved key stays inside the creatives prefix.)
 *
 * slotPrefix is purely a filename-readability hint — anything safe is fine.
 * Conventions in use: 'cold' / 'warm' / 'offer' for pipeline-tier images,
 * 'library' for confirm-time rehosts of owner-picked Drive images.
 */
async function rehostBufferToR2(rawBuffer, scopeId, slotPrefix) {
  if (!Buffer.isBuffer(rawBuffer) || !rawBuffer.length || !scopeId) return null;
  try {
    const buffer = await sharp(rawBuffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const filename = `${slotPrefix}-${crypto.randomUUID()}.jpg`;
    const r2Path = `gyms/${scopeId}/creatives/${filename}`;
    await r2PutSharedBinary(r2Path, buffer, 'image/jpeg');

    const permanentUrl = `/api/public/creative/${scopeId}/${filename}`;
    console.log(`[Creative] rehost: ${slotPrefix} → R2 ${rawBuffer.length}→${buffer.length} bytes, url=${permanentUrl}`);
    return permanentUrl;
  } catch (err) {
    console.warn(`[Creative] rehost FAILED for ${slotPrefix}: ${err.message}`);
    return null;
  }
}

/**
 * Download a freshly-generated kie.ai image while the URL is still alive and
 * rehost it via rehostBufferToR2. Returns the permanent URL on success, null
 * on failure (caller falls back to the kie URL so a broken reference is never
 * persisted).
 */
async function rehostKieImageToR2(kieUrl, scopeId, tier) {
  if (!kieUrl || !scopeId) return null;
  try {
    const fetchRes = await fetch(kieUrl);
    if (!fetchRes.ok) {
      console.warn(`[Creative] rehost: kie download HTTP ${fetchRes.status} for tier=${tier}`);
      return null;
    }
    const rawBuffer = Buffer.from(await fetchRes.arrayBuffer());
    return await rehostBufferToR2(rawBuffer, scopeId, tier);
  } catch (err) {
    console.warn(`[Creative] rehost (kie) FAILED for tier=${tier}: ${err.message}`);
    return null;
  }
}

// Maps a 0-indexed image position within the 5-image set (or any multiple) to its
// awareness tier. Kept in sync with buildImagePrompt's internal tier assignment so
// callers can map returned URLs back to ad slots without re-parsing prompts.
function tierFromPosition(pos) {
  const p = pos % 5;
  return p <= 1 ? 'cold' : p <= 3 ? 'warm' : 'offer';
}

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
  // gymId = 'anytime_fitness_avon' → city = 'AVON'
  const city = gymId ? gymId.split('_').pop().toUpperCase() : null;
  const cityKey = city ? process.env[`KIE_API_KEY_${city}`] : null;
  const fallback = process.env.KIE_API_KEY;
  if (!cityKey && !fallback) throw new Error(`KIE_API_KEY not set for gym ${gymId}`);
  console.log(`[Creative] KIE key source: ${cityKey ? `KIE_API_KEY_${city}` : 'KIE_API_KEY (fallback)'}`);
  return cityKey || fallback;
}

/**
 * Submit a generation task to kie.ai and poll until the image is ready.
 * Returns the image URL string, or throws on failure / 2-minute timeout.
 */
async function kieGenerateImage(prompt, kieApiKey) {
  // Step 1 — create task
  const createRes = await fetch(KIE_CREATE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kieApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KIE_MODEL,
      input: {
        prompt,
        image_input: [],
        aspect_ratio: '4:5',
        resolution: '2K',
        output_format: 'png',
      },
    }),
  });
  const createData = await createRes.json();
  console.log(`[Creative] kie.ai createTask raw:`, JSON.stringify(createData).substring(0, 300));
  const taskId = createData?.data?.taskId;
  console.log(`[Creative] kie.ai task created: ${taskId}`);

  // Step 2 — poll for result (24 × 5s = 2 min max)
  let imageUrl = null;
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${KIE_QUERY_URL}?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${kieApiKey}` },
    });
    const pollText = await pollRes.text();
    if (i === 0) console.log(`[Creative] kie.ai poll raw response: ${pollText.substring(0, 300)}`);
    const pollData = JSON.parse(pollText);
    const state = pollData?.data?.state;
    console.log(`[Creative] kie.ai poll ${i + 1}: state=${state}`);
    if (state === 'success') {
      console.log(`[Creative] kie.ai success raw:`, JSON.stringify(pollData.data).substring(0, 500));
      const result = JSON.parse(pollData.data.resultJson);
      console.log(`[Creative] kie.ai resultJson parsed:`, JSON.stringify(result).substring(0, 300));
      imageUrl = result.resultUrls?.[0];
      break;
    }
    if (state === 'failed') break;
  }
  return imageUrl;
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
 * Build a fal.ai image prompt from session context using AHRI's three-tier awareness system.
 *
 * Tier is driven by variant position within the 5-image set (variant % 5):
 *   0–1 → Cold (Level 1–2): life context only, no gym visible
 *   2–3 → Warm (Level 3–4): gym visible but not focal point
 *   4   → Offer (Level 5): clean dark graphic, text only
 *
 * Within the cold tier, category (object vs environment) selects the shot type.
 * All data comes from AHRI's R2 knowledge base files written at session complete.
 */
function buildImagePrompt(ctx, category, variant) {
  const { brainState, avatar, research, confirmedHooks } = ctx;

  // ── brain-state/current-state.md → city, market gap, active offer
  const brainLines = (typeof brainState === 'string' ? brainState : '').split('\n');
  const city = brainLines.find(l => l.toLowerCase().startsWith('city:'))?.replace(/city:\s*/i, '').trim() || '';
  const brainMarketGap = brainLines.find(l => l.toLowerCase().startsWith('market gap:'))?.replace(/market gap:\s*/i, '').trim() || '';
  const activeOffer = brainLines.find(l => l.toLowerCase().startsWith('active offer:'))?.replace(/active offer:\s*/i, '').trim() || '';

  // ── knowledge-base/fitness/lifestyle-avatar.md → avatar description + trigger moment
  const avatarLines = (typeof avatar === 'string' ? avatar : '').split('\n');
  const whoIdx = avatarLines.findIndex(l => /##\s*(who they are|the avatar)/i.test(l));
  const momentIdx = avatarLines.findIndex(l => /##\s*the moment/i.test(l));

  const avatarDescription = (whoIdx !== -1 ? avatarLines.slice(whoIdx + 1) : avatarLines)
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 3).join(' ').substring(0, 250)
    || 'woman, early 40s, average build, slightly tired, ordinary clothes';

  const triggerMoment = momentIdx !== -1
    ? avatarLines.slice(momentIdx + 1).filter(l => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').substring(0, 200)
    : '';

  // ── confirmed-hooks.json → active hook text
  const hooks = Array.isArray(confirmedHooks)
    ? confirmedHooks
    : Array.isArray(confirmedHooks?.selected) ? confirmedHooks.selected
    : Array.isArray(confirmedHooks?.hooks) ? confirmedHooks.hooks
    : [];
  const confirmedHook = hooks[0]?.hook || hooks[0]?.text || hooks[0]?.headline || triggerMoment || 'the moment they decided something had to change';

  // ── prospect-research.json → competitors, styles, market gap
  const competitorList = (research?.competitors || []).slice(0, 3);
  const competitorNames = competitorList.map(c => c.name).join(', ') || 'typical gyms';
  const marketGap = research?.marketGap || research?.market_gap || brainMarketGap || 'community over performance';

  // Determine awareness tier from position within the 5-image set
  const pos = variant % 5;
  const tier = pos <= 1 ? 'cold' : pos <= 3 ? 'warm' : 'offer';

  // ── COLD (Level 1–2) — no gym, life context only
  if (tier === 'cold') {
    // category=object → object-focused life moment; category=environment → setting-first life moment
    if (category === 'object') {
      return `Candid phone photo. ${avatarDescription}. Kitchen counter or car dashboard, late afternoon light. Real objects from her daily life in the foreground — car keys, a cooling coffee cup, maybe a kid's permission slip. She's partially visible in the background, slightly out of focus, moving through her afternoon. Not aware of camera. Mood: ordinary. Natural side light, slightly imperfect frame. Looks like a real memory, not an advertisement.

Hook this image captures: ${confirmedHook}

NO: fitness model physique, staged poses, professional lighting, stock photo composition, before/after framing, gym, fitness equipment, artificial skin smoothing, too-perfect framing.`.trim();
    }

    return `Candid phone photo. ${avatarDescription}. Soccer field sideline, late afternoon golden light, other parents blurred in background. She's watching the field, arms loosely crossed, phone in her other hand. Not sad — just the ordinary tiredness of someone doing everything. Caught mid-moment, not aware of camera. Mood: ordinary. Background slightly out of focus, foreground sharp. Looks like a real memory someone saved on their phone.

Hook this image captures: ${confirmedHook}

NO: gym, fitness equipment, model physique, staged poses, professional lighting, stock photo aesthetic, before/after framing, artificial skin smoothing, too-perfect framing.`.trim();
  }

  // ── WARM (Level 3–4) — gym visible but not focal point
  if (tier === 'warm') {
    const gymLocation = city ? `${city} community gym` : 'small community gym';

    if (pos === 2) {
      // Coaching moment — accountability relationship
      return `Candid phone photo. Coach and member mid-conversation, not mid-workout. ${gymLocation} visible but out of focus in background. Coach listening, leaning slightly in. Member ${avatarDescription.substring(0, 80)}, gym clothes but not performance wear. Natural window light from the left, slightly imperfect angle like someone nearby took it without them noticing. Mood: seen. What ${competitorNames} are NOT showing: ${marketGap}.

NO: staged workout poses, fitness model physiques, perfect lighting setup, before/after framing, gym equipment as focal point, artificial skin smoothing, stock photo aesthetic.`.trim();
    }

    // Community warm moment — two regulars
    return `Candid phone photo. Two members who know each other, mid-conversation between sets. ${gymLocation} visible but out of focus in background. Real builds, real ages 35–55, genuine conversation energy. Natural light, slightly imperfect angle — looks like someone nearby took it without them noticing. Not a staged group photo — a natural moment of two regulars. Mood: belonging. Hook: ${confirmedHook}.

NO: staged workout poses, fitness model physiques, perfect lighting setup, before/after framing, gym equipment as focal point, artificial skin smoothing, stock photo aesthetic.`.trim();
  }

  // ── OFFER (Level 5) — direct graphic, no people
  const offerText = activeOffer || '$1 for your first 30 days — fully coached';
  return `Clean dark graphic. Deep charcoal background, slight texture. Bold white headline under 6 words. Offer details below in slightly smaller weight: "${offerText}". One sentence guarantee at bottom, smallest text. High contrast, confident. No people. Looks like a premium brand announcement, not a discount ad.

NO: bright colors, stock photo elements, cluttered layout, more than 3 text elements, fitness imagery, people, lifestyle photography.`.trim();
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
 * Generate 5 images, run both quality gates, optionally upload passing images to a Drive folder.
 * Minimum 2 must pass — if fewer pass on first attempt, regenerates once with adjusted prompt.
 *
 * If `generatedFolderId` is provided: uploads to that Drive folder and returns
 *   [{ fileId, webViewLink, url, tier, position, score, reason }].
 * If `generatedFolderId` is null/undefined: skips the Drive upload step and returns
 *   [{ url, tier, position, score, reason }] — useful for callers (e.g. ad-creatives.js)
 *   that just need the kie.ai URLs.
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

    // ── Step 2: Resolve gym-specific KIE key
    const kieApiKey = getKieApiKey(ctx.gymId);
    console.log('[Creative] KIE API key resolved');

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

      // Generate images via kie.ai (async: createTask → poll queryTask)
      console.log(`[Creative] submitting ${prompts.length} tasks to kie.ai model ${KIE_MODEL}...`);
      const generations = await Promise.allSettled(
        prompts.map(({ prompt, passes }) => {
          if (!passes) return Promise.reject(new Error('Prompt failed compliance gate'));
          return kieGenerateImage(prompt, kieApiKey);
        })
      );

      for (let i = 0; i < generations.length; i++) {
        const gen = generations[i];
        const position = i + (attempt * 5);
        const tier = tierFromPosition(position);
        if (gen.status === 'rejected') {
          console.warn(`[Creative] image ${i + 1} FAILED:`, gen.reason?.message);
          continue;
        }

        // kieGenerateImage resolves to a URL string
        const imageUrl = gen.value;
        if (!imageUrl) {
          console.warn(`[Creative] image ${i + 1}: kieGenerateImage resolved with no URL`);
          continue;
        }
        console.log(`[Creative] image ${i + 1} (tier=${tier}) URL received: ${imageUrl.substring(0, 80)}...`);

        // Authenticity gate
        console.log(`[Creative] image ${i + 1}: running authenticityGate...`);
        const gate = await authenticityGate(imageUrl, client);
        console.log(`[Creative] image ${i + 1}: score=${gate.score} passes=${gate.passes} reason="${gate.reason}"`);
        if (!gate.passes) continue;

        // Caller didn't ask for Drive upload (ad-creatives pipeline). Rehost
        // the ephemeral kie URL into R2 NOW, while the URL is still alive, so
        // ad-creatives.json / confirmed-creative.json end up holding a
        // permanent public-proxy URL instead of a 24-48h kie URL that 404s.
        if (!generatedFolderId) {
          const permanentUrl = await rehostKieImageToR2(imageUrl, sessionId, tier);
          if (!permanentUrl) {
            console.warn(`[Creative] image ${i + 1}: rehost failed — falling back to kie URL (will expire)`);
          }
          results.push({ url: permanentUrl || imageUrl, tier, position, score: gate.score, reason: gate.reason });
          continue;
        }

        // Download
        console.log(`[Creative] image ${i + 1}: downloading from kie.ai URL...`);
        const fetchRes = await fetch(imageUrl);
        if (!fetchRes.ok) {
          console.warn(`[Creative] image ${i + 1}: download failed — HTTP ${fetchRes.status}`);
          continue;
        }
        const rawBuffer = Buffer.from(await fetchRes.arrayBuffer());
        console.log(`[Creative] image ${i + 1}: downloaded ${rawBuffer.length} bytes`);

        // Compress — max 1200px wide, quality 85 JPEG
        const buffer = await sharp(rawBuffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        console.log(`[Creative] image ${i + 1}: compressed ${rawBuffer.length} → ${buffer.length} bytes`);

        // Upload to Drive
        const fileName = `creative-${attempt + 1}-${i + 1}-score${gate.score}-${Date.now()}.jpg`;
        console.log(`[Creative] image ${i + 1}: uploading to Drive folder ${generatedFolderId} as ${fileName}...`);
        const uploaded = await uploadFileToDrive(generatedFolderId, fileName, buffer, 'image/jpeg');
        if (uploaded) {
          console.log(`[Creative] image ${i + 1}: Drive upload OK — fileId=${uploaded.id}`);
          results.push({ fileId: uploaded.id, webViewLink: uploaded.webViewLink, url: imageUrl, tier, position, score: gate.score, reason: gate.reason });
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

module.exports = { generateOnboardingCreative, generateContentSchedule, tierFromPosition, rehostBufferToR2, rehostKieImageToR2 };
