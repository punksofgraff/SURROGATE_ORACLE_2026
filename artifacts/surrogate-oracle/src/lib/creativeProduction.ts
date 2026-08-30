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

export type CreativeProvider =
  | 'local-draft'
  | 'local-concept'
  | 'local-series-manifest'
  | 'lyria'
  | 'browser-film'
  | 'premium-film';

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
};

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
  { kind: 'film', pattern: /\b(?:film|video|reel|trailer|music\s+video|short\s+film|motion\s+piece)\b/i },
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
  const labels: Record<CreativeMissingDetail, string> = {
    audience: 'who it is for',
    platform: 'which platform or channel',
    subject: 'the main subject',
    mood: 'the mood or sonic direction',
    format: 'the intended format or purpose',
    'episode-count': 'how many episodes',
    purpose: 'a little more intent',
  };
  return `Money Mite can start from this brief. For a sharper first pass, add ${details.map(detail => labels[detail]).join(', ')}.`;
}

export function createCreativeDraft(prompt: string, createdAt = new Date().toISOString()): CreativeArtifact {
  const clean = normalizedPrompt(prompt);
  const classification = classifyCreativeRequest(clean);
  const requestId = makeId('request');
  return {
    id: makeId('artifact'),
    requestId,
    kind: classification.kind,
    title: classification.title,
    prompt: clean,
    status: 'draft',
    provider: classification.provider,
    providerLabel: classification.provider === 'lyria'
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
    confirmationLabel: classification.kind === 'music'
      ? 'Confirm music generation'
      : classification.kind === 'film'
        ? 'Confirm free film render'
        : classification.kind === 'episodic-series'
          ? 'Create series manifest'
          : 'Create draft',
    confirmationCopy: missingCopy(classification.missingDetails),
    metadata: {
      confidence: classification.confidence,
      missingDetails: classification.missingDetails,
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
  return {
    seriesId,
    title: 'Signal series manifest',
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