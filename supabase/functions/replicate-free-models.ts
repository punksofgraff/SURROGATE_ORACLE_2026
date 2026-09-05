/**
 * Replicate's official "Try for Free" collection.
 *
 * This is deliberately a capability catalog, not a promise that every account
 * can run every model. Free-run eligibility is account-scoped and is persisted
 * by the callers. Unknown models discovered during refresh remain blocked until
 * their input/output contract and license are reviewed.
 */

export const REPLICATE_FREE_COLLECTION_URL = 'https://replicate.com/collections/try-for-free';
export const REPLICATE_CATALOG_VERSION = 2;

export type ReplicateFreeCapability =
  | 'image-generation'
  | 'image-editing'
  | 'image-restoration'
  | 'image-upscale'
  | 'video-generation'
  | 'video-reframe'
  | 'video-upscale'
  | 'audio-generation';

export type ReplicateFreeJobKind =
  | 'image-generation'
  | 'image-replacement'
  | 'image-restoration'
  | 'video-generation'
  | 'story-h3-composite'
  | 'audio-generation';

export type ReplicateFreeModel = {
  slug: string;
  label: string;
  category: 'image' | 'video' | 'audio' | 'restoration' | 'unknown';
  capabilities: ReplicateFreeCapability[];
  requiredInput: 'prompt' | 'prompt-and-image' | 'image-or-video' | 'audio-or-text' | 'unknown';
  outputKind: 'image' | 'video' | 'audio' | 'unknown';
  sourceUrl: string;
  collectionUrl: string;
  observedAt: string;
  licensingWarning: string;
  freeEligibility: 'collection-listed' | 'requires-account-eligibility' | 'unknown-review-required';
  storyCompatible: boolean;
  blockedReason: string | null;
};

type ModelSeed = Omit<ReplicateFreeModel, 'sourceUrl' | 'collectionUrl' | 'observedAt'>;

const MODEL_SEEDS: Record<string, ModelSeed> = {
  'minimax/video-01': {
    slug: 'minimax/video-01',
    label: 'MiniMax Video-01',
    category: 'video',
    capabilities: ['video-generation'],
    requiredInput: 'prompt-and-image',
    outputKind: 'video',
    licensingWarning: 'Review MiniMax model and output terms before commercial use.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Not compatible with the ten-chunk MiniMax H3 composite contract.',
  },
  'luma/reframe-video': {
    slug: 'luma/reframe-video',
    label: 'Luma Reframe Video',
    category: 'video',
    capabilities: ['video-reframe'],
    requiredInput: 'image-or-video',
    outputKind: 'video',
    licensingWarning: 'Reframing is a transformation operation; confirm rights to the supplied video.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Reframe-only model; it does not generate the required story animation.',
  },
  'topazlabs/video-upscale': {
    slug: 'topazlabs/video-upscale',
    label: 'Topaz Video Upscale',
    category: 'video',
    capabilities: ['video-upscale'],
    requiredInput: 'image-or-video',
    outputKind: 'video',
    licensingWarning: 'Upscaling does not grant rights to the source footage or characters.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Upscaling-only model; it cannot replace a failed generative story request.',
  },
  'google/imagen-4': {
    slug: 'google/imagen-4',
    label: 'Google Imagen 4',
    category: 'image',
    capabilities: ['image-generation'],
    requiredInput: 'prompt',
    outputKind: 'image',
    licensingWarning: 'Review Google generative-AI terms and applicable content restrictions.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Image output cannot substitute for the H3 story-video contract.',
  },
  'black-forest-labs/flux-kontext-pro': {
    slug: 'black-forest-labs/flux-kontext-pro',
    label: 'FLUX.1 Kontext Pro',
    category: 'image',
    capabilities: ['image-generation', 'image-editing'],
    requiredInput: 'prompt-and-image',
    outputKind: 'image',
    licensingWarning: 'Review Black Forest Labs terms and preserve provenance for edited references.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Image edit/generation only; not a video or H3 replacement.',
  },
  'ideogram-ai/ideogram-v3-turbo': {
    slug: 'ideogram-ai/ideogram-v3-turbo',
    label: 'Ideogram V3 Turbo',
    category: 'image',
    capabilities: ['image-generation'],
    requiredInput: 'prompt',
    outputKind: 'image',
    licensingWarning: 'Review Ideogram commercial-use and generated-content terms.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Image output cannot substitute for the H3 story-video contract.',
  },
  'black-forest-labs/flux-1.1-pro': {
    slug: 'black-forest-labs/flux-1.1-pro',
    label: 'FLUX 1.1 Pro',
    category: 'image',
    capabilities: ['image-generation'],
    requiredInput: 'prompt',
    outputKind: 'image',
    licensingWarning: 'Review Black Forest Labs commercial-use terms before publishing output.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Image output cannot substitute for the H3 story-video contract.',
  },
  'black-forest-labs/flux-dev': {
    slug: 'black-forest-labs/flux-dev',
    label: 'FLUX Dev',
    category: 'image',
    capabilities: ['image-generation'],
    requiredInput: 'prompt',
    outputKind: 'image',
    licensingWarning: 'FLUX Dev may have non-commercial or usage restrictions; verify the current license.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Image output cannot substitute for the H3 story-video contract.',
  },
  'black-forest-labs/flux-2-pro': {
    slug: 'black-forest-labs/flux-2-pro',
    label: 'FLUX 2 Pro',
    category: 'image',
    capabilities: ['image-generation', 'image-editing'],
    requiredInput: 'prompt-and-image',
    outputKind: 'image',
    licensingWarning: 'Newly observed collection entry; verify the current model and commercial license before use.',
    freeEligibility: 'unknown-review-required',
    storyCompatible: false,
    blockedReason: 'New catalog entry requires input/output and license review before selection.',
  },
  'sczhou/codeformer': {
    slug: 'sczhou/codeformer',
    label: 'CodeFormer',
    category: 'restoration',
    capabilities: ['image-restoration'],
    requiredInput: 'image-or-video',
    outputKind: 'image',
    licensingWarning: 'Restoration output retains source-rights obligations and may alter identity details.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Restoration-only model; it cannot generate an original replacement image.',
  },
  'tencentarc/gfpgan': {
    slug: 'tencentarc/gfpgan',
    label: 'GFPGAN',
    category: 'restoration',
    capabilities: ['image-restoration'],
    requiredInput: 'image-or-video',
    outputKind: 'image',
    licensingWarning: 'Restoration output retains source-rights obligations and may alter identity details.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Restoration-only model; it cannot generate an original replacement image.',
  },
  'topazlabs/image-upscale': {
    slug: 'topazlabs/image-upscale',
    label: 'Topaz Image Upscale',
    category: 'restoration',
    capabilities: ['image-upscale'],
    requiredInput: 'image-or-video',
    outputKind: 'image',
    licensingWarning: 'Upscaling does not grant rights to the supplied source image.',
    freeEligibility: 'requires-account-eligibility',
    storyCompatible: false,
    blockedReason: 'Upscaling-only model; it cannot generate an original replacement image.',
  },
  'resemble-ai/chatterbox': {
    slug: 'resemble-ai/chatterbox',
    label: 'Chatterbox',
    category: 'audio',
    capabilities: ['audio-generation'],
    requiredInput: 'audio-or-text',
    outputKind: 'audio',
    licensingWarning: 'Voice likeness, consent, and commercial-use terms must be reviewed before use.',
    freeEligibility: 'unknown-review-required',
    storyCompatible: false,
    blockedReason: 'Audio-only model; it cannot provide story visuals.',
  },
};

const CURRENT_COLLECTION_SLUGS = Object.keys(MODEL_SEEDS);

export function staticReplicateFreeCatalog(observedAt = '2026-09-05T00:00:00.000Z'): ReplicateFreeModel[] {
  return CURRENT_COLLECTION_SLUGS.map(slug => ({
    ...MODEL_SEEDS[slug],
    sourceUrl: `https://replicate.com/${slug}`,
    collectionUrl: REPLICATE_FREE_COLLECTION_URL,
    observedAt,
  }));
}

function collectionSlugs(html: string): string[] {
  const slugs = new Set<string>();
  for (const match of html.matchAll(/href=["']\/([a-z0-9][a-z0-9-]+\/[a-z0-9][a-z0-9._-]+)["']/gi)) {
    slugs.add(match[1]);
  }
  return Array.from(slugs);
}

export function parseReplicateFreeCollection(
  html: string,
  observedAt: string,
): { catalog: ReplicateFreeModel[]; discoveredSlugs: string[]; unknownSlugs: string[] } {
  const discoveredSlugs = collectionSlugs(html);
  const catalog = discoveredSlugs.map(slug => {
    const seed = MODEL_SEEDS[slug];
    if (seed) {
      return {
        ...seed,
        sourceUrl: `https://replicate.com/${slug}`,
        collectionUrl: REPLICATE_FREE_COLLECTION_URL,
        observedAt,
      };
    }
    return {
      slug,
      label: slug,
      category: 'unknown' as const,
      capabilities: [],
      requiredInput: 'unknown' as const,
      outputKind: 'unknown' as const,
      sourceUrl: `https://replicate.com/${slug}`,
      collectionUrl: REPLICATE_FREE_COLLECTION_URL,
      observedAt,
      licensingWarning: 'Unclassified collection entry; verify capability, API contract, and license before use.',
      freeEligibility: 'unknown-review-required' as const,
      storyCompatible: false,
      blockedReason: 'Catalog drift: this model is not reviewed by the application.',
    };
  });
  return {
    catalog,
    discoveredSlugs,
    unknownSlugs: discoveredSlugs.filter(slug => !MODEL_SEEDS[slug]),
  };
}

export function catalogDrift(
  discoveredSlugs: string[],
  previousSlugs = CURRENT_COLLECTION_SLUGS,
): { added: string[]; removed: string[]; changed: boolean } {
  const discovered = new Set(discoveredSlugs);
  const previous = new Set(previousSlugs);
  return {
    added: discoveredSlugs.filter(slug => !previous.has(slug)),
    removed: previousSlugs.filter(slug => !discovered.has(slug)),
    changed: discovered.size !== previous.size
      || Array.from(discovered).some(slug => !previous.has(slug)),
  };
}

export async function refreshReplicateFreeCatalog(
  fetcher: typeof fetch = fetch,
  observedAt = new Date().toISOString(),
): Promise<{
  catalog: ReplicateFreeModel[];
  sourceUrl: string;
  observedAt: string;
  drift: { added: string[]; removed: string[]; changed: boolean };
  refreshed: boolean;
  error: string | null;
}> {
  try {
    const response = await fetcher(REPLICATE_FREE_COLLECTION_URL, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) throw new Error(`Replicate collection returned HTTP ${response.status}.`);
    const parsed = parseReplicateFreeCollection(await response.text(), observedAt);
    if (!parsed.catalog.length) throw new Error('Replicate collection did not expose any model cards.');
    return {
      catalog: parsed.catalog,
      sourceUrl: REPLICATE_FREE_COLLECTION_URL,
      observedAt,
      drift: catalogDrift(parsed.discoveredSlugs),
      refreshed: true,
      error: null,
    };
  } catch (error) {
    return {
      catalog: staticReplicateFreeCatalog(observedAt),
      sourceUrl: REPLICATE_FREE_COLLECTION_URL,
      observedAt,
      drift: { added: [], removed: [], changed: false },
      refreshed: false,
      error: error instanceof Error ? error.message.slice(0, 240) : 'Replicate catalog refresh failed.',
    };
  }
}

export function compatibleReplicateFreeModels(
  jobKind: ReplicateFreeJobKind,
  catalog = staticReplicateFreeCatalog(),
): ReplicateFreeModel[] {
  const required: Record<ReplicateFreeJobKind, ReplicateFreeCapability[]> = {
    'image-generation': ['image-generation'],
    'image-replacement': ['image-generation'],
    'image-restoration': ['image-restoration', 'image-upscale'],
    'video-generation': ['video-generation'],
    'story-h3-composite': [],
    'audio-generation': ['audio-generation'],
  };
  const capabilities = required[jobKind];
  return catalog.filter(model => (
    capabilities.length > 0
    && capabilities.some(capability => model.capabilities.includes(capability))
    && (jobKind === 'image-generation'
      ? model.requiredInput === 'prompt'
      : jobKind === 'image-replacement'
        ? model.requiredInput === 'prompt-and-image'
        : true)
    && model.outputKind !== 'unknown'
    && model.freeEligibility !== 'unknown-review-required'
    && (jobKind !== 'story-h3-composite' || model.storyCompatible)
  ));
}

export function classifyReplicateFreeFailure(value: unknown): 'exhausted' | 'billing' | 'rate-limit' | 'catalog-drift' | 'transient' | 'terminal' {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const message = raw.toLowerCase();
  if (/\b(?:free run|free-run|free allowance|allowance exhausted|quota exhausted|no free runs)\b/.test(message)) return 'exhausted';
  if (/\b(?:billing|credit|payment required|account|locked|balance|not eligible)\b/.test(message)) return 'billing';
  if (/\b(?:429|rate limit|too many requests)\b/.test(message)) return 'rate-limit';
  if (/\b(?:model not found|unknown model|catalog|version.*not found|404)\b/.test(message)) return 'catalog-drift';
  if (/\b(?:timeout|temporar|502|503|500|connection)\b/.test(message)) return 'transient';
  return 'terminal';
}

export function shouldSuppressReplicateFreeRetry(input: {
  status?: string | null;
  lastRequestKey?: string | null;
  requestKey: string;
  attempts?: number;
  maxAttempts?: number;
}): boolean {
  return input.status === 'exhausted'
    || input.status === 'billing-blocked'
    || input.status === 'catalog-drift'
    || input.lastRequestKey === input.requestKey
    || Number(input.attempts || 0) >= Number(input.maxAttempts ?? 1);
}