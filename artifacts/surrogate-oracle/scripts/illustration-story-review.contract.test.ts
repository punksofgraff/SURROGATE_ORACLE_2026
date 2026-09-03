import assert from 'node:assert/strict';
import {
  canApproveIllustrationStoryReview,
  createIllustrationStoryReviewManifest,
  type IllustrationStoryPage,
  type IllustrationStoryReviewAudioSource,
  type IllustrationStoryScene,
} from '../src/lib/creativeProduction';

const PAGE_COUNT = 32;
const PAGE_DURATION_SECONDS = 3.75;

function pages(): IllustrationStoryPage[] {
  return Array.from({ length: PAGE_COUNT }, (_, index) => ({
    id: `page-${index + 1}`,
    pageNumber: index + 1,
    sheetIndex: index < 16 ? 0 : 1,
    row: Math.floor((index % 16) / 4),
    column: index % 4,
    sourceAsset: `sheet-${index < 16 ? 'one' : 'two'}.png`,
    title: `Panel ${index + 1}`,
    narration: `Narration ${index + 1}`,
    durationSeconds: PAGE_DURATION_SECONDS,
    status: 'ready',
    progress: 100,
    shotPlan: {
      treatment: 'shoreline-reveal',
      subjectFocus: 'the subject',
      actionBeat: 'the authored action',
      environmentBeat: 'the authored environment',
      cameraMove: 'slow push',
      performanceCue: 'group-performance',
      soundCue: 'shore',
      soundOffsetSeconds: 0.25,
      lipSyncMode: 'line-timed',
      focusX: 0.5,
      focusY: 0.5,
    },
  }));
}

function scenes(): IllustrationStoryScene[] {
  return pages().map(page => ({
    pageNumber: page.pageNumber,
    sheetIndex: page.sheetIndex,
    row: page.row,
    column: page.column,
    durationSeconds: page.durationSeconds,
    seed: page.pageNumber,
    referenceUrl: page.sourceAsset,
    status: 'ready',
    progress: 100,
    outputUrl: `https://example.test/scene-${page.pageNumber}.mp4`,
  }));
}

function audioSources(): IllustrationStoryReviewAudioSource[] {
  return [
    { id: 'narration', label: 'Oracle narration', status: 'available', sourceLabel: 'Generated narration', generated: true },
    ...['levi', 'lennon', 'pickles', 'ghost-spider', 'mario-spider-man', 'donkey'].map(speaker => ({
      id: `character:${speaker}`,
      label: speaker,
      status: 'available' as const,
      sourceLabel: `Gemini catalog voice · ${speaker}`,
      generated: true,
    })),
    { id: 'music', label: 'Lyria music bed', status: 'available', sourceLabel: 'Lyria instrumental anchor', generated: true },
    { id: 'sfx', label: 'Sound effects', status: 'not-requested', sourceLabel: 'No discrete SFX source', generated: false },
  ];
}

const manifest = createIllustrationStoryReviewManifest(
  pages(),
  scenes(),
  'blob:assembled-film',
  audioSources(),
  '2026-09-02T12:00:00.000Z',
);

assert.equal(manifest.version, 1);
assert.equal(manifest.pageCount, PAGE_COUNT);
assert.equal(manifest.complete, true);
assert.equal(manifest.durationSeconds, PAGE_COUNT * PAGE_DURATION_SECONDS);
assert.equal(manifest.shots.length, PAGE_COUNT);
assert.deepEqual(
  manifest.shots.slice(0, 5).map(shot => [shot.source.sheetIndex, shot.source.row, shot.source.column]),
  [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3], [0, 1, 0]],
);
assert.deepEqual(
  manifest.shots.slice(16, 20).map(shot => [shot.source.sheetIndex, shot.source.row, shot.source.column]),
  [[1, 0, 0], [1, 0, 1], [1, 0, 2], [1, 0, 3]],
);
assert.deepEqual(
  manifest.shots[0].rendered.evidence.map(evidence => evidence.label),
  ['beginning', 'middle', 'end'],
);
assert.ok(manifest.shots.every(shot => shot.rendered.evidence.every(evidence => (
  evidence.available
  && evidence.mediaUrl
  && evidence.source === 'scene'
))));
assert.equal(manifest.shots[0].rendered.evidence[0].offsetSeconds, 0.15);
assert.equal(manifest.shots[0].rendered.evidence[1].offsetSeconds, 1.875);
assert.equal(manifest.shots[0].rendered.evidence[2].offsetSeconds, 3.525);
assert.equal(manifest.audioSources.filter(source => source.id !== 'sfx').length, 8);
assert.equal(manifest.audioSources.find(source => source.id === 'character:donkey')?.generated, true);
assert.equal(canApproveIllustrationStoryReview(manifest), false, 'a complete render remains locked before explicit inspection');

const h3AudioSources = [
  ...audioSources().filter(source => source.id !== 'sfx'),
  {
    id: 'native-scene-audio',
    label: 'MiniMax H3 native scene audio',
    status: 'available' as const,
    sourceLabel: 'Embedded stereo scene audio',
    generated: true,
  },
  audioSources().find(source => source.id === 'sfx')!,
];
const h3Manifest = createIllustrationStoryReviewManifest(
  pages(),
  scenes(),
  'blob:h3-assembled-film',
  h3AudioSources,
);
const fullyReviewedH3Manifest = {
  ...h3Manifest,
  review: {
    inspectedShotNumbers: pages().map(page => page.pageNumber),
    audioListened: true,
    updatedAt: '2026-09-02T12:01:00.000Z',
  },
};
assert.equal(
  canApproveIllustrationStoryReview(fullyReviewedH3Manifest),
  true,
  'a fully reviewed H3 render may pass only when native scene audio is present',
);
assert.equal(
  canApproveIllustrationStoryReview({
    ...fullyReviewedH3Manifest,
    audioSources: h3AudioSources.map(source => source.id === 'native-scene-audio'
      ? { ...source, status: 'missing' as const, generated: false }
      : source),
  }),
  false,
  'H3 approval must remain locked when native scene audio is missing',
);

const fullyReviewedManifest = {
  ...manifest,
  review: {
    inspectedShotNumbers: pages().map(page => page.pageNumber),
    audioListened: true,
    updatedAt: '2026-09-02T12:01:00.000Z',
  },
};
assert.equal(fullyReviewedManifest.reviewHistory, undefined, 'legacy manifests may omit review history');
assert.equal(canApproveIllustrationStoryReview(fullyReviewedManifest), true);
assert.equal(
  canApproveIllustrationStoryReview({
    ...fullyReviewedManifest,
    review: {
      ...fullyReviewedManifest.review,
      inspectedShotNumbers: Array.from({ length: PAGE_COUNT }, () => 1),
    },
  }),
  false,
  'duplicate shot attestations must not satisfy the 32-shot review gate',
);
assert.equal(
  canApproveIllustrationStoryReview({
    ...fullyReviewedManifest,
    review: { ...fullyReviewedManifest.review, audioListened: false },
  }),
  false,
  'approval must remain locked until the current mix is listened to',
);

const missingAudioManifest = createIllustrationStoryReviewManifest(
  pages(),
  scenes(),
  'blob:assembled-film',
  audioSources().map(source => source.id === 'character:donkey'
    ? { ...source, status: 'missing', generated: false, previewUrl: null }
    : source),
);
assert.equal(
  missingAudioManifest.audioSources.find(source => source.id === 'character:donkey')?.status,
  'missing',
  'missing character audio must remain visible in the review inventory',
);

const missingEvidenceManifest = createIllustrationStoryReviewManifest(
  pages(),
  scenes().map(scene => scene.pageNumber === 7 ? { ...scene, outputUrl: null, status: 'failed' } : scene),
  null,
  audioSources(),
);
assert.equal(missingEvidenceManifest.complete, false);
assert.equal(missingEvidenceManifest.shots[6].rendered.evidence.every(evidence => !evidence.available), true);

console.log('illustration story review contract passed (32 exact crops, three checkpoints, truthful audio inventory, blocked evidence state)');