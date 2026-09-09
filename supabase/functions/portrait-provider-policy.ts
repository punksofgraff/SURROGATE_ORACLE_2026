/**
 * Portrait provider policy.
 *
 * This is intentionally data-first. The edge function still owns the network
 * calls, storage, and billing boundaries; this module owns the order in which
 * a request is allowed to try them.
 */

export type PortraitProviderId =
  | 'gemini-nano-banana-2-lite'
  | 'gemini-nano-banana-2'
  | 'vertex-imagen'
  | 'huggingface-flux-schnell'
  | 'replicate-free'
  | 'pollinations-flux';

export type ProviderFreeTier =
  | 'free'
  | 'free-but-account-limited'
  | 'paid-low-cost'
  | 'paid'
  | 'unknown';

export type ProviderReadiness =
  | 'ready'
  | 'optional'
  | 'blocked-until-verified'
  | 'degraded';

export interface PortraitProviderRecord {
  id: PortraitProviderId;
  label: string;
  model: string;
  freeTier: ProviderFreeTier;
  readiness: ProviderReadiness;
  quality: 'high' | 'good' | 'variable' | 'unknown';
  latency: '<10s' | '10-30s' | '30s+' | 'redirect-only' | 'unmeasured';
  requiresSecret: string | null;
  optInEnv: string | null;
  durableOutput: boolean;
  conversationAnchors: boolean;
  observation: string;
}

/**
 * Current matrix from the controlled provider checks. "Success" here means
 * the provider completed its contract, not merely that a request was accepted.
 * Keep unverified providers visible instead of turning assumptions into
 * production fallbacks.
 */
export const PORTRAIT_PROVIDER_MATRIX: readonly PortraitProviderRecord[] = [
  {
    id: 'gemini-nano-banana-2-lite',
    label: 'Nano Banana 2 Lite',
    model: 'gemini-3.1-flash-lite-image',
    freeTier: 'paid-low-cost',
    readiness: 'ready',
    quality: 'good',
    latency: '10-30s',
    requiresSecret: 'GOOGLE_AI_KEY_PAID',
    optInEnv: null,
    durableOutput: true,
    conversationAnchors: true,
    observation: 'Preferred stable paid rung after the low-cost paid-key check; image bytes are re-hosted.',
  },
  {
    id: 'gemini-nano-banana-2',
    label: 'Nano Banana 2',
    model: 'gemini-3.1-flash-image',
    freeTier: 'paid',
    readiness: 'ready',
    quality: 'high',
    latency: '10-30s',
    requiresSecret: 'GOOGLE_AI_KEY_PAID',
    optInEnv: null,
    durableOutput: true,
    conversationAnchors: true,
    observation: 'Quality escalation after Lite; uses the same paid Gemini key and image contract.',
  },
  {
    id: 'vertex-imagen',
    label: 'Vertex Imagen',
    model: 'imagen-3.0-generate-002',
    freeTier: 'paid-low-cost',
    readiness: 'degraded',
    quality: 'high',
    latency: '10-30s',
    requiresSecret: 'VERTEX_AI_API_KEY',
    optInEnv: null,
    durableOutput: true,
    conversationAnchors: true,
    observation: 'Express API key path is currently degraded in the measured environment; breaker skips repeated 429/5xx failures.',
  },
  {
    id: 'huggingface-flux-schnell',
    label: 'Hugging Face FLUX.1-schnell',
    model: 'black-forest-labs/FLUX.1-schnell',
    freeTier: 'free-but-account-limited',
    readiness: 'optional',
    quality: 'good',
    latency: '30s+',
    requiresSecret: 'HUGGINGFACE_API_KEY',
    optInEnv: 'ENABLE_HUGGINGFACE_PORTRAITS',
    durableOutput: true,
    conversationAnchors: true,
    observation: 'Router capability and account quota are not guaranteed; never probe keyless on every cascade failure.',
  },
  {
    id: 'replicate-free',
    label: 'Replicate Try for Free',
    model: 'catalog-selected',
    freeTier: 'free-but-account-limited',
    readiness: 'optional',
    quality: 'variable',
    latency: '30s+',
    requiresSecret: 'REPLICATE_API_TOKEN',
    optInEnv: 'ALLOW_REPLICATE_FREE_FALLBACK',
    durableOutput: true,
    conversationAnchors: true,
    observation: 'Only account-eligible catalog entries may run; every output must be re-hosted before persistence.',
  },
  {
    id: 'pollinations-flux',
    label: 'Pollinations FLUX',
    model: 'flux',
    freeTier: 'free',
    readiness: 'ready',
    quality: 'variable',
    latency: 'redirect-only',
    requiresSecret: null,
    optInEnv: null,
    durableOutput: false,
    conversationAnchors: true,
    observation: 'Zero-key final image URL fallback; URL construction is immediate, while remote image availability is not measured here.',
  },
] as const;

const byId = new Map(PORTRAIT_PROVIDER_MATRIX.map(provider => [provider.id, provider]));

export function portraitProvider(id: PortraitProviderId): PortraitProviderRecord {
  const provider = byId.get(id);
  if (!provider) throw new Error(`Unknown portrait provider: ${id}`);
  return provider;
}

function hasSecret(env: Record<string, string | undefined>, name: string | null): boolean {
  return name === null || !!env[name]?.trim();
}

function explicitlyEnabled(env: Record<string, string | undefined>, name: string | null): boolean {
  return !name || env[name] === 'true';
}

/**
 * Order the cheapest viable stable behavior first, then quality escalations,
 * then explicitly enabled experiments, and finally the zero-key URL fallback.
 *
 * The function deliberately does not inspect circuit-breaker state; callers
 * must still check the persisted breaker immediately before a network request.
 */
export function orderedPortraitProviders(
  env: Record<string, string | undefined>,
): PortraitProviderRecord[] {
  const order: PortraitProviderId[] = [
    'gemini-nano-banana-2-lite',
    'gemini-nano-banana-2',
    'vertex-imagen',
    'huggingface-flux-schnell',
    'replicate-free',
    'pollinations-flux',
  ];

  return order
    .map(id => portraitProvider(id))
    .filter(provider => (
      hasSecret(env, provider.requiresSecret)
      && explicitlyEnabled(env, provider.optInEnv)
    ));
}

export function providerIsConfigured(
  provider: PortraitProviderRecord,
  env: Record<string, string | undefined>,
): boolean {
  return hasSecret(env, provider.requiresSecret)
    && explicitlyEnabled(env, provider.optInEnv);
}