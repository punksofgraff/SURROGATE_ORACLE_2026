const PAGE_COUNT = 32;
const PAGE_DURATION_SECONDS = 3.75;
const CREATED_AT = '2026-09-02T12:00:00.000Z';
const SOURCE_ASSET = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="800"%3E%3Crect width="800" height="800" fill="%23081424"/%3E%3Ccircle cx="400" cy="400" r="220" fill="%2300d9ff" opacity=".28"/%3E%3C/svg%3E';
const SCENE_ASSET = 'data:video/mp4;base64,AAAA';

function shotPlan(pageNumber) {
  return {
    treatment: pageNumber % 2 === 0 ? 'slow-push' : 'shoreline-reveal',
    subjectFocus: `the authored subject in panel ${pageNumber}`,
    actionBeat: `the authored action beat for shot ${pageNumber}`,
    environmentBeat: 'the authored environment holds its shape',
    cameraMove: 'slow push',
    performanceCue: 'group-performance',
    soundCue: 'shore',
    soundOffsetSeconds: 0.25,
    lipSyncMode: 'line-timed',
    focusX: 0.5,
    focusY: 0.5,
  };
}

export function createIllustrationStoryReviewFixture() {
  const pages = Array.from({ length: PAGE_COUNT }, (_, index) => {
    const pageNumber = index + 1;
    return {
      id: `browser-review-page-${pageNumber}`,
      pageNumber,
      sheetIndex: pageNumber <= 16 ? 0 : 1,
      row: Math.floor((index % 16) / 4),
      column: index % 4,
      sourceAsset: SOURCE_ASSET,
      title: `Browser review panel ${pageNumber}`,
      narration: `Narration ${pageNumber}`,
      durationSeconds: PAGE_DURATION_SECONDS,
      status: 'ready',
      progress: 100,
      shotPlan: shotPlan(pageNumber),
    };
  });

  const scenes = pages.map(page => ({
    pageNumber: page.pageNumber,
    sheetIndex: page.sheetIndex,
    row: page.row,
    column: page.column,
    durationSeconds: page.durationSeconds,
    seed: page.pageNumber,
    referenceUrl: page.sourceAsset,
    status: 'ready',
    progress: 100,
    outputUrl: SCENE_ASSET,
  }));

  const audioSources = [
    { id: 'narration', label: 'Oracle narration', status: 'available', sourceLabel: 'Generated narration', generated: true },
    ...['levi', 'lennon', 'pickles', 'ghost-spider', 'mario-spider-man', 'donkey'].map(speaker => ({
      id: `character:${speaker}`,
      label: speaker,
      status: 'available',
      sourceLabel: `Gemini catalog voice · ${speaker}`,
      generated: true,
    })),
    { id: 'music', label: 'Lyria music bed', status: 'available', sourceLabel: 'Lyria instrumental anchor', generated: true },
    { id: 'sfx', label: 'Sound effects', status: 'not-requested', sourceLabel: 'No discrete SFX source', generated: false },
  ];

  let startSeconds = 0;
  const shots = pages.map(page => {
    const endSeconds = startSeconds + page.durationSeconds;
    const evidence = [
      ['beginning', 0.04],
      ['middle', 0.5],
      ['end', 0.94],
    ].map(([label, fraction]) => ({
      label,
      mediaUrl: SCENE_ASSET,
      offsetSeconds: Math.min(page.durationSeconds - 0.04, page.durationSeconds * fraction),
      available: true,
      source: 'scene',
    }));
    const shot = {
      pageNumber: page.pageNumber,
      startSeconds,
      endSeconds,
      source: {
        assetUrl: page.sourceAsset,
        sheetIndex: page.sheetIndex,
        row: page.row,
        column: page.column,
      },
      rendered: {
        status: 'ready',
        sceneUrl: SCENE_ASSET,
        evidence,
      },
      shotPlan: page.shotPlan,
    };
    startSeconds = endSeconds;
    return shot;
  });

  const reviewManifest = {
    version: 1,
    pageCount: PAGE_COUNT,
    durationSeconds: PAGE_COUNT * PAGE_DURATION_SECONDS,
    finalMediaUrl: SCENE_ASSET,
    shots,
    audioSources,
    complete: true,
    createdAt: CREATED_AT,
  };

  return {
    id: 'browser-review-story-artifact',
    requestId: 'browser-review-story-request',
    kind: 'film',
    title: 'Browser review fixture · 32-shot story',
    prompt: 'A complete 32-shot illustration story fixture for studio review.',
    missingDetails: [],
    followUpCompleted: true,
    status: 'partial',
    providerLabel: 'Browser fixture · no provider generation',
    provider: 'browser-film',
    progress: 100,
    createdAt: CREATED_AT,
    requiresConfirmation: false,
    outputLabel: 'Unreviewed 32-page browser fixture · MP4',
    outputUrl: SCENE_ASSET,
    error: null,
    metadata: {
      production: 'illustration-story-studio',
      productionMode: 'browser-fixture',
      storyStage: 'rendered; studio watch + listen approval required',
      studioReview: { status: 'unreviewed', required: 'watch-and-listen' },
      storyScenes: scenes,
      audioManifest: audioSources,
      pageCount: PAGE_COUNT,
      totalDurationSeconds: PAGE_COUNT * PAGE_DURATION_SECONDS,
    },
    storyPages: pages,
    reviewManifest,
  };
}

export const illustrationStoryReviewFixtureSessionId = 'browser-review-fixture-session';