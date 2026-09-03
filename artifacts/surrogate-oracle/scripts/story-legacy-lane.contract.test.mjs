import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgeSource = fs.readFileSync(
  new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url),
  'utf8',
);
const archiveMigration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260903000000_archive_historical_story_jobs.sql', import.meta.url),
  'utf8',
);
const hookSource = fs.readFileSync(
  new URL('../src/hooks/useIllustrationStoryFilm.ts', import.meta.url),
  'utf8',
);
const immersionSource = fs.readFileSync(
  new URL('../src/components/SurrogateOracleImmersion.tsx', import.meta.url),
  'utf8',
);
const cardSource = fs.readFileSync(
  new URL('../src/components/CreativeArtifactCard.tsx', import.meta.url),
  'utf8',
);

assert.match(edgeSource, /function isReadOnlyStoryJob\(row: StoryJobRow\)/);
assert.match(edgeSource, /mode: 'legacy-per-scene-readonly'/);
assert.equal(edgeSource.includes('isLegacyPerSceneJob'), false);
assert.equal(edgeSource.includes('LEGACY_PER_SCENE_CUTOFF'), false);
assert.equal(edgeSource.includes('pollFalScene'), false);
assert.equal(edgeSource.includes('pollMiniMaxScene'), false);
assert.equal(edgeSource.includes('cancelFalScene'), false);
assert.equal(edgeSource.includes('cancelMiniMaxScene'), false);
assert.equal(edgeSource.includes('createFalScene'), false);
assert.equal(edgeSource.includes('createMiniMaxScene'), false);
assert.equal(edgeSource.includes('persistRemoteScene'), false);
assert.equal(edgeSource.includes('replacementStoryPrompt'), false);
assert.match(archiveMigration, /oracle_film_jobs_story_archive/);
assert.match(archiveMigration, /created_at < timestamptz '2026-09-01T00:00:00\.000Z'/);
assert.match(archiveMigration, /legacyPerScene.*true/);
assert.match(archiveMigration, /workflowMode.*legacy-per-scene/);
assert.match(archiveMigration, /INSERT INTO public\.oracle_film_jobs_story_archive/);
assert.match(archiveMigration, /ON CONFLICT \(id\) DO NOTHING/);
assert.match(archiveMigration, /DELETE FROM public\.oracle_film_jobs/);

const createStart = edgeSource.indexOf("if (action === 'create')");
const createEnd = edgeSource.indexOf("if (action === 'create-local')");
const createBranch = edgeSource.slice(createStart, createEnd);
assert.equal((createBranch.match(/createFalScene\(/g) ?? []).length, 0);
assert.equal((createBranch.match(/createMiniMaxScene\(/g) ?? []).length, 0);
assert.match(createBranch, /createFalStoryWorkflow\(/);
assert.match(edgeSource, /Per-scene recovery has been retired/);
assert.match(edgeSource, /Historical per-scene story records are archived and read-only/);

assert.equal(hookSource.includes('retryScene'), false, 'the current hook must not expose direct per-scene submission');
assert.equal(hookSource.includes('replaceScene'), false, 'the current hook must not expose direct per-scene replacement');
assert.equal(immersionSource.includes('illustrationStoryFilm.retryScene'), false);
assert.equal(immersionSource.includes('illustrationStoryFilm.replaceScene'), false);
assert.match(cardSource, /legacyReadOnly/);
assert.match(cardSource, /onStorySceneRetry=\{storyReadOnly \? undefined : onStorySceneRetry\}/);
assert.match(cardSource, /onStorySceneReplace=\{storyReadOnly \? undefined : onStorySceneReplace\}/);
assert.match(cardSource, /Historical per-scene record · read-only/);

console.log('Legacy story lane contract: historical rows are read-only and direct scene helpers are retired.');