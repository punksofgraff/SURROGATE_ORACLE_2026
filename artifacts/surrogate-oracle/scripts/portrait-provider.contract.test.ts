import assert from 'node:assert/strict';
import {
  buildBasePrompt,
  buildDistillInstruction,
  promptLeaksSeekerLines,
  selectConversationAnchors,
} from '../../../supabase/functions/portrait-context.ts';
import {
  PORTRAIT_PROVIDER_MATRIX,
  orderedPortraitProviders,
  providerIsConfigured,
} from '../../../supabase/functions/portrait-provider-policy.ts';

const contrastA = {
  themes: ['connection', 'hope', 'neon'],
  context: {
    weightedThemes: [
      { theme: 'connection', weight: 5 },
      { theme: 'hope', weight: 3 },
    ],
    emotionalWeight: 'present',
    alignment: 'sacred',
    archetypeTitle: 'The Bridge Builder',
    sessionPhase: 'revelation',
    seekerLines: [
      'I want to make a place where my people can feel safe and seen.',
      'The hardest part is admitting I still hope for connection.',
      'That sounds interesting.',
      'Okay, keep going.',
      'I hear you.',
      'Sure.',
      'I hear you.',
    ],
  },
};

const contrastB = {
  themes: ['isolation', 'grief', 'shadow'],
  context: {
    weightedThemes: [
      { theme: 'isolation', weight: 5 },
      { theme: 'grief', weight: 3 },
    ],
    emotionalWeight: 'raw',
    alignment: 'profane',
    archetypeTitle: 'The Exile',
    sessionPhase: 'descent',
    seekerLines: [
      'I keep carrying grief like a locked room no one else can enter.',
      'Sometimes the shadow feels safer than being recognized.',
      'That sounds interesting.',
      'Okay, keep going.',
      'I hear you.',
      'Sure.',
      'I hear you.',
    ],
  },
};

assert.equal(PORTRAIT_PROVIDER_MATRIX.length, 6);
assert.deepEqual(
  orderedPortraitProviders({
    GOOGLE_AI_KEY_PAID: 'configured',
    VERTEX_AI_API_KEY: 'configured',
    HUGGINGFACE_API_KEY: 'configured',
    ENABLE_HUGGINGFACE_PORTRAITS: 'true',
    REPLICATE_API_TOKEN: 'configured',
    ALLOW_REPLICATE_FREE_FALLBACK: 'true',
  }).map(provider => provider.id),
  [
    'gemini-nano-banana-2-lite',
    'gemini-nano-banana-2',
    'vertex-imagen',
    'huggingface-flux-schnell',
    'replicate-free',
    'pollinations-flux',
  ],
);

assert.equal(providerIsConfigured(
  PORTRAIT_PROVIDER_MATRIX.find(provider => provider.id === 'huggingface-flux-schnell')!,
  { HUGGINGFACE_API_KEY: 'configured' },
), false, 'HF must not become active just because a key is present');
assert.deepEqual(
  orderedPortraitProviders({
    GOOGLE_AI_KEY_PAID: 'configured',
    HUGGINGFACE_API_KEY: 'configured',
    ENABLE_HUGGINGFACE_PORTRAITS: 'false',
  }).map(provider => provider.id),
  ['gemini-nano-banana-2-lite', 'gemini-nano-banana-2', 'pollinations-flux'],
);

const anchorsA = selectConversationAnchors(contrastA.context.seekerLines);
const anchorsB = selectConversationAnchors(contrastB.context.seekerLines);
assert.equal(anchorsA.length, 2);
assert.equal(anchorsA.some(line => line.includes('safe and seen')), true);
assert.equal(anchorsA.some(line => line.includes('I hear you.')), false);
assert.deepEqual(anchorsA, selectConversationAnchors(contrastA.context.seekerLines), 'anchor selection must be deterministic');
assert.notDeepEqual(anchorsA, anchorsB, 'contrasting conversations need contrasting anchors');

const promptA = buildBasePrompt(contrastA.themes, contrastA.context);
const promptB = buildBasePrompt(contrastB.themes, contrastB.context);
const instructionA = buildDistillInstruction(promptA, { ...contrastA.context, seekerLines: anchorsA });
const instructionB = buildDistillInstruction(promptB, { ...contrastB.context, seekerLines: anchorsB });
assert.notEqual(promptA, promptB);
assert.notEqual(instructionA, instructionB);
assert.match(instructionA, /sacred/);
assert.match(instructionB, /profane/);
assert.match(instructionA, /safe and seen/);
assert.match(instructionB, /locked room/);

assert.equal(
  promptLeaksSeekerLines('A luminous figure with safe and seen architecture', anchorsA, promptA),
  true,
  'copied conversation language must be rejected',
);
assert.equal(
  promptLeaksSeekerLines('A luminous figure with seeker@example.com and https://private.example/path', [
    'Contact me at seeker@example.com or visit https://private.example/path',
  ], promptA),
  true,
  'emails and URLs must be rejected even without a copied sentence',
);
assert.equal(
  promptLeaksSeekerLines('A luminous oracle with halo geometry and neon circuitry', anchorsA, promptA),
  false,
  'safe provider prompt vocabulary must remain usable',
);

type MockResult = 'success' | 'quota' | 'outage' | 'unavailable';
function runMockCascade(
  env: Record<string, string | undefined>,
  results: Partial<Record<string, MockResult>>,
) {
  const attempted: string[] = [];
  for (const provider of orderedPortraitProviders(env)) {
    const result = results[provider.id] ?? 'unavailable';
    if (result === 'unavailable') continue;
    attempted.push(provider.id);
    if (result === 'success') return { attempted, winner: provider.id };
    if (result === 'quota' || result === 'outage') continue;
  }
  return { attempted, winner: null };
}

const paidFallback = runMockCascade(
  { GOOGLE_AI_KEY_PAID: 'configured', VERTEX_AI_API_KEY: 'configured' },
  { 'gemini-nano-banana-2-lite': 'quota', 'gemini-nano-banana-2': 'success' },
);
assert.deepEqual(paidFallback, {
  attempted: ['gemini-nano-banana-2-lite', 'gemini-nano-banana-2'],
  winner: 'gemini-nano-banana-2',
});

const freeFallback = runMockCascade(
  { HUGGINGFACE_API_KEY: 'configured', ENABLE_HUGGINGFACE_PORTRAITS: 'true' },
  { 'huggingface-flux-schnell': 'outage', 'pollinations-flux': 'success' },
);
assert.deepEqual(freeFallback, {
  attempted: ['huggingface-flux-schnell', 'pollinations-flux'],
  winner: 'pollinations-flux',
});

const noBlindHf = runMockCascade(
  { VERTEX_AI_API_KEY: 'configured' },
  { 'huggingface-flux-schnell': 'success', 'pollinations-flux': 'success' },
);
assert.deepEqual(noBlindHf, {
  attempted: ['pollinations-flux'],
  winner: 'pollinations-flux',
});

console.log('portrait provider contract: ok');