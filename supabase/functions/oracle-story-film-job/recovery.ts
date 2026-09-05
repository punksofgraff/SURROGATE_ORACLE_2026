export type StoryProviderFailureCategory =
  | 'billing'
  | 'free-run-exhausted'
  | 'account-eligibility'
  | 'rate-limit'
  | 'catalog-drift'
  | 'content-policy'
  | 'prompt'
  | 'stale'
  | 'provider'
  | 'submission';

export type StoryRecoveryDisposition =
  | 'billing-blocked'
  | 'source-replacement-required'
  | 'prompt-rewrite-available'
  | 'retryable'
  | 'terminal';

export type StoryRecoveryPlan = {
  version: 1;
  category: StoryProviderFailureCategory;
  disposition: StoryRecoveryDisposition;
  retryable: boolean;
  requiresConfirmation: boolean;
  providerMessage: string;
  userMessage: string;
  requestId: string | null;
  affectedChunkNumbers: number[];
  affectedPageNumbers: number[];
  suggestedModelSlug: string | null;
  promptRewrite: string | null;
  removedTerms: string[];
  replacementBrief: string | null;
  freeFallback: {
    provider: 'replicate';
    status: 'not-compatible' | 'requires-account-eligibility' | 'available';
    compatibleModelSlugs: string[];
    reason: string;
  };
  attempts: number;
  maxAttempts: 1;
};

function text(value: unknown, max = 600): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '').replace(/["'`{}<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function numberList(value: unknown, max = 32): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0 && item <= 32)))
    .slice(0, max)
    .sort((left, right) => left - right);
}

export function classifyStoryProviderFailure(value: unknown): StoryProviderFailureCategory {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : '';
  const message = raw.toLowerCase();
  if (/\b(?:free run|free-run|free allowance|allowance exhausted|no free runs)\b/.test(message)) return 'free-run-exhausted';
  if (/\b(?:account.*eligible|not eligible|credential eligibility)\b/.test(message)) return 'account-eligibility';
  if (/\b(?:rate limit|too many requests|429)\b/.test(message)) return 'rate-limit';
  if (/\b(?:model not found|unknown model|catalog drift|version.*not found)\b/.test(message)) return 'catalog-drift';
  if (/\b(?:exhausted balance|insufficient balance|billing|quota|credit|payment required)\b/.test(message)) return 'billing';
  if (/\b(?:content[_ -]?policy|copyright|safety policy|policy violation|safety violation|disallowed content)\b/.test(message)) return 'content-policy';
  if (/\b(?:stale|belongs to request|belongs to another request|request identity|wrong request)\b/.test(message)) return 'stale';
  if (/\b(?:prompt|invalid input|unprocessable entity|422)\b/.test(message)) return 'prompt';
  if (/\b(?:submission|queue|429|rate limit|timeout|temporar|503|502|500)\b/.test(message)) return 'submission';
  return 'provider';
}

function providerMessage(value: unknown): string {
  if (typeof value === 'string') return text(value);
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['error', 'detail', 'message', 'reason', 'failure_reason']) {
    const detail = text(record[key]);
    if (detail) return detail;
  }
  return text(JSON.stringify(value));
}

function rewriteProtectedTerms(value: string): { prompt: string; removedTerms: string[] } {
  const replacements: Array<[RegExp, string, string]> = [
    [/\bPrincess Ghost Spider\b/gi, 'an original masked web-slinging princess', 'Princess Ghost Spider'],
    [/\bghost[- ]spider\b/gi, 'an original masked web-slinging heroine', 'Ghost Spider'],
    [/\bMario Spider-Man\b/gi, 'an original cheerful red-capped web-slinging adventurer', 'Mario Spider-Man'],
    [/\bSpider-Man\b/gi, 'an original friendly wall-crawling hero', 'Spider-Man'],
    [/\bMario\b/gi, 'an original cheerful red-capped adventurer', 'Mario'],
    [/\bDonkey\b/gi, 'an original loyal donkey-like companion', 'Donkey'],
  ];
  let prompt = value;
  const removedTerms: string[] = [];
  for (const [pattern, replacement, removed] of replacements) {
    if (pattern.test(prompt)) {
      removedTerms.push(removed);
      prompt = prompt.replace(pattern, replacement);
    }
  }
  return {
    prompt: prompt.replace(/\s+/g, ' ').trim().slice(0, 4000),
    removedTerms: Array.from(new Set(removedTerms)),
  };
}

export function distillStoryPrompt(prompt: unknown, failure: unknown): {
  prompt: string;
  removedTerms: string[];
  reasonCode: 'copyright-language' | 'provider-prompt' | 'unchanged';
} {
  const original = text(prompt, 4000);
  const rewritten = rewriteProtectedTerms(original);
  if (rewritten.removedTerms.length) {
    return {
      ...rewritten,
      reasonCode: 'copyright-language',
    };
  }
  const category = classifyStoryProviderFailure(failure);
  if (category === 'prompt') {
    return {
      prompt: `${original} Use only the supplied child-friendly illustration as reference. Do not add logos, named franchise characters, copyrighted marks, or text overlays.`.trim().slice(0, 4000),
      removedTerms: [],
      reasonCode: 'provider-prompt',
    };
  }
  return { prompt: original, removedTerms: [], reasonCode: 'unchanged' };
}

export function createStoryRecoveryPlan(input: {
  error: unknown;
  requestId?: unknown;
  chunkNumbers?: unknown;
  pageNumbers?: unknown;
  prompt?: unknown;
  modelSlug?: unknown;
  attempts?: unknown;
}): StoryRecoveryPlan {
  const message = providerMessage(input.error) || 'The hosted provider did not return a usable failure detail.';
  const category = classifyStoryProviderFailure(message);
  const attempts = Math.max(0, Math.min(1, Number(input.attempts) || 0));
  const rewrite = distillStoryPrompt(input.prompt, message);
  const isBilling = category === 'billing';
  const isFreeRunExhausted = category === 'free-run-exhausted';
  const isAccountEligibility = category === 'account-eligibility';
  const isPolicy = category === 'content-policy' || rewrite.reasonCode === 'copyright-language';
  const isPrompt = category === 'prompt' || rewrite.reasonCode === 'provider-prompt';
  const disposition: StoryRecoveryDisposition = isBilling
    ? 'billing-blocked'
    : isFreeRunExhausted || isAccountEligibility
      ? 'billing-blocked'
    : isPolicy
      ? 'source-replacement-required'
      : isPrompt
        ? 'prompt-rewrite-available'
        : category === 'submission'
          ? 'retryable'
          : 'terminal';
  const promptRewrite = isPrompt && rewrite.prompt !== text(input.prompt, 4000)
    ? rewrite.prompt
    : null;
  return {
    version: 1,
    category,
    disposition,
    retryable: disposition === 'prompt-rewrite-available' || disposition === 'retryable',
    requiresConfirmation: disposition !== 'billing-blocked' && disposition !== 'terminal',
    providerMessage: message,
    userMessage: isFreeRunExhausted
      ? 'The Replicate free-run allowance is exhausted for this account boundary. No blind retry was sent; wait for eligibility to return or use an explicitly funded provider.'
      : isAccountEligibility
        ? 'The provider account or credential is not eligible for this request. No blind retry was sent.'
        : isBilling
          ? 'FAL rejected this request because the server-side provider account is locked or out of balance. Local workspace funds do not prove this FAL credential can submit.'
      : isPolicy
        ? 'The provider flagged the supplied artwork or named character language. A materially original replacement reference is required; the source will not be silently altered.'
        : isPrompt
          ? 'The provider rejected the prompt. A constrained rewrite is available for confirmation before another metered request.'
          : category === 'submission'
            ? 'The provider submission was temporary or incomplete. One explicit retry may be available.'
            : 'The provider returned a failure that needs investigation before another request.',
    requestId: text(input.requestId, 240) || null,
    affectedChunkNumbers: numberList(input.chunkNumbers),
    affectedPageNumbers: numberList(input.pageNumbers),
    suggestedModelSlug: text(input.modelSlug, 180) || null,
    promptRewrite,
    removedTerms: rewrite.removedTerms,
    replacementBrief: isPolicy
      ? 'Create an original child-friendly storybook reference with the same broad action, composition, color energy, and page order, but new character designs, costumes, symbols, and names. Do not imitate a named franchise.'
      : null,
    freeFallback: {
      provider: 'replicate',
      status: 'not-compatible',
      compatibleModelSlugs: [],
      reason: 'Replicate free collection models are not compatible with the ten-chunk MiniMax H3 story contract; no silent substitution is allowed.',
    },
    attempts,
    maxAttempts: 1,
  };
}