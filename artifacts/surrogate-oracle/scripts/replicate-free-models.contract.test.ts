import assert from 'node:assert/strict';
import {
  catalogDrift,
  classifyReplicateFreeFailure,
  compatibleReplicateFreeModels,
  parseReplicateFreeCollection,
  shouldSuppressReplicateFreeRetry,
  staticReplicateFreeCatalog,
} from '../../../supabase/functions/replicate-free-models.ts';

const catalog = staticReplicateFreeCatalog();
assert.equal(catalog.length, 13);
assert.ok(catalog.some(model => model.slug === 'resemble-ai/chatterbox'));
assert.ok(catalog.every(model => model.sourceUrl.startsWith('https://replicate.com/')));
assert.ok(catalog.every(model => model.collectionUrl.includes('/collections/try-for-free')));
assert.ok(catalog.every(model => model.licensingWarning.length > 0));

const parsed = parseReplicateFreeCollection(
  [
    '<a href="/black-forest-labs/flux-dev">Flux</a>',
    '<a href="/minimax/video-01">Video</a>',
    '<a href="/new-owner/new-model">New</a>',
  ].join(''),
  '2026-09-05T12:00:00.000Z',
);
assert.deepEqual(parsed.discoveredSlugs, [
  'black-forest-labs/flux-dev',
  'minimax/video-01',
  'new-owner/new-model',
]);
assert.deepEqual(parsed.unknownSlugs, ['new-owner/new-model']);
assert.equal(parsed.catalog.find(model => model.slug === 'new-owner/new-model')?.freeEligibility, 'unknown-review-required');

assert.deepEqual(catalogDrift(
  ['minimax/video-01', 'black-forest-labs/flux-dev'],
  ['black-forest-labs/flux-dev', 'minimax/video-01'],
), { added: [], removed: [], changed: false });
assert.deepEqual(catalogDrift(
  ['black-forest-labs/flux-dev', 'new-owner/new-model'],
  ['black-forest-labs/flux-dev', 'minimax/video-01'],
), {
  added: ['new-owner/new-model'],
  removed: ['minimax/video-01'],
  changed: true,
});

const imageModels = compatibleReplicateFreeModels('image-generation', catalog);
assert.deepEqual(imageModels.map(model => model.slug), [
  'google/imagen-4',
  'ideogram-ai/ideogram-v3-turbo',
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-dev',
]);
assert.deepEqual(
  compatibleReplicateFreeModels('image-replacement', catalog).map(model => model.slug),
  ['black-forest-labs/flux-kontext-pro'],
);
assert.equal(compatibleReplicateFreeModels('story-h3-composite', catalog).length, 0);
assert.equal(compatibleReplicateFreeModels('video-generation', catalog).map(model => model.slug).join(','), 'minimax/video-01');
assert.equal(compatibleReplicateFreeModels('image-restoration', catalog).length, 3);

assert.equal(classifyReplicateFreeFailure('Replicate says no free runs remain for this account'), 'exhausted');
assert.equal(classifyReplicateFreeFailure('HTTP 429 too many requests'), 'rate-limit');
assert.equal(classifyReplicateFreeFailure('model version not found'), 'catalog-drift');
assert.equal(classifyReplicateFreeFailure('temporary connection timeout'), 'transient');
assert.equal(shouldSuppressReplicateFreeRetry({
  status: 'exhausted',
  requestKey: 'same',
  lastRequestKey: 'other',
}), true);
assert.equal(shouldSuppressReplicateFreeRetry({
  status: 'available',
  requestKey: 'same',
  lastRequestKey: 'same',
}), true);
assert.equal(shouldSuppressReplicateFreeRetry({
  status: 'available',
  requestKey: 'next',
  lastRequestKey: 'same',
  attempts: 0,
  maxAttempts: 1,
}), false);

console.log('replicate free models contract: ok');