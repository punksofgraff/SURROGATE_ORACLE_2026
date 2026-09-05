import assert from 'node:assert/strict';
import {
  classifyStoryProviderFailure,
  createStoryRecoveryPlan,
  distillStoryPrompt,
} from '../../../supabase/functions/oracle-story-film-job/recovery.ts';

assert.equal(classifyStoryProviderFailure('FAL 403: User is locked. Reason: Exhausted balance.'), 'billing');
assert.equal(classifyStoryProviderFailure('request rejected by content policy for copyrighted source'), 'content-policy');
assert.equal(classifyStoryProviderFailure('422 invalid prompt: unsupported input'), 'prompt');
assert.equal(classifyStoryProviderFailure('temporary queue timeout'), 'submission');
assert.equal(classifyStoryProviderFailure('response belongs to another request'), 'stale');

const billing = createStoryRecoveryPlan({
  error: 'FAL 403: User is locked. Reason: Exhausted balance.',
  requestId: 'request-billing',
  chunkNumbers: [5],
  pageNumbers: [13, 14, 15],
  modelSlug: 'minimax/h3/image-to-video',
});
assert.equal(billing.disposition, 'billing-blocked');
assert.equal(billing.retryable, false);
assert.equal(billing.requiresConfirmation, false);
assert.equal(billing.requestId, 'request-billing');

const policy = createStoryRecoveryPlan({
  error: 'content policy rejected the supplied source image',
  requestId: 'request-policy',
  chunkNumbers: [2],
  pageNumbers: [5, 6, 7, 8],
  prompt: 'Mario Spider-Man helps Donkey cross the bridge.',
});
assert.equal(policy.disposition, 'source-replacement-required');
assert.equal(policy.retryable, false);
assert.ok(policy.replacementBrief);

const rewrite = distillStoryPrompt(
  'Mario Spider-Man helps Donkey cross the bridge.',
  '422 invalid prompt',
);
assert.equal(rewrite.reasonCode, 'copyright-language');
assert.ok(!rewrite.prompt.includes('Mario Spider-Man'));
assert.ok(!rewrite.prompt.includes('Donkey'));

const prompt = createStoryRecoveryPlan({
  error: '422 invalid prompt: the request contains unsupported text',
  requestId: 'request-prompt',
  chunkNumbers: [9],
  pageNumbers: [27, 28, 29],
  prompt: 'A child-friendly illustrated river crossing.',
});
assert.equal(prompt.disposition, 'prompt-rewrite-available');
assert.equal(prompt.retryable, true);
assert.equal(prompt.requiresConfirmation, true);
assert.equal(prompt.attempts, 0);
assert.equal(prompt.maxAttempts, 1);

console.log('story provider recovery contract: ok');