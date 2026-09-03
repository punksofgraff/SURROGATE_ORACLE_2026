import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createIllustrationStoryPages,
  isCreativeDispatchCurrent,
  isCreativeFilmJobCurrent,
  updateIllustrationStoryPages,
} from '../src/lib/creativeProduction.ts';

const storyJobSource = fs.readFileSync(new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url), 'utf8');
const storyHookSource = fs.readFileSync(new URL('../src/hooks/useIllustrationStoryFilm.ts', import.meta.url), 'utf8');

const runtime = (artifactId, token, status = 'generating') => ({
  artifactId,
  token,
  status,
});

const applyProviderResponse = (state, claim, patch) => (
  isCreativeDispatchCurrent(claim, state)
    ? { ...state, ...patch }
    : state
);

const oldBrief = { artifactId: 'artifact-old', token: 1 };
const newerBrief = { artifactId: 'artifact-new', token: 2 };

// A late Lyria completion cannot replace a newer brief, even if the provider
// response contains a successful, playable output.
const newBriefState = runtime('artifact-new', 2);
assert.deepEqual(
  applyProviderResponse(newBriefState, oldBrief, { status: 'ready', outputUrl: 'old-audio' }),
  newBriefState,
  'late Lyria output must not overwrite a newer brief',
);

// Cancellation is terminal for the current claim. This covers a provider
// completion racing the synchronous cancelled UI state.
const cancelledState = runtime('artifact-old', 1, 'cancelled');
assert.deepEqual(
  applyProviderResponse(cancelledState, oldBrief, { status: 'ready', outputUrl: 'late-audio' }),
  cancelledState,
  'cancelled Lyria output must not restore ready state',
);
assert.deepEqual(
  applyProviderResponse(cancelledState, oldBrief, { status: 'generating', progress: 48 }),
  cancelledState,
  'cancelled Lyria output must not restore generating state',
);

// Retry intentionally advances the dispatch token. The old completion is
// rejected, while the new confirmed claim is accepted exactly once.
const retriedState = runtime('artifact-old', 3);
const retriedBrief = { artifactId: 'artifact-old', token: 3 };
const dispatchedClaims = new Set();
let providerCallCount = 0;
const dispatchProviderOnce = (state, claim) => {
  const key = `${claim.artifactId}:${claim.token}`;
  if (!isCreativeDispatchCurrent(claim, state) || dispatchedClaims.has(key)) return false;
  dispatchedClaims.add(key);
  providerCallCount += 1;
  return true;
};
assert.equal(dispatchProviderOnce(runtime('artifact-old', 1), oldBrief), true, 'the first confirmation dispatches once');
assert.equal(dispatchProviderOnce(runtime('artifact-old', 1), oldBrief), false, 'the same confirmation cannot dispatch twice');
assert.equal(dispatchProviderOnce(retriedState, oldBrief), false, 'a late old claim cannot dispatch during retry');
assert.equal(dispatchProviderOnce(retriedState, retriedBrief), true, 'retry creates one intentional new provider dispatch');
assert.equal(providerCallCount, 2, 'retry should add one provider call, not duplicate either dispatch');
assert.deepEqual(
  applyProviderResponse(retriedState, oldBrief, { status: 'ready', outputUrl: 'old-audio' }),
  retriedState,
  'a retry must reject the previous provider claim',
);
assert.deepEqual(
  applyProviderResponse(retriedState, retriedBrief, { status: 'ready', outputUrl: 'retry-audio' }),
  { ...retriedState, status: 'ready', outputUrl: 'retry-audio' },
  'a retry claim must be accepted for its own dispatch',
);

// Film progress/completion also needs the exact job identity. A newer job
// cannot be overwritten by a late update from the previous job on the same
// artifact and dispatch.
const filmRuntime = runtime('artifact-film', 8);
const filmClaim = { artifactId: 'artifact-film', token: 8 };
const activeFilmJob = { claim: filmClaim, jobId: 'film-new' };
assert.equal(
  isCreativeFilmJobCurrent(filmClaim, 'film-old', activeFilmJob, filmRuntime),
  false,
  'late film job update must not cross the active job boundary',
);
assert.equal(
  isCreativeFilmJobCurrent(filmClaim, 'film-new', activeFilmJob, filmRuntime),
  true,
  'the active film job may update its own artifact',
);
assert.equal(
  isCreativeFilmJobCurrent(filmClaim, 'film-new', activeFilmJob, runtime('artifact-film', 9)),
  false,
  'film completion must be rejected after a retry advances the token',
);
assert.equal(
  isCreativeFilmJobCurrent(filmClaim, 'film-new', null, filmRuntime),
  false,
  'film progress must be rejected until this dispatch owns a job',
);

const storyPages = createIllustrationStoryPages('make a child-friendly page-by-page story film', '2026-09-01T12:00:00.000Z');
assert.equal(storyPages.length, 32, 'story proof must contain 32 panels');
assert.deepEqual(
  storyPages.map(page => [page.pageNumber, page.sheetIndex, page.row, page.column]),
  Array.from({ length: 32 }, (_, index) => [index + 1, index < 16 ? 0 : 1, Math.floor((index % 16) / 4), index % 4]),
  'story panels must remain contiguous and mapped to their source sheet grid',
);
assert.equal(storyPages[0].status, 'planned');
const inFlightPages = updateIllustrationStoryPages(storyPages, 58);
assert.equal(inFlightPages.filter(page => page.status === 'ready').length, 12, 'completed panels should remain visible during stitching');
assert.equal(inFlightPages.find(page => page.status === 'generating')?.pageNumber, 13, 'one active panel should be visible during stitching');
const failedPages = updateIllustrationStoryPages(inFlightPages, 58, 'stitch failed');
assert.equal(failedPages.find(page => page.status === 'failed')?.pageNumber, 13, 'the active panel should retain a retryable failure');

// Provider boundary: local rendering never invokes the hosted story job, while
// the hosted lane must carry explicit confirmation and an approved model slug.
const localStoryStart = storyHookSource.indexOf('const renderLocalStory');
const localStoryEnd = storyHookSource.indexOf('const cancel =', localStoryStart);
const localStoryBody = storyHookSource.slice(localStoryStart, localStoryEnd);
assert.equal(/action:\s*'create'/.test(localStoryBody), false, 'local story rendering must make no hosted video call');
assert.equal(localStoryBody.includes("action: 'create-local'"), true, 'local story rendering may persist a local review record');
assert.equal(storyJobSource.includes("if (!confirmed)"), true, 'hosted story requests require explicit confirmation');
assert.equal(storyJobSource.includes("if (!model)"), true, 'hosted story requests reject unapproved model slugs');
assert.equal(storyJobSource.includes('model_slug: model.slug'), true, 'the selected model slug must be persisted');
assert.equal(storyJobSource.includes('assembly: \'local-ffmpeg\''), true, 'new hosted jobs must hand visuals to local assembly');
assert.equal(storyJobSource.includes('runpod('), false, 'FAL story jobs must not call RunPod');
assert.equal(storyJobSource.includes('direct per-panel H3 requests are disabled'), true, 'the hosted lane must remain single-job');
assert.equal(storyJobSource.includes('pollMiniMaxScene'), false, 'legacy MiniMax scene polling must stay retired');
assert.equal(storyJobSource.includes('This historical Seedance job is readable but cannot be retried'), false, 'historical per-scene recovery must stay retired');
assert.equal(storyJobSource.includes('return json({ provider: \'fal\', models: falStoryModels()'), false, 'catalog reads must not submit hosted jobs');

console.log('creative dispatch contract passed (new brief, cancel, retry, film races, and story panel order)');