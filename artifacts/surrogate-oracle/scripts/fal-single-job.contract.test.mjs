import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const functionSource = await readFile(
  join(new URL('../../../supabase/functions/oracle-story-film-job/index.ts', import.meta.url).pathname),
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
assert.match(functionSource, /missing, duplicate, reordered, overlapping, or unverifiable panel ranges/);

const PAGE_COUNT = 32;
const DURATION = 120;
const expected = Array.from({ length: PAGE_COUNT }, (_, index) => ({
  panelId: `panel-${index + 1}`,
  pageNumber: index + 1,
  sourceHash: `hash-${index + 1}`,
}));

function validateCoverageCertificate(certificate) {
  assert.equal(certificate?.version, 1);
  assert.equal(certificate?.panelCount, PAGE_COUNT);
  assert.equal(Array.isArray(certificate?.panels), true);
  assert.equal(certificate.panels.length, PAGE_COUNT);
  assert.equal(typeof certificate.audioProvenance, 'object');
  let previousEnd = 0;
  for (const [index, panel] of certificate.panels.entries()) {
    const source = expected[index];
    assert.equal(panel.pageNumber, index + 1);
    assert.equal(panel.panelId, source.panelId);
    assert.equal(panel.sourceHash, source.sourceHash);
    assert.ok(panel.startSeconds >= previousEnd - 0.05);
    assert.ok(index === 0 || Math.abs(panel.startSeconds - previousEnd) <= 0.05);
    assert.ok(panel.endSeconds > panel.startSeconds);
    previousEnd = panel.endSeconds;
  }
  assert.ok(certificate.panels[0].startSeconds <= 0.05);
  assert.ok(Math.abs(previousEnd - DURATION) <= 0.75);
}

const valid = {
  version: 1,
  panelCount: PAGE_COUNT,
  totalDurationSeconds: DURATION,
  audioProvenance: { narration: 'persisted', music: 'persisted', nativeSceneAudio: false },
  panels: expected.map((panel, index) => ({
    ...panel,
    startSeconds: index * 3.75,
    endSeconds: (index + 1) * 3.75,
  })),
};
validateCoverageCertificate(valid);

for (const [label, mutate] of [
  ['missing panel', certificate => certificate.panels.pop()],
  ['duplicate panel', certificate => { certificate.panels[1] = { ...certificate.panels[0], startSeconds: 3.75, endSeconds: 7.5 }; }],
  ['reordered panel', certificate => { [certificate.panels[0], certificate.panels[1]] = [certificate.panels[1], certificate.panels[0]]; }],
  ['overlapping panel', certificate => { certificate.panels[4].startSeconds = 14.7; }],
  ['gapped panel', certificate => { certificate.panels[4].startSeconds = 15.2; }],
  ['unverifiable source', certificate => { certificate.panels[8].sourceHash = 'wrong-hash'; }],
]) {
  const invalid = structuredClone(valid);
  mutate(invalid);
  assert.throws(() => validateCoverageCertificate(invalid), label);
}

console.log('FAL single-job contract: one submission path and strict 32-panel certificate checks passed.');