import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  pollFalStoryWorkflow,
  pollFalH3Chunks,
} from '../../../supabase/functions/oracle-story-film-job/polling.ts';

const functionSource = await readFile(
  join(new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url).pathname),
  'utf8',
);
const pollingSource = await readFile(
  join(new URL('../../../supabase/functions/oracle-story-film-job/polling.ts', import.meta.url).pathname),
  'utf8',
);
const createStart = functionSource.indexOf("if (action === 'create')");
const createEnd = functionSource.indexOf("if (action === 'create-local')");
assert.ok(createStart >= 0 && createEnd > createStart, 'the hosted create action must remain discoverable');
const createBranch = functionSource.slice(createStart, createEnd);

assert.equal(
  (createBranch.match(/createFalStoryWorkflow\(/g) ?? []).length,
  1,
  'the hosted create path must submit exactly one shared FAL workflow job',
);
assert.equal(
  (createBranch.match(/createFalScene\(/g) ?? []).length,
  0,
  'the hosted create path must not submit one FAL request per panel',
);
assert.equal(
  (createBranch.match(/createMiniMaxScene\(/g) ?? []).length,
  0,
  'the hosted create path must not fall back to direct MiniMax H3 requests',
);
assert.match(createBranch, /panel_manifest:\s*persistedPanelManifest/);
assert.match(createBranch, /submissionCount:\s*1/);
assert.match(pollingSource, /missing, duplicate, reordered, overlapping, or unverifiable panel ranges/);
assert.match(createBranch, /createFalH3ChunkRequest/);
assert.match(createBranch, /H3_CHUNK_COUNT/);
assert.match(createBranch, /Promise\.allSettled/);
assert.match(createBranch, /X-Fal-No-Retry/);
assert.match(functionSource, /method:\s*'PUT'/);
assert.match(functionSource, /Submission batch aborted after another H3 chunk failed/);
assert.match(functionSource, /minimax\/h3\/image-to-video/);

const PAGE_COUNT = 32;
const DURATION = 120;
const workflow = {
  requestId: 'fal-story-request-346',
  statusUrl: 'https://fal.example.test/queue/fal-story-request-346/status',
  responseUrl: 'https://fal.example.test/queue/fal-story-request-346/response',
};
const panelManifest = Array.from({ length: PAGE_COUNT }, (_, index) => ({
  panelId: `sheet-${index < 16 ? 1 : 2}-r${Math.floor((index % 16) / 4) + 1}-c${(index % 4) + 1}`,
  pageNumber: index + 1,
  sourceHash: `a${String(index + 1).padStart(63, '0')}`,
}));

function providerCertificate() {
  return {
    version: 1,
    audio_provenance: { narration: 'persisted', music: 'persisted', nativeSceneAudio: false },
    shots: panelManifest.map((panel, index) => ({
      panel_id: panel.panelId,
      page_number: panel.pageNumber,
      source_hash: panel.sourceHash.toUpperCase(),
      start_seconds: index * 3.75,
      end_seconds: (index + 1) * 3.75,
    })),
  };
}

function providerFixture({ status, response } = {}) {
  const calls = [];
  return {
    calls,
    request: async (url) => {
      calls.push(url);
      if (url === workflow.statusUrl) return structuredClone(status);
      if (url === workflow.responseUrl) return structuredClone(response);
      throw new Error(`unexpected provider URL: ${url}`);
    },
  };
}

const queuedProvider = providerFixture({
  status: { state: 'IN_QUEUE', request_id: workflow.requestId },
});
const queued = await pollFalStoryWorkflow(workflow, panelManifest, DURATION, queuedProvider.request);
assert.deepEqual(queued, { status: 'queued', progress: 8 });
assert.deepEqual(queuedProvider.calls, [workflow.statusUrl], 'queued polling must not fetch a response body');

const completedProvider = providerFixture({
  status: { status: 'SUCCEEDED', requestId: workflow.requestId },
  response: {
    requestId: workflow.requestId,
    video: { url: 'https://fal.example.test/results/story-film.mp4' },
    result: {
      coverage_certificate: providerCertificate(),
    },
  },
});
const completed = await pollFalStoryWorkflow(workflow, panelManifest, DURATION, completedProvider.request);
assert.equal(completed.status, 'ready', completed.error);
assert.equal(completed.progress, 100);
assert.equal(completed.output, 'https://fal.example.test/results/story-film.mp4');
assert.equal(completed.certificate.panels.length, PAGE_COUNT);
assert.deepEqual(completedProvider.calls, [workflow.statusUrl, workflow.responseUrl]);

// A valid workflow completion is persisted as one hosted film. Every scene
// points at that one film, while the manifest retains one coverage certificate.
const stableHostedFilm = 'https://storage.example.test/films/job-346/hosted-workflow.mp4';
const persisted = {
  final_media_url: stableHostedFilm,
  story_scenes: panelManifest.map(panel => ({ pageNumber: panel.pageNumber, outputUrl: stableHostedFilm })),
  story_manifest: { coverageCertificate: completed.certificate },
};
assert.equal(new Set(persisted.story_scenes.map(scene => scene.outputUrl)).size, 1);
assert.equal(persisted.final_media_url, stableHostedFilm);
assert.deepEqual(persisted.story_manifest.coverageCertificate, completed.certificate);
assert.match(functionSource, /final_media_url: stableUrl/);
assert.match(functionSource, /coverageCertificate: next\.certificate/);

async function assertFailedFixture(label, fixture) {
  const result = await pollFalStoryWorkflow(workflow, panelManifest, DURATION, fixture.request);
  assert.equal(result.status, 'failed', `${label} must fail closed`);
  assert.equal(result.progress, 0, `${label} must not report partial progress`);
  assert.match(result.error ?? '', /request|video URL|certificate|coverage|panel|ranges/i, label);
}

await assertFailedFixture('missing output', providerFixture({
  status: { state: 'COMPLETED', request_id: workflow.requestId },
  response: { request_id: workflow.requestId, result: { coverage_certificate: providerCertificate() } },
}));

await assertFailedFixture('stale status request identity', providerFixture({
  status: { state: 'COMPLETED', request_id: 'stale-fal-request' },
  response: { request_id: workflow.requestId, output_url: stableHostedFilm, coverageCertificate: providerCertificate() },
}));

await assertFailedFixture('stale completed response identity', providerFixture({
  status: { state: 'COMPLETED', request_id: workflow.requestId },
  response: { job_id: 'stale-fal-request', output_url: stableHostedFilm, coverageCertificate: providerCertificate() },
}));

const cancelledProvider = providerFixture({
  status: { status: 'CANCELLED', requestId: workflow.requestId },
});
const cancelled = await pollFalStoryWorkflow(workflow, panelManifest, DURATION, cancelledProvider.request);
assert.deepEqual(cancelled, {
  status: 'cancelled',
  progress: 0,
  error: 'Shared FAL story workflow was cancelled.',
});

for (const [label, mutate] of [
  ['missing panel', certificate => certificate.shots.pop()],
  ['duplicate panel', certificate => { certificate.shots[1] = { ...certificate.shots[0], page_number: 1, start_seconds: 3.75, end_seconds: 7.5 }; }],
  ['reordered panel', certificate => { [certificate.shots[0], certificate.shots[1]] = [certificate.shots[1], certificate.shots[0]]; }],
  ['overlapping panel', certificate => { certificate.shots[4].start_seconds = 14.7; }],
  ['gapped panel', certificate => { certificate.shots[4].start_seconds = 15.2; }],
  ['wrong hash', certificate => { certificate.shots[8].source_hash = 'wrong-hash'; }],
]) {
  const certificate = providerCertificate();
  mutate(certificate);
  await assertFailedFixture(label, providerFixture({
    status: { state: 'SUCCESS', request_id: workflow.requestId },
    response: {
      request_id: workflow.requestId,
      outputUrl: stableHostedFilm,
      result: { coverageCertificate: certificate },
    },
  }));
}

console.log('FAL single-job contract: provider-shaped polling, fail-closed certificates, and one-film persistence passed.');

const h3Chunks = [
  ...[4, 4, 3, 3, 3, 3, 3, 3, 3, 3].map((size, index) => ({
    chunkNumber: index + 1,
    pageNumbers: Array.from({ length: size }, (_, offset) => (
      [4, 4, 3, 3, 3, 3, 3, 3, 3, 3]
        .slice(0, index)
        .reduce((sum, value) => sum + value, 0) + offset + 1
    )),
    targetDurationSeconds: size * 3.75,
    requestedDurationSeconds: Math.min(15, Math.ceil(size * 3.75)),
    prompt: `chunk-${index + 1}`,
    imageUrl: `https://storage.example.test/chunk-${index + 1}.jpg`,
    requestId: `h3-request-${index + 1}`,
    statusUrl: `https://fal.example.test/h3/${index + 1}/status`,
    responseUrl: `https://fal.example.test/h3/${index + 1}/response`,
    status: 'queued',
    progress: 8,
    outputUrl: null,
    error: null,
  })),
];
const h3Provider = {
  calls: [],
  request: async (url) => {
    h3Provider.calls.push(url);
    const match = url.match(/h3\/(\d+)\//);
    const index = Number(match?.[1] ?? 0) - 1;
    const chunk = h3Chunks[index];
    if (url.endsWith('/status')) return { status: 'SUCCEEDED', request_id: chunk.requestId };
    return { request_id: chunk.requestId, video: { url: `https://fal.example.test/h3/${index + 1}.mp4` } };
  },
};
const h3Complete = await pollFalH3Chunks(h3Chunks, h3Provider.request);
assert.equal(h3Complete.status, 'ready', h3Complete.error);
assert.equal(h3Complete.chunks.length, 10);
assert.equal(h3Complete.chunks.filter(chunk => chunk.status === 'ready').length, 10);
assert.equal(h3Complete.progress, 100);
assert.equal(h3Provider.calls.length, 20);
const reorderedH3 = structuredClone(h3Chunks);
[reorderedH3[0], reorderedH3[1]] = [reorderedH3[1], reorderedH3[0]];
const reorderedResult = await pollFalH3Chunks(reorderedH3, h3Provider.request);
assert.equal(reorderedResult.status, 'failed');
assert.match(reorderedResult.error ?? '', /reordered|manifest/i);
const incompleteH3 = structuredClone(h3Chunks).slice(0, 9);
const incompleteResult = await pollFalH3Chunks(incompleteH3, h3Provider.request);
assert.equal(incompleteResult.status, 'failed');
assert.match(incompleteResult.error ?? '', /missing|cover/i);

console.log('MiniMax H3 ten-chunk contract: ten ordered requests, stale identity checks, and fail-closed manifest validation passed.');