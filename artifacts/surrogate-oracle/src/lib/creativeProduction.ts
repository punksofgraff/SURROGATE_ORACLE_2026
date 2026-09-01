export type CreativeKind =
  | 'document'
  | 'pitch-deck'
  | 'social-pack'
  | 'image'
  | 'music'
  | 'film'
  | 'episodic-series';

export type CreativeArtifactStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'partial';

/**
 * A dispatch claim is captured at the moment a confirmed production request
 * starts. Provider callbacks may arrive after the seeker has replaced,
 * cancelled, or retried the brief, so every asynchronous artifact write must
 * prove that its claim still matches the active dispatch.
 */
export type CreativeDispatchClaim = Readonly<{
  artifactId: string;
  token: number;
}>;

export function isCreativeDispatchCurrent(
  claim: CreativeDispatchClaim | null | undefined,
  current: {
    artifactId: string | null;
    token: number;
    status?: CreativeArtifactStatus | null;
  },
): boolean {
  return Boolean(
    claim
    && claim.artifactId === current.artifactId
    && claim.token === current.token
    && current.status !== 'cancelled',
  );
}

export function isCreativeFilmJobCurrent(
  claim: CreativeDispatchClaim | null | undefined,
  jobId: string | null | undefined,
  activeJob: { claim: CreativeDispatchClaim; jobId: string } | null | undefined,
  current: {
    artifactId: string | null;
    token: number;
    status?: CreativeArtifactStatus | null;
  },
): boolean {
  return Boolean(
    jobId
    && activeJob?.jobId === jobId
    && activeJob.claim.artifactId === claim?.artifactId
    && activeJob.claim.token === claim?.token
    && isCreativeDispatchCurrent(claim, current),
  );
}

export type CreativeProvider =
  | 'local-draft'
  | 'local-concept'
  | 'local-series-manifest'
  | 'lyria'
  | 'browser-film'
  | 'premium-film';

export type IllustrationStoryPage = {
  id: string;
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  title: string;
  narration: string;
  durationSeconds: number;
  transition: 'fade';
};

export type IllustrationStoryScene = {
  pageNumber: number;
  sheetIndex: 0 | 1;
  row: number;
  column: number;
  durationSeconds: number;
  seed: number;
  referenceUrl?: string | null;
  status: 'planned' | 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId?: string | null;
  outputUrl?: string | null;
  error?: string | null;
};

export type CreativeMissingDetail =
  | 'audience'
  | 'platform'
  | 'subject'
  | 'mood'
  | 'format'
  | 'episode-count'
  | 'purpose';

export type CreativeRequest = {
  id: string;
  prompt: string;
  kind: CreativeKind;
  title: string;
  createdAt: string;
  missingDetails: CreativeMissingDetail[];
  requiresConfirmation: boolean;
};

export type CreativeScene = {
  id: string;
  title: string;
  brief: string;
  status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled';
  progress: number;
  jobId?: string | null;
  outputUrl?: string | null;
  error?: string | null;
};

export type CreativeEpisode = {
  id: string;
  number: number;
  title: string;
  brief: string;
  status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled' | 'partial';
  progress: number;
  scenes: CreativeScene[];
  outputUrl?: string | null;
  error?: string | null;
};

export type CreativeSeriesManifest = {
  seriesId: string;
  title: string;
  prompt: string;
  status: 'planned' | 'assembling' | 'ready' | 'partial' | 'failed' | 'cancelled';
  finalAssemblyUrl?: string | null;
  episodes: CreativeEpisode[];
};

export type SeriesRenderMode = 'local' | 'premium';

export type CreativeArtifact = {
  id: string;
  requestId: string;
  kind: CreativeKind;
  title: string;
  prompt: string;
  missingDetails: CreativeMissingDetail[];
  followUpCompleted: boolean;
  status: CreativeArtifactStatus;
  providerLabel: string;
  provider?: CreativeProvider;
  progress: number;
  createdAt: string;
  requiresConfirmation: boolean;
  confirmationLabel?: string;
  confirmationCopy?: string;
  outputLabel?: string;
  outputUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  seriesManifest?: CreativeSeriesManifest;
  storyPages?: IllustrationStoryPage[];
};

export type CreativeSeriesHistoryEntry = {
  artifact: CreativeArtifact;
  savedAt: string;
};

export const CREATIVE_SERIES_HISTORY_STORAGE_KEY = 'oracle_creative_series_history_v1';
export const CREATIVE_SERIES_HISTORY_MAX_ENTRIES = 12;
// Local production artifacts are intentionally retained for a useful working
// window, but stale provider URLs should not remain discoverable forever.
export const CREATIVE_SERIES_HISTORY_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export const ILLUSTRATION_STORY_PAGE_COUNT = 32;
export const ILLUSTRATION_STORY_PAGE_DURATION_SECONDS = 3.75;

export function isIllustrationStoryRequest(prompt: string): boolean {
  return /\b(?:illustration sheets?|picture[-\s]?book|storybook|page[-\s]?by[-\s]?page|4\s*[x×]\s*4|32\s+(?:page|panel))/i.test(prompt)
    || (/illustration/i.test(prompt) && /(?:story|film|video|animation|narrat)/i.test(prompt));
}

export function createIllustrationStoryPages(
  prompt: string,
  createdAt = new Date().toISOString(),
): IllustrationStoryPage[] {
  const storyId = createdAt.replace(/\D/g, '').slice(-10) || 'story';
  const leviPages = [
    'A bright new adventure begins on the shore.',
    'Levi and Lennon discover a secret waiting in the sea.',
    'Pickles leads the way beneath the sparkling waves.',
    'Even a silly pair of flip-flops can be important.',
    'A sudden splash sends the friends searching.',
    'A glowing tunnel opens under the water.',
    'The friends follow the light into a hidden kingdom.',
    'Coral castles and tiny fish welcome them inside.',
    'A golden sea turtle swims up to say hello.',
    'A giant shadow makes the water tremble.',
    'The whale needs help, and the friends listen carefully.',
    'Pickles finds the biggest piece of the mystery.',
    'Together, everyone frees the whale.',
    'The sea turtle shares a brave little secret.',
    'At moonrise, the friends promise to return.',
    'Goodnight, Levi, Lennon, Pickles, and the sea.',
  ];
  const spiderPages = [
    'In a magical kingdom, a pink tunnel glows softly.',
    'Princess Ghost Spider and her friends wake to adventure.',
    'Mario Spider-Man and Donkey hurry to join her.',
    'A rumble shakes the tunnel, but brave friends stay close.',
    'The friends make a plan and share their courage.',
    'A mysterious door waits behind the sparkling rocks.',
    'On the other side, the trees can talk.',
    'A grumbly roar echoes through the enchanted forest.',
    'The friends discover a monster who is scared and lonely.',
    'Princess Ghost Spider asks what is really wrong.',
    'Everyone works together, one small helpful step at a time.',
    'A happy ending blooms when kindness lights the way.',
    'This proof-of-concept can grow into a longer bedtime tale.',
    'Every page has a new color, sound, and surprise.',
    'The story reminds us that teamwork makes brave hearts bigger.',
    'And the friends wave goodnight from the Pink Spider Tunnel.',
  ];
  return Array.from({ length: ILLUSTRATION_STORY_PAGE_COUNT }, (_, index) => {
    const pageNumber = index + 1;
    const sheetIndex: 0 | 1 = index < 16 ? 0 : 1;
    const sheetPage = index % 16;
    const sourceNarration = sheetIndex === 0 ? leviPages[sheetPage] : spiderPages[sheetPage];
    return {
      id: `illustration-story-${storyId}-page-${String(pageNumber).padStart(2, '0')}`,
      pageNumber,
      sheetIndex,
      row: Math.floor(sheetPage / 4),
      column: sheetPage % 4,
      title: `Page ${String(pageNumber).padStart(2, '0')}`,
      narration: `${sourceNarration} ${prompt.toLowerCase().includes('child') ? '' : 'Turn the page.'}`.trim(),
      durationSeconds: ILLUSTRATION_STORY_PAGE_DURATION_SECONDS,
      transition: 'fade',
    };
  });
}

export type CreativeClassification = {
  kind: CreativeKind;
  confidence: 'high' | 'medium';
  title: string;
  missingDetails: CreativeMissingDetail[];
  requiresConfirmation: boolean;
  provider: CreativeProvider;
};

const CREATIVE_ACTION = /\b(?:make|create|write|draft|design|build|produce|generate|compose|plan|outline|turn|develop|package|prepare|render)\b/i;
const CREATIVE_OUTPUT = /\b(?:document|report|brief|memo|manifesto|deck|slides?|presentation|social|captions?|posts?|content\s+pack|image|visual|illustration|poster|artwork|music|song|track|beat|soundtrack|film|video|reel|series|episodes?|season|show)\b/i;

export function isCreativeProductionRequest(prompt: string): boolean {
  return CREATIVE_ACTION.test(prompt) && CREATIVE_OUTPUT.test(prompt);
}

const KIND_RULES: Array<{ kind: CreativeKind; pattern: RegExp }> = [
  { kind: 'episodic-series', pattern: /\b(?:episodic|episode|episodes|series|season|show|mini[-\s]?series)\b/i },
  { kind: 'pitch-deck', pattern: /\b(?:pitch\s*deck|deck|slides?|presentation|keynote|investor\s+presentation)\b/i },
  { kind: 'social-pack', pattern: /\b(?:social|instagram|linkedin|tiktok|threads?|x\s+post|tweets?|captions?|content\s+pack)\b/i },
  { kind: 'music', pattern: /\b(?:music|song|track|beat|soundtrack|soundscape|instrumental|score|audio)\b/i },
  { kind: 'film', pattern: /\b(?:film|video|reel|trailer|animation|animated|music\s+video|short\s+film|motion\s+piece)\b/i },
  { kind: 'image', pattern: /\b(?:image|visual|illustration|poster|cover|key\s+art|graphic|artwork|logo)\b/i },
  { kind: 'document', pattern: /\b(?:document|report|brief|manifesto|memo|whitepaper|copy|article|write|draft)\b/i },
];

const KIND_TITLES: Record<CreativeKind, string> = {
  document: 'Working document',
  'pitch-deck': 'Pitch deck',
  'social-pack': 'Social content pack',
  image: 'Visual concept',
  music: 'Original music signal',
  film: 'Single film',
  'episodic-series': 'Episodic series',
};

const CREATIVE_DETAIL_LABELS: Record<CreativeMissingDetail, string> = {
  audience: 'Audience',
  platform: 'Platform or channel',
  subject: 'Main subject',
  mood: 'Mood or sonic direction',
  format: 'Format or purpose',
  'episode-count': 'Episode count',
  purpose: 'Intent',
};

const CREATIVE_DETAIL_QUESTIONS: Record<CreativeMissingDetail, string> = {
  audience: 'Who is this for?',
  platform: 'Which platform or channel should this be built for?',
  subject: 'What is the main subject?',
  mood: 'What mood or sonic direction should it carry?',
  format: 'What format or purpose should this take?',
  'episode-count': 'How many episodes should the series have?',
  purpose: 'What should this help accomplish?',
};

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizedPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').slice(0, 1200);
}

function hasAny(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function missingDetailsFor(kind: CreativeKind, prompt: string): CreativeMissingDetail[] {
  const missing: CreativeMissingDetail[] = [];
  const text = prompt.toLowerCase();
  if (prompt.trim().length < 18) missing.push('purpose');
  if (kind === 'pitch-deck' && !hasAny(text, /\b(?:for|audience|investor|client|customer|team|founder|buyer)\b/i)) missing.push('audience');
  if (kind === 'social-pack' && !hasAny(text, /\b(?:instagram|linkedin|tiktok|threads?|x\b|twitter|platform|channels?)\b/i)) missing.push('platform');
  if ((kind === 'image' || kind === 'film' || kind === 'episodic-series') &&
      !hasAny(text, /\b(?:about|of|for|featuring|showing|portrait|product|brand|person|city|room|character)\b/i)) missing.push('subject');
  if (kind === 'music' && !hasAny(text, /\b(?:mood|sound|style|genre|energy|tempo|ambient|reggae|jazz|electronic|cinematic|calm|dark|bright)\b/i)) missing.push('mood');
  if (kind === 'episodic-series' && !hasAny(text, /\b(?:\d+\s+episodes?|episodes?|season|pilot|chapter)\b/i)) missing.push('episode-count');
  if (kind === 'document' && !hasAny(text, /\b(?:about|for|purpose|plan|brief|report|guide|strategy|memo)\b/i)) missing.push('format');
  return [...new Set(missing)];
}

export function classifyCreativeRequest(prompt: string): CreativeClassification {
  const clean = normalizedPrompt(prompt);
  const match = KIND_RULES.find(rule => rule.pattern.test(clean));
  const kind = match?.kind ?? 'document';
  const missingDetails = missingDetailsFor(kind, clean);
  return {
    kind,
    confidence: match ? 'high' : 'medium',
    title: KIND_TITLES[kind],
    missingDetails,
    requiresConfirmation: true,
    provider: kind === 'music'
      ? 'lyria'
      : kind === 'film'
        ? 'browser-film'
        : kind === 'image'
          ? 'local-concept'
          : kind === 'episodic-series'
            ? 'local-series-manifest'
            : 'local-draft',
  };
}

function missingCopy(details: CreativeMissingDetail[]): string {
  if (!details.length) return 'The brief is staged. Clear it when you are ready to start production.';
  return `Money Mite can start from this brief. One detail will sharpen the first pass: ${CREATIVE_DETAIL_LABELS[details[0]].toLowerCase()}.`;
}

export function creativeDetailLabel(detail: CreativeMissingDetail): string {
  return CREATIVE_DETAIL_LABELS[detail];
}

export function creativeDetailQuestion(detail: CreativeMissingDetail): string {
  return CREATIVE_DETAIL_QUESTIONS[detail];
}

/**
 * Fold one focused answer into the staged brief. This deliberately completes
 * only the first requested gap: the card should never turn into a long intake
 * form, and the caller still controls the separate production confirmation.
 */
export function captureCreativeDetail(
  artifact: CreativeArtifact,
  detail: CreativeMissingDetail,
  answer: string,
): CreativeArtifact {
  const cleanAnswer = normalizedPrompt(answer).slice(0, 280);
  const missingDetails = artifact.missingDetails ?? [];
  if (
    artifact.status !== 'draft'
    || artifact.followUpCompleted
    || missingDetails[0] !== detail
    || !cleanAnswer
  ) {
    return artifact;
  }

  const remainingDetails = missingDetails.slice(1);
  return {
    ...artifact,
    prompt: `${artifact.prompt}\n${CREATIVE_DETAIL_LABELS[detail]}: ${cleanAnswer}`,
    missingDetails: remainingDetails,
    followUpCompleted: true,
    confirmationCopy: remainingDetails.length
      ? 'Brief updated. The remaining open signals are optional; production still waits for your confirmation.'
      : missingCopy([]),
    metadata: {
      ...(artifact.metadata ?? {}),
      missingDetails: remainingDetails,
      capturedDetail: detail,
    },
  };
}

export function createCreativeDraft(prompt: string, createdAt = new Date().toISOString()): CreativeArtifact {
  const clean = normalizedPrompt(prompt);
  const classification = classifyCreativeRequest(clean);
  const illustrationStory = classification.kind === 'film' && isIllustrationStoryRequest(clean);
  const requestId = makeId('request');
  return {
    id: makeId('artifact'),
    requestId,
    kind: classification.kind,
    title: illustrationStory ? 'Illustration story film' : classification.title,
    prompt: clean,
    missingDetails: classification.missingDetails,
    followUpCompleted: classification.missingDetails.length === 0,
    status: 'draft',
    provider: illustrationStory ? 'premium-film' : classification.provider,
    providerLabel: illustrationStory
      ? 'Premium FAL story lane'
      : classification.provider === 'lyria'
      ? 'Lyria music lane'
      : classification.provider === 'browser-film'
        ? 'Free browser film lane'
        : classification.provider === 'local-series-manifest'
          ? 'Local series manifest'
          : classification.provider === 'local-concept'
            ? 'Local concept board'
            : 'Local editable draft',
    progress: 0,
    createdAt,
    requiresConfirmation: classification.requiresConfirmation,
    confirmationLabel: illustrationStory
      ? 'Start premium 32-page story film'
      : classification.kind === 'music'
      ? 'Confirm music generation'
      : classification.kind === 'film'
        ? 'Confirm free film render'
        : classification.kind === 'episodic-series'
          ? 'Create series manifest'
          : 'Create draft',
    confirmationCopy: missingCopy(classification.missingDetails),
    storyPages: illustrationStory ? createIllustrationStoryPages(clean, createdAt) : undefined,
    metadata: {
      confidence: classification.confidence,
      missingDetails: classification.missingDetails,
      ...(illustrationStory ? {
        production: 'illustration-story-premium',
        pageCount: ILLUSTRATION_STORY_PAGE_COUNT,
        pageDurationSeconds: ILLUSTRATION_STORY_PAGE_DURATION_SECONDS,
        soundtrack: 'Lyria instrumental anchor',
        narration: 'Gemini child-friendly narration',
        sourceAssets: '32 locked panel references from two immutable 4x4 illustration sheets',
        visualGeneration: 'one FAL image-to-video scene per page',
        delivery: 'server-side FFmpeg stitch and audio mux; persisted MP4 only',
      } : {}),
      deliveryBoundary: classification.kind === 'film' || classification.kind === 'music'
        ? 'This first pass uses the existing local/browser or Lyria seam. Premium or outbound delivery is never implicit.'
        : 'This first pass stays local and editable. Originals are never uploaded by this route.',
    },
  };
}

function episodeCountFor(prompt: string): number {
  const explicit = prompt.match(/\b(\d+)\s+episodes?\b/i);
  return Math.min(12, Math.max(3, explicit ? Number(explicit[1]) : 3));
}

export function createSeriesManifest(prompt: string, createdAt = new Date().toISOString()): CreativeSeriesManifest {
  const count = episodeCountFor(prompt);
  const seriesId = makeId('series');
  const titleSeed = prompt.split(/\r?\n/, 1)[0]?.trim().slice(0, 72);
  return {
    seriesId,
    title: titleSeed ? `Signal series · ${titleSeed}` : 'Signal series manifest',
    prompt,
    status: 'planned',
    finalAssemblyUrl: null,
    episodes: Array.from({ length: count }, (_, index) => ({
      id: `${seriesId}-episode-${index + 1}`,
      number: index + 1,
      title: `Episode ${String(index + 1).padStart(2, '0')}`,
      brief: `${prompt} — episode ${index + 1} of ${count}`,
      status: 'planned',
      progress: 0,
      scenes: Array.from({ length: 3 }, (_, sceneIndex) => ({
        id: `${seriesId}-episode-${index + 1}-scene-${sceneIndex + 1}`,
        title: `Scene ${sceneIndex + 1}`,
        brief: `Scene ${sceneIndex + 1} beats for episode ${index + 1}.`,
        status: 'planned',
        progress: 0,
         jobId: null,
        outputUrl: null,
        error: null,
      })),
      outputUrl: null,
      error: null,
    })),
  };
}

function episodeStatusFor(scenes: CreativeScene[]): CreativeEpisode['status'] {
  if (scenes.every(scene => scene.status === 'ready')) return 'ready';
  if (scenes.some(scene => scene.status === 'generating')) return 'generating';
  if (scenes.some(scene => scene.status === 'ready')) return 'partial';
  if (scenes.some(scene => scene.status === 'failed')) return 'failed';
  if (scenes.some(scene => scene.status === 'cancelled')) return 'cancelled';
  return 'planned';
}

export function refreshSeriesProgress(manifest: CreativeSeriesManifest): CreativeSeriesManifest {
  const episodes = manifest.episodes.map(episode => {
    const progress = episode.scenes.length
      ? Math.round(episode.scenes.reduce((sum, scene) => sum + scene.progress, 0) / episode.scenes.length)
      : 0;
    const status = episodeStatusFor(episode.scenes);
    return {
      ...episode,
      status,
      progress,
      error: status === 'failed'
        ? episode.scenes.find(scene => scene.error)?.error ?? 'One or more scenes failed.'
        : null,
    };
  });
  const hasGenerating = episodes.some(episode => episode.status === 'generating');
  const hasReady = episodes.some(episode => episode.status === 'ready' || episode.status === 'partial');
  const hasFailed = episodes.some(episode => episode.status === 'failed');
  const hasCancelled = episodes.some(episode => episode.status === 'cancelled');
  const allAssembled = episodes.length > 0 && episodes.every(episode => episode.status === 'ready' && episode.outputUrl);
  const status = manifest.status === 'assembling'
    ? 'assembling'
    : manifest.finalAssemblyUrl
      ? 'ready'
      : hasGenerating
        ? 'partial'
        : allAssembled
          ? 'partial'
          : hasFailed || hasCancelled || hasReady
            ? 'partial'
            : 'planned';
  return {
    ...manifest,
    episodes,
    status,
  };
}

const CREATIVE_ARTIFACT_STATUSES: CreativeArtifactStatus[] = [
  'draft',
  'queued',
  'generating',
  'ready',
  'failed',
  'cancelled',
  'partial',
];

const CREATIVE_SERIES_STATUSES: CreativeSeriesManifest['status'][] = [
  'planned',
  'assembling',
  'ready',
  'partial',
  'failed',
  'cancelled',
];

const CREATIVE_SCENE_STATUSES: CreativeScene['status'][] = [
  'planned',
  'generating',
  'ready',
  'failed',
  'cancelled',
];

const CREATIVE_EPISODE_STATUSES: CreativeEpisode['status'][] = [
  'planned',
  'generating',
  'ready',
  'failed',
  'cancelled',
  'partial',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteProgress(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isCreativeScene(value: unknown): value is CreativeScene {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.brief)
    && isOneOf(value.status, CREATIVE_SCENE_STATUSES)
    && isFiniteProgress(value.progress);
}

function isCreativeEpisode(value: unknown): value is CreativeEpisode {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && typeof value.number === 'number'
    && Number.isInteger(value.number)
    && value.number > 0
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.brief)
    && isOneOf(value.status, CREATIVE_EPISODE_STATUSES)
    && isFiniteProgress(value.progress)
    && Array.isArray(value.scenes)
    && value.scenes.length > 0
    && value.scenes.every(isCreativeScene);
}

function isCreativeSeriesManifest(value: unknown): value is CreativeSeriesManifest {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.seriesId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.prompt)
    && isOneOf(value.status, CREATIVE_SERIES_STATUSES)
    && Array.isArray(value.episodes)
    && value.episodes.length > 0
    && value.episodes.every(isCreativeEpisode);
}

export function isCreativeSeriesArtifact(value: unknown): value is CreativeArtifact {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.requestId)
    && value.kind === 'episodic-series'
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.prompt)
    && isNonEmptyString(value.createdAt)
    && !Number.isNaN(Date.parse(value.createdAt))
    && isOneOf(value.status, CREATIVE_ARTIFACT_STATUSES)
    && isFiniteProgress(value.progress)
    && isCreativeSeriesManifest(value.seriesManifest);
}

/**
 * Validate and normalize a persisted series before it reaches the production
 * card. Browser storage is user-editable and can contain partial writes from a
 * crashed tab, so callers must not cast JSON directly to CreativeArtifact.
 */
export function parseCreativeSeriesArtifact(value: unknown): CreativeArtifact | null {
  if (!isCreativeSeriesArtifact(value)) return null;
  const seriesManifest = value.seriesManifest;
  if (!seriesManifest) return null;
  return {
    ...value,
    seriesManifest: refreshSeriesProgress(seriesManifest),
  };
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function validSavedAt(value: unknown, now: number): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || now - timestamp > CREATIVE_SERIES_HISTORY_TTL_MS) return null;
  return new Date(timestamp).toISOString();
}

function historyEntriesFromUnknown(value: unknown, now: number): CreativeSeriesHistoryEntry[] {
  const rawEntries = Array.isArray(value)
    ? value
    : isRecord(value) && value.version === 1 && Array.isArray(value.entries)
      ? value.entries
      : [];
  const seenSeriesIds = new Set<string>();
  const entries: CreativeSeriesHistoryEntry[] = [];

  for (const rawEntry of rawEntries) {
    if (!isRecord(rawEntry)) continue;
    const artifact = parseCreativeSeriesArtifact(rawEntry.artifact);
    const savedAt = validSavedAt(rawEntry.savedAt, now);
    if (!artifact || !savedAt || seenSeriesIds.has(artifact.seriesManifest!.seriesId)) continue;
    seenSeriesIds.add(artifact.seriesManifest!.seriesId);
    entries.push({ artifact, savedAt });
  }

  return entries
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    .slice(0, CREATIVE_SERIES_HISTORY_MAX_ENTRIES);
}

export function loadCreativeSeriesHistory(
  storage?: Storage,
  now = Date.now(),
): CreativeSeriesHistoryEntry[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(CREATIVE_SERIES_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const entries = historyEntriesFromUnknown(parsed, now);
    // Rewrite the cleaned envelope so corrupt or expired records are skipped
    // permanently instead of being retried on every render.
    target.setItem(
      CREATIVE_SERIES_HISTORY_STORAGE_KEY,
      JSON.stringify({ version: 1, entries }),
    );
    return entries;
  } catch {
    return [];
  }
}

export function saveCreativeSeriesHistory(
  artifact: CreativeArtifact,
  storage?: Storage,
  savedAt = new Date().toISOString(),
): CreativeSeriesHistoryEntry[] {
  const target = getStorage(storage);
  const normalized = parseCreativeSeriesArtifact(artifact);
  if (!target || !normalized || Number.isNaN(Date.parse(savedAt))) {
    return target ? loadCreativeSeriesHistory(target) : [];
  }

  const existing = loadCreativeSeriesHistory(target);
  const next = [
    { artifact: normalized, savedAt: new Date(Date.parse(savedAt)).toISOString() },
    ...existing.filter(entry => entry.artifact.seriesManifest?.seriesId !== normalized.seriesManifest?.seriesId),
  ].slice(0, CREATIVE_SERIES_HISTORY_MAX_ENTRIES);

  try {
    target.setItem(
      CREATIVE_SERIES_HISTORY_STORAGE_KEY,
      JSON.stringify({ version: 1, entries: next }),
    );
    return next;
  } catch {
    return existing;
  }
}

export function updateSeriesScene(
  manifest: CreativeSeriesManifest,
  episodeId: string,
  sceneId: string,
  patch: Partial<CreativeScene>,
): CreativeSeriesManifest {
  const next = {
    ...manifest,
    episodes: manifest.episodes.map(episode => episode.id !== episodeId
      ? episode
      : {
          ...episode,
          scenes: episode.scenes.map(scene => scene.id === sceneId ? { ...scene, ...patch } : scene),
        }),
  };
  return refreshSeriesProgress(next);
}

export function createSeriesAssemblyDataUrl(
  manifest: CreativeSeriesManifest,
  scope: 'episode' | 'series' = 'series',
  episodeId?: string,
): string {
  const episodes = manifest.episodes
    .filter(episode => scope === 'series' || episode.id === episodeId)
    .map(episode => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      brief: episode.brief,
      outputUrl: episode.outputUrl ?? null,
      scenes: episode.scenes.map(scene => ({
        id: scene.id,
        title: scene.title,
        brief: scene.brief,
        outputUrl: scene.outputUrl ?? null,
      })),
    }));
  return createDataUrl(JSON.stringify({
    type: scope === 'series' ? 'surrogate-oracle-series' : 'surrogate-oracle-episode',
    title: manifest.title,
    prompt: manifest.prompt,
    seriesId: manifest.seriesId,
    episodes,
  }, null, 2), 'application/json;charset=utf-8');
}

export function createCreativeTextOutput(artifact: CreativeArtifact): string {
  const header = `${artifact.title.toUpperCase()}\n${'='.repeat(Math.min(48, Math.max(12, artifact.title.length)))}\n\n`;
  const footer = `\n\n---\nGenerated locally by Money Mite Creative Dispatch.\nBrief: ${artifact.prompt}\n`;
  if (artifact.kind === 'pitch-deck') {
    return `${header}SLIDE 01 — THE OPENING\nOne sharp sentence that makes the room lean in.\n\nSLIDE 02 — THE TENSION\nWhat changed, who feels it, and why now.\n\nSLIDE 03 — THE IDEA\nThe central creative move, expressed plainly.\n\nSLIDE 04 — THE PROOF\nEvidence, examples, or a first live signal.\n\nSLIDE 05 — THE ASK\nThe decision this deck is designed to unlock.${footer}`;
  }
  if (artifact.kind === 'social-pack') {
    return `${header}HOOK 01\nA line that earns the pause.\n\nCAPTION\nA concise post built from the brief, with room for the brand voice.\n\nSHORT FORM\nA tighter cut for a fast-moving feed.\n\nCTA\nInvite the audience to respond, save, or share.${footer}`;
  }
  return `${header}OBJECTIVE\nTurn the brief into a useful first draft without hiding what still needs a decision.\n\nCORE IDEA\n${artifact.prompt}\n\nWORKING STRUCTURE\n1. Context and tension\n2. Point of view\n3. Proof or texture\n4. Next action\n\nOPEN QUESTIONS\nUse the missing-detail notes in the dispatch card to sharpen the next pass.${footer}`;
}

export function createConceptSvgDataUrl(prompt: string): string {
  const safe = prompt.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character).slice(0, 120);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#050812"/><circle cx="600" cy="510" r="380" fill="url(#g)" opacity=".86"/><path d="M120 850h960" stroke="#00ffcc" opacity=".4"/><text x="120" y="940" fill="#d8fff2" font-family="monospace" font-size="34" letter-spacing="5">MONEY MITE / VISUAL CONCEPT</text><text x="120" y="1000" fill="#75ffd0" font-family="monospace" font-size="22">${safe}</text><defs><radialGradient id="g"><stop stop-color="#b026ff"/><stop offset=".55" stop-color="#006dff"/><stop offset="1" stop-color="#00ff88" stop-opacity="0"/></radialGradient></defs></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createDataUrl(content: string, mimeType = 'text/plain;charset=utf-8'): string {
  return `data:${mimeType},${encodeURIComponent(content)}`;
}