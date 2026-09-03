import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgeSource = fs.readFileSync(
  new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url),
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

assert.match(edgeSource, /function isLegacyPerSceneJob\(row: StoryJobRow\)/);
assert.match(edgeSource, /LEGACY_PER_SCENE_CUTOFF/);
assert.match(edgeSource, /manifest\.workflowMode === undefined && createdBeforeCutoff/);
assert.match(edgeSource, /function isReadOnlyStoryJob\(row: StoryJobRow\)/);
assert.match(edgeSource, /mode: 'legacy-per-scene-readonly'/);
assert.match(edgeSource, /Remove this branch once historical per-scene rows are migrated/);

const pollStart = edgeSource.indexOf('async function pollStoryJob(');
const pollWorkflowStart = edgeSource.indexOf("manifest.workflowMode === 'single-fal-workflow'", pollStart);
const pollDirectStart = edgeSource.indexOf('const scenes = sceneList(current.story_scenes);', pollWorkflowStart);
assert.ok(pollStart >= 0 && pollDirectStart > pollStart);
assert.match(
  edgeSource.slice(pollWorkflowStart, pollDirectStart),
  /if \(!isLegacyPerSceneJob\(current\)\) return current;/,
  'provider scene polling must be behind the legacy-only guard',
);

const createStart = edgeSource.indexOf("if (action === 'create')");
const createEnd = edgeSource.indexOf("if (action === 'create-local')");
const createBranch = edgeSource.slice(createStart, createEnd);
assert.equal((createBranch.match(/createFalScene\(/g) ?? []).length, 0);
assert.equal((createBranch.match(/createMiniMaxScene\(/g) ?? []).length, 0);
assert.match(createBranch, /createFalStoryWorkflow\(/);

const retryStart = edgeSource.indexOf("if (action === 'retry' || action === 'replace')");
const retryEnd = edgeSource.indexOf("\n  if (['queued', 'generating', 'stitching']", retryStart);
assert.match(
  edgeSource.slice(retryStart, retryEnd),
  /if \(!isLegacyPerSceneJob\(current\)\)/,
  'per-page provider recovery must reject non-legacy jobs',
);

assert.equal(hookSource.includes('retryScene'), false, 'the current hook must not expose direct per-scene submission');
assert.equal(hookSource.includes('replaceScene'), false, 'the current hook must not expose direct per-scene replacement');
assert.equal(immersionSource.includes('illustrationStoryFilm.retryScene'), false);
assert.equal(immersionSource.includes('illustrationStoryFilm.replaceScene'), false);
assert.match(cardSource, /legacyReadOnly/);
assert.match(cardSource, /onStorySceneRetry=\{storyReadOnly \? undefined : onStorySceneRetry\}/);
assert.match(cardSource, /onStorySceneReplace=\{storyReadOnly \? undefined : onStorySceneReplace\}/);
assert.match(cardSource, /Historical per-scene record · read-only/);

console.log('Legacy story lane contract: historical rows are read-only in current UI and direct scene helpers stay legacy-guarded.');