import { useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  AudioLines,
  Check,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  History,
  Image as ImageIcon,
  LoaderCircle,
  OctagonX,
  Pause,
  Play,
  Layers3,
  PackageCheck,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  createIllustrationStoryReviewManifest,
  creativeDetailLabel,
  creativeDetailQuestion,
  type CreativeArtifact,
  type CreativeEpisode,
  type CreativeMissingDetail,
  type CreativeSeriesHistoryEntry,
  ILLUSTRATION_STORY_FAL_MODELS,
  ILLUSTRATION_STORY_POLLINATIONS_MODELS,
  type IllustrationStoryLane,
  type IllustrationStoryReviewAudioSource,
  type IllustrationStoryReviewHistoryEntry,
  type IllustrationStoryReviewManifest,
  type IllustrationStoryReviewRejection,
  type IllustrationStoryReviewState,
  type IllustrationStoryScene,
  type SeriesRenderMode,
} from '../lib/creativeProduction';
import IllustrationStoryOpenKitchen from './IllustrationStoryOpenKitchen';
import type { IllustrationStoryRecoveryPlan } from '../hooks/useIllustrationStoryFilm';
import './CreativeArtifactCard.css';

export type CreativeArtifactCardProps = {
  artifact: CreativeArtifact;
  onConfirm: () => void;
  onFollowUpSubmit?: (detail: CreativeMissingDetail, answer: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onClose: () => void;
  seriesRenderMode?: SeriesRenderMode;
  seriesIsRunning?: boolean;
  seriesRunningEpisodeId?: string | null;
  onSeriesModeChange?: (mode: SeriesRenderMode) => void;
  onSeriesEpisodeStart?: (episodeId: string, mode: SeriesRenderMode) => void;
  onSeriesPause?: () => void;
  onSeriesSceneRetry?: (episodeId: string, sceneId: string, mode: SeriesRenderMode) => void;
  onSeriesAssembleEpisode?: (episodeId: string) => void;
  onSeriesAssemble?: () => void;
  onStorySceneRetry?: (pageNumber: number) => void;
  onStorySceneReplace?: (pageNumber: number) => void;
  onStoryFilmRetry?: () => void;
  onStoryRecoveryConfirm?: (promptRewrite?: string) => void;
  onStoryLaneChange?: (lane: IllustrationStoryLane, modelSlug: string | null) => void;
  onStoryReviewApprove?: () => void;
  onStoryReviewReject?: (reason?: string, pageNumber?: number) => void;
  onStoryReviewStateChange?: (state: IllustrationStoryReviewState, pageNumber?: number) => void;
  savedSeriesCount?: number;
  onOpenSeriesHistory?: () => void;
};

type ArtifactStatus = CreativeArtifact['status'];

function statusLabel(status: ArtifactStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft signal';
    case 'queued':
      return 'In queue';
    case 'generating':
      return 'Generating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Signal failed';
    case 'cancelled':
      return 'Cancelled';
    case 'partial':
      return 'Partial signal';
    default:
      return 'Unknown state';
  }
}

function statusNote(status: ArtifactStatus): string {
  switch (status) {
    case 'draft':
      return 'awaiting clearance';
    case 'queued':
      return 'production lane assigned';
    case 'generating':
      return 'oracle is at work';
    case 'ready':
      return 'artifact assembled';
    case 'failed':
      return 'recovery available';
    case 'cancelled':
      return 'nothing was delivered';
    case 'partial':
      return 'some signal recovered';
    default:
      return 'state unavailable';
  }
}

function statusIcon(status: ArtifactStatus) {
  switch (status) {
    case 'draft':
      return <ShieldCheck size={15} aria-hidden="true" />;
    case 'queued':
      return <Clock3 size={15} aria-hidden="true" />;
    case 'generating':
      return <LoaderCircle size={15} aria-hidden="true" />;
    case 'ready':
      return <Check size={15} aria-hidden="true" />;
    case 'failed':
      return <AlertTriangle size={15} aria-hidden="true" />;
    case 'cancelled':
      return <OctagonX size={15} aria-hidden="true" />;
    case 'partial':
      return <Sparkles size={15} aria-hidden="true" />;
    default:
      return <FileText size={15} aria-hidden="true" />;
  }
}

function StoryPizzaTracker({
  artifact,
  scenes,
}: {
  artifact: CreativeArtifact;
  scenes: IllustrationStoryScene[];
}) {
  const references = scenes.filter(scene => Boolean(scene.referenceUrl)).length;
  const rendered = scenes.filter(scene => scene.status === 'ready').length;
  const animated = scenes.filter(scene => (
    scene.status === 'ready' && scene.motionEvidence?.status === 'passed'
  )).length;
  const unprovenMotion = rendered - animated;
  const blocked = scenes.filter(scene => scene.failureKind === 'provider-safety').length;
  const failed = scenes.filter(scene => scene.status === 'failed' && scene.failureKind !== 'provider-safety').length;
  const pending = scenes.filter(scene => ['planned', 'queued', 'generating'].includes(scene.status)).length;
  const trackerMetadata = artifact.metadata as Record<string, unknown> | undefined;
  const legacyReadOnly = trackerMetadata?.legacyReadOnly === true
    || trackerMetadata?.workflowMode === 'legacy-per-scene-readonly';
  const h3ChunkWorkflow = trackerMetadata?.workflowMode === 'ten-h3-chunks';
  const singleWorkflow = trackerMetadata?.workflowMode === 'single-fal-workflow'
    || h3ChunkWorkflow
    || legacyReadOnly;
  const h3Chunks = Array.isArray(trackerMetadata?.chunks)
    ? trackerMetadata.chunks as Array<{ status?: string }>
    : [];
  const readyH3Chunks = h3Chunks.filter(chunk => chunk.status === 'ready').length;
  const blockedReason = typeof (artifact.metadata as Record<string, unknown> | undefined)?.blockedReason === 'string'
    ? String((artifact.metadata as Record<string, unknown>).blockedReason)
    : '';
  const stitching = artifact.status === 'generating'
    && scenes.length === 32
    && animated === 32;
  const ready = Boolean(artifact.outputUrl) && ['ready', 'partial'].includes(artifact.status);
  const audioGateFailed = ['audio-gate', 'gemini-audio'].includes(String(artifact.metadata?.storyFailureKind));
  const steps = [
    { key: 'brief', label: 'Brief', value: 'cleared', complete: artifact.status !== 'draft', active: artifact.status === 'draft' },
    { key: 'refs', label: 'Locked slices', value: `${references}/32`, complete: references === 32, active: references > 0 && references < 32 },
    {
      key: 'bake',
       label: 'Visual motion',
       value: blocked
         ? `${animated}/32 · ${blocked} blocked`
         : `${animated}/32${unprovenMotion ? ` · ${unprovenMotion} unproven` : pending ? ` · ${pending} in progress` : ''}`,
      complete: animated === 32,
      active: references === 32 && animated < 32 && pending > 0,
    },
    {
      key: 'finish',
      label: 'Stitch + audio',
      value: ready ? 'served' : stitching ? 'baking' : audioGateFailed ? 'audio check' : blocked || failed ? 'recover' : 'next',
      complete: ready,
      active: stitching,
    },
  ];
  const progress = Math.round((references + animated + (ready ? 32 : 0)) / 96 * 100);

  return (
    <section className="creative-pizza-tracker" aria-label="Story production stages" aria-live="polite">
      <div className="creative-pizza-tracker__header">
        <div>
          <span className="creative-pizza-tracker__eyebrow">Production / live ledger</span>
          <strong>
            {ready
               ? 'Provider coverage and local audio checks passed.'
               : unprovenMotion
                 ? `${unprovenMotion} rendered slice${unprovenMotion === 1 ? '' : 's'} lack verified subject motion.`
               : blocked
                ? `${blocked} slice${blocked === 1 ? '' : 's'} blocked by provider safety review.`
                : failed
                  ? `${failed} slice${failed === 1 ? '' : 's'} needs a retry.`
                    : h3ChunkWorkflow
                      ? `Ten H3 chunk jobs are being checked in order (${readyH3Chunks}/10 ready).`
                      : singleWorkflow
                        ? 'One FAL workflow job is being checked against the panel ledger.'
                      : 'Server evidence is being read.'}
          </strong>
        </div>
      <Layers3 className="creative-pizza-tracker__pie" size={22} aria-hidden="true" />
      </div>
      <div className="creative-pizza-tracker__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Story production progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol className="creative-pizza-tracker__steps">
        {steps.map(step => (
          <li key={step.key} data-complete={step.complete || undefined} data-active={step.active || undefined}>
            <span className="creative-pizza-tracker__dot" aria-hidden="true">{step.complete ? '✓' : step.active ? '•' : '○'}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.value}</small>
            </span>
          </li>
        ))}
      </ol>
      <p className="creative-pizza-tracker__note">
        {ready
           ? 'MP4 is persisted and ready for human watch/listen review.'
          : blocked
             ? singleWorkflow
               ? blockedReason || (h3ChunkWorkflow
                 ? 'The ten H3 chunk requests did not complete. No per-page retry is available.'
                 : 'The single workflow did not provide a provable panel certificate. No per-page retry is available.')
               : 'Blocked pages are recoverable one at a time. Retry the page or use a safe replacement; completed slices stay saved.'
            : failed
              ? 'Retry only the affected page below. Completed slices stay saved.'
              : pending
                 ? `${pending} page${pending === 1 ? '' : 's'} still in visual production.`
             : singleWorkflow
               ? h3ChunkWorkflow
                 ? 'The ten submitted composite images establish request order; cell-level visual coverage still requires watch-and-listen review.'
                 : 'The workflow ledger is authoritative; percentages do not prove panel coverage.'
               : 'Live state from the server job — no placeholder percentages.'}
      </p>
    </section>
  );
}

function StoryReviewWorkspace({
  artifact,
  pages,
  scenes,
  progress,
  outputUrl,
  requiresReview,
  audioGateFailed,
  onSceneRetry,
  onSceneReplace,
  onFilmRetry,
  onApprove,
  onReject,
}: {
  artifact: CreativeArtifact;
  pages: NonNullable<CreativeArtifact['storyPages']>;
  scenes: IllustrationStoryScene[];
  progress: number;
  outputUrl?: string | null;
  requiresReview: boolean;
  audioGateFailed: boolean;
  onSceneRetry?: (pageNumber: number) => void;
  onSceneReplace?: (pageNumber: number) => void;
  onFilmRetry?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const readyScenes = scenes.filter(scene => scene.status === 'ready').length;
  const sourceAsset = pages.find(page => Boolean(page.sourceAsset))?.sourceAsset;
  const metadata = artifact.metadata as Record<string, unknown> | undefined;
  const legacyReadOnly = metadata?.legacyReadOnly === true
    || metadata?.workflowMode === 'legacy-per-scene-readonly';
  const h3ChunkWorkflow = metadata?.workflowMode === 'ten-h3-chunks';
  const singleWorkflow = metadata?.workflowMode === 'single-fal-workflow'
    || h3ChunkWorkflow
    || legacyReadOnly;
  const blockedReason = typeof metadata?.blockedReason === 'string' ? metadata.blockedReason : '';
  const coverageCertificate = metadata?.coverageCertificate;
  const audioGate = metadata?.audioGate as Record<string, unknown> | undefined;
  const audioPassed = audioGate?.passed === true;
  const audioVerified = audioGate?.verified === true;
  const audioState = audioPassed ? 'validated' : audioVerified ? 'checked · needs attention' : 'not surfaced';
  const narrationCuePages = pages.filter(page => Boolean(page.voiceover?.length)).length;
  const soundCuePages = pages.filter(page => Boolean((page.soundEffects ?? page.sfx)?.length)).length;
  const stage = formatMetadataValue(metadata?.storyStage ?? 'panel plan ready');
  const evidenceState = outputUrl ? 'rendered evidence available' : 'rendered evidence pending';
  const studioReview = metadata?.studioReview as { status?: string } | undefined;
  const reviewGateLabel = studioReview?.status === 'approved'
    ? 'Review cleared'
    : outputUrl
      ? 'Review gate open'
      : 'Awaiting render';
  const reviewGateClass = studioReview?.status === 'approved'
    ? ' is-cleared'
    : requiresReview
      ? ' is-open'
      : '';

  return (
    <section
      className="creative-story-review-workspace"
      aria-label="Illustration story review workspace"
      data-testid="story-review-workspace"
    >
      <div className="creative-story-review-workspace__header">
        <div>
          <span className="creative-story-review-workspace__kicker">
            <ScanLine size={14} aria-hidden="true" />
            SURROGATE:ORACLE / STORY REVIEW
          </span>
          <h3>Open kitchen review</h3>
          <p>Source artwork, motion evidence, shot direction, and sound provenance in one calm pass.</p>
        </div>
        <div className="creative-story-review-workspace__header-meta">
          <span className="creative-story-review-workspace__stage">{stage}</span>
          <span className={`creative-story-review-workspace__gate${reviewGateClass}`}>
            {reviewGateLabel}
          </span>
        </div>
      </div>

      <div className="creative-story-review-workspace__evidence">
        <article className="creative-story-evidence-card creative-story-evidence-card--source">
          <div className="creative-story-evidence-card__topline">
            <span><ImageIcon size={14} aria-hidden="true" /> Source artwork</span>
            <small>Original / locked</small>
          </div>
          <div className="creative-story-source-frame">
            {sourceAsset ? (
              <img src={sourceAsset} alt="Original illustration source sheet" data-testid="img-story-source-artwork" />
            ) : (
              <div className="creative-story-source-frame__empty">
                <ImageIcon size={22} aria-hidden="true" />
                <span>Source artwork is not surfaced yet.</span>
              </div>
            )}
            <span className="creative-story-source-frame__badge">REFERENCE ONLY</span>
          </div>
          <p>Compare the rendered motion against the original panel language. The source image is never replaced by the render.</p>
        </article>

        <article className="creative-story-evidence-card creative-story-evidence-card--render">
          <div className="creative-story-evidence-card__topline">
            <span><FileVideo size={14} aria-hidden="true" /> Rendered evidence</span>
            <small>{evidenceState}</small>
          </div>
          <div className="creative-story-render-frame">
            {outputUrl ? (
              <>
                <video
                  src={outputUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Rendered story film evidence"
                  data-testid="video-story-render-evidence"
                />
              </>
            ) : (
              <div className="creative-story-render-frame__empty">
                <FileVideo size={24} aria-hidden="true" />
                <strong>Rendered film not available</strong>
                <span>Playback evidence will appear here when the assembled output is returned.</span>
              </div>
            )}
          </div>
          <div className="creative-story-evidence-card__meta">
            <span>{pages.length} panels</span>
            <span>{Math.round(pages.reduce((sum, page) => sum + page.durationSeconds, 0))} sec planned</span>
            <span>{artifact.providerLabel}</span>
          </div>
        </article>
      </div>

      <div className="creative-story-review-workspace__signals">
        <div className="creative-story-signal">
          <span className="creative-story-signal__icon"><Layers3 size={15} aria-hidden="true" /></span>
           <span><strong>Panel continuity</strong><small>{h3ChunkWorkflow
             ? `${Array.isArray(metadata?.chunks) ? metadata.chunks.filter((chunk: { status?: string }) => chunk.status === 'ready').length : 0}/10 composite H3 chunks returned; cell-level coverage requires human review`
             : singleWorkflow
               ? (coverageCertificate ? '32/32 ranges certified against source hashes' : '32 ranges awaiting a machine-checkable certificate')
             : `${readyScenes}/${pages.length} rendered from locked references`}</small></span>
        </div>
        <div className="creative-story-signal">
          <span className="creative-story-signal__icon"><Eye size={15} aria-hidden="true" /></span>
          <span><strong>Shot direction</strong><small>Per-panel treatment and camera beats are available in the source plan</small></span>
        </div>
        <div className={`creative-story-signal${audioGateFailed ? ' is-alert' : ''}`}>
          <span className="creative-story-signal__icon"><AudioLines size={15} aria-hidden="true" /></span>
          <span><strong>Sound provenance</strong><small>{audioGateFailed ? 'Audio gate reported a failure' : `${narrationCuePages}/${pages.length} narration cue sets · ${soundCuePages}/${pages.length} SFX cue sets · ${audioState}`}</small></span>
        </div>
      </div>

      <div className="creative-story-direction">
        <div className="creative-story-direction__header">
          <div>
            <span className="creative-story-panel-map__label"><ScanLine size={12} aria-hidden="true" /> Shot direction</span>
            <strong>Per-panel treatments attached to the review</strong>
          </div>
          <span>{pages.length} direction plans</span>
        </div>
        <div className="creative-story-direction__grid">
          {pages.map(page => {
            const shotPlan = page.shotPlan;
            return (
              <div className="creative-story-direction__row" key={page.id}>
                <span className="creative-story-direction__page">P{String(page.pageNumber).padStart(2, '0')}</span>
                {shotPlan ? (
                  <>
                    <span className="creative-story-direction__treatment">
                      <strong>{shotPlan.treatment.replaceAll('-', ' ')}</strong>
                      <small>{shotPlan.cameraMove}</small>
                    </span>
                    <span className="creative-story-direction__cue">{shotPlan.soundCue} · {shotPlan.performanceCue.replaceAll('-', ' ')}</span>
                  </>
                ) : (
                  <span className="creative-story-direction__unavailable">Direction plan not surfaced for this panel.</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="creative-story-panel-map">
        <div className="creative-story-panel-map__header">
          <div>
            <span className="creative-story-panel-map__label">Panel map</span>
            <strong>{pages.length} locked moments</strong>
          </div>
          <span className="creative-story-panel-map__count">{readyScenes}/{pages.length} rendered · {progress}% job signal</span>
        </div>
        <div className="creative-story-panel-map__grid" aria-label="Story panel statuses">
          {pages.map(page => {
            const scene = scenes.find(item => item.pageNumber === page.pageNumber);
            const state = scene?.status ?? 'planned';
            const canRecover = ['failed', 'cancelled'].includes(state);
            return (
              <div
                className="creative-story-panel-map__cell"
                data-state={state}
                key={page.id}
                title={`${page.title}: ${page.narration}${scene?.error ? ` — ${scene.error}` : ''}`}
                data-testid={`story-panel-${page.pageNumber}`}
              >
                <span>{String(page.pageNumber).padStart(2, '0')}</span>
                <i aria-hidden="true" />
                {canRecover && (
                  <div className="creative-story-panel-map__cell-actions">
                    {onSceneRetry && !singleWorkflow && (
                      <button
                        type="button"
                        onClick={() => onSceneRetry(page.pageNumber)}
                        aria-label={`Retry story page ${page.pageNumber}`}
                        data-testid={`button-retry-story-page-${page.pageNumber}`}
                      >
                        <RefreshCw size={11} aria-hidden="true" />
                      </button>
                    )}
                    {scene?.failureKind === 'provider-safety' && onSceneReplace && !singleWorkflow && (
                      <button
                        type="button"
                        onClick={() => onSceneReplace(page.pageNumber)}
                        aria-label={`Use a safe replacement for story page ${page.pageNumber}`}
                        data-testid={`button-replace-story-page-${page.pageNumber}`}
                      >
                        <CircleAlert size={11} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {scenes.some(scene => scene.failureKind === 'provider-safety') && (
        <div className="creative-story-review-workspace__notice creative-story-review-workspace__notice--recovery" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>Provider safety block · page-level recovery</strong>
            <p>Only the affected illustration was blocked. Completed pages, narration, soundtrack, and the original source remain available.</p>
            <div className="creative-story-review-workspace__recovery-list">
              {scenes.filter(scene => scene.failureKind === 'provider-safety').map(scene => (
                <div key={scene.pageNumber}>
                  <span>Page {String(scene.pageNumber).padStart(2, '0')}{scene.error ? ` · ${scene.error}` : ''}</span>
                  <span>
                    {onSceneRetry && !singleWorkflow && (
                      <button
                        type="button"
                        onClick={() => onSceneRetry(scene.pageNumber)}
                        data-testid={`button-retry-story-page-recovery-${scene.pageNumber}`}
                      >
                        Retry page
                      </button>
                    )}
                    {onSceneReplace && !singleWorkflow && (
                      <button
                        type="button"
                        onClick={() => onSceneReplace(scene.pageNumber)}
                        data-testid={`button-replace-story-page-recovery-${scene.pageNumber}`}
                      >
                        Safe replacement
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {singleWorkflow && blockedReason && (
        <div className="creative-story-review-workspace__notice creative-story-review-workspace__notice--recovery" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>Single-job workflow blocked</strong>
            <p>{blockedReason}</p>
            <p>No direct H3 request or per-page retry was submitted.</p>
          </div>
        </div>
      )}

      {legacyReadOnly && (
        <div className="creative-story-review-workspace__notice creative-story-review-workspace__notice--recovery" role="status">
          <History size={16} aria-hidden="true" />
          <div>
            <strong>Historical per-scene record · read-only</strong>
            <p>This story is retained for review and accounting only. No new page submission, retry, replacement, or provider polling will be started from the current UI.</p>
          </div>
        </div>
      )}

      {audioGateFailed && (
        <div className="creative-story-review-workspace__notice creative-story-review-workspace__notice--audio" role="alert">
          <AudioLines size={16} aria-hidden="true" />
          <div>
            <strong>Audio gate needs attention · pages remain saved</strong>
            <p>The narration, soundtrack, and final audio validation did not pass. Retry the stitch without regenerating successful pages.</p>
            {onFilmRetry && <button type="button" onClick={onFilmRetry}><RefreshCw size={12} aria-hidden="true" /> Retry stitch + audio gate</button>}
          </div>
        </div>
      )}

      {requiresReview && (
        <div className="creative-story-review-gate" role="group" aria-label="Studio episode review gate">
          <div className="creative-story-review-gate__copy">
            <span className="creative-story-review-gate__eyebrow"><Eye size={14} aria-hidden="true" /> Human review gate</span>
            <strong>Watch the render. Listen for the provenance.</strong>
            <p>Approve only after the source artwork stays intact, the shot actions read on screen, and narration, character voices, music, and cues remain intelligible.</p>
          </div>
          <div className="creative-story-review-gate__actions">
            <button
              type="button"
              className="creative-artifact-card__button creative-artifact-card__button--primary"
              onClick={onApprove}
              disabled={!onApprove}
              data-testid="button-approve-story-review"
            >
              <Check size={14} aria-hidden="true" />
              Approve after review
            </button>
            <button
              type="button"
              className="creative-artifact-card__button"
              onClick={onReject}
              disabled={!onReject}
              data-testid="button-reject-story-review"
            >
              <X size={14} aria-hidden="true" />
              Send back as unreviewed
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function kindIcon(kind: unknown) {
  const value = String(kind ?? '').toLowerCase();
  if (value.includes('image') || value.includes('visual')) return <FileImage size={14} aria-hidden="true" />;
  if (value.includes('video') || value.includes('film')) return <FileVideo size={14} aria-hidden="true" />;
  if (value.includes('audio') || value.includes('sound') || value.includes('music')) return <FileAudio size={14} aria-hidden="true" />;
  return <FileText size={14} aria-hidden="true" />;
}

function formatCreatedAt(value: unknown): string {
  if (!value) return 'time unavailable';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function historyStatusLabel(entry: CreativeSeriesHistoryEntry): string {
  const status = entry.artifact.status;
  if (status === 'ready') return 'Ready';
  if (status === 'partial') return 'Partial';
  if (status === 'generating' || status === 'queued') return 'In production';
  if (status === 'failed') return 'Needs retry';
  if (status === 'cancelled') return 'Paused';
  return statusLabel(status);
}

export function CreativeSeriesHistoryShelf({
  entries,
  activeSeriesId,
  onOpen,
  onClose,
}: {
  entries: CreativeSeriesHistoryEntry[];
  activeSeriesId?: string | null;
  onOpen: (entry: CreativeSeriesHistoryEntry) => void;
  onClose: () => void;
}) {
  return (
    <div className="creative-series-history-overlay" role="dialog" aria-modal="true" aria-labelledby="creative-series-history-title">
      <div className="creative-series-history">
        <header className="creative-series-history__header">
          <div>
            <span className="creative-series-history__eyebrow"><History size={15} aria-hidden="true" /> PRODUCTION HISTORY</span>
            <h2 id="creative-series-history-title">Saved series</h2>
            <p>Reopen any saved manifest. Other series stay safely on the shelf.</p>
          </div>
          <button type="button" className="creative-series-history__close" onClick={onClose} aria-label="Close production history">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {entries.length === 0 ? (
          <div className="creative-series-history__empty">
            <History size={28} aria-hidden="true" />
            <strong>NO SERIES SAVED YET</strong>
            <span>Confirmed episodic productions will appear here while their scene work is in progress.</span>
          </div>
        ) : (
          <div className="creative-series-history__list">
            {entries.map((entry) => {
              const manifest = entry.artifact.seriesManifest;
              if (!manifest) return null;
              const progress = Math.max(0, Math.min(100, Number(entry.artifact.progress) || 0));
              const isActive = manifest.seriesId === activeSeriesId;
              return (
                <button
                  type="button"
                  className={`creative-series-history__entry${isActive ? ' is-active' : ''}`}
                  key={manifest.seriesId}
                  onClick={() => onOpen(entry)}
                >
                  <span className="creative-series-history__entry-icon"><Layers3 size={17} aria-hidden="true" /></span>
                  <span className="creative-series-history__entry-copy">
                    <strong>{manifest.title}</strong>
                    <small>{manifest.episodes.length} episodes · {progress}% complete · {historyStatusLabel(entry)}</small>
                    <small>Last known {formatCreatedAt(entry.savedAt)}</small>
                  </span>
                  <span className="creative-series-history__entry-arrow">{isActive ? 'OPEN' : 'REOPEN'} <span aria-hidden="true">›</span></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'unreadable';
  }
}

function outputKind(kind: unknown): 'image' | 'video' | 'audio' | 'generic' {
  const value = String(kind ?? '').toLowerCase();
  if (value.includes('image') || value.includes('visual')) return 'image';
  if (value.includes('video') || value.includes('film')) return 'video';
  if (value.includes('audio') || value.includes('sound') || value.includes('music')) return 'audio';
  return 'generic';
}

function seriesEpisodeLabel(episode: CreativeEpisode): string {
  if (episode.status === 'ready') return 'Ready';
  if (episode.status === 'generating') return 'Rendering';
  if (episode.status === 'partial') return 'Partial';
  if (episode.status === 'failed') return 'Needs retry';
  if (episode.status === 'cancelled') return 'Paused';
  return 'Planned';
}

export function CreativeArtifactCard({
  artifact,
  onConfirm,
  onFollowUpSubmit,
  onCancel,
  onRetry,
  onDownload,
  onPreview,
  onClose,
  seriesRenderMode = 'local',
  seriesIsRunning = false,
  seriesRunningEpisodeId = null,
  onSeriesModeChange,
  onSeriesEpisodeStart,
  onSeriesPause,
  onSeriesSceneRetry,
  onSeriesAssembleEpisode,
  onSeriesAssemble,
  onStorySceneRetry,
  onStorySceneReplace,
  onStoryFilmRetry,
  onStoryRecoveryConfirm,
  onStoryLaneChange,
  onStoryReviewApprove,
  onStoryReviewReject,
  onStoryReviewStateChange,
  savedSeriesCount = 0,
  onOpenSeriesHistory,
}: CreativeArtifactCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  const status = artifact.status;
  const progress = Math.max(0, Math.min(100, Number(artifact.progress) || 0));
  const outputUrl = artifact.outputUrl;
  const metadataRecord = artifact.metadata as Record<string, unknown> | undefined;
  const missingDetails = artifact.missingDetails ?? [];
  const hasOutput = Boolean(outputUrl);
  const hasMetadata = Boolean(metadataRecord && Object.keys(metadataRecord).length);
  const series = artifact.seriesManifest;
  const storyPages = artifact.storyPages ?? [];
  const storyReadOnly = metadataRecord?.legacyReadOnly === true
    || metadataRecord?.workflowMode === 'single-fal-workflow'
    || metadataRecord?.workflowMode === 'legacy-per-scene-readonly';
  const isIllustrationStory = ['illustration-story-studio', 'illustration-story-premium', 'illustration-story-proof'].includes(
    String(artifact.metadata?.production),
  );
  const storyScenes: IllustrationStoryScene[] = Array.isArray(metadataRecord?.storyScenes)
    ? metadataRecord.storyScenes as IllustrationStoryScene[]
    : storyPages.map(page => ({
      pageNumber: page.pageNumber,
      sheetIndex: page.sheetIndex,
      row: page.row,
      column: page.column,
      durationSeconds: page.durationSeconds,
      seed: page.pageNumber,
      referenceUrl: page.sourceAsset,
      status: page.status,
      progress: page.progress,
      error: page.error,
    } as IllustrationStoryScene));
  const storedReviewManifest = artifact.reviewManifest
    ?? (metadataRecord?.reviewManifest as IllustrationStoryReviewManifest | undefined);
  const storyAudioSources = storedReviewManifest?.audioSources
    ?? (Array.isArray(metadataRecord?.audioManifest)
      ? metadataRecord.audioManifest as IllustrationStoryReviewAudioSource[]
      : []);
  const storyReviewManifest = storyPages.length > 0
    ? (() => {
      const freshManifest = createIllustrationStoryReviewManifest(
        storyPages,
        storyScenes,
        outputUrl ?? null,
        storyAudioSources,
        storedReviewManifest?.createdAt ?? artifact.createdAt,
      );
      return {
        ...freshManifest,
        ...(storedReviewManifest?.review ? { review: storedReviewManifest.review } : {}),
        ...(storedReviewManifest?.rejections
          ? { rejections: storedReviewManifest.rejections }
          : Array.isArray(metadataRecord?.reviewRejections)
            ? { rejections: metadataRecord.reviewRejections as IllustrationStoryReviewRejection[] }
            : {}),
        ...(storedReviewManifest?.reviewHistory
          ? { reviewHistory: storedReviewManifest.reviewHistory }
          : Array.isArray(metadataRecord?.reviewHistory)
            ? { reviewHistory: metadataRecord.reviewHistory as IllustrationStoryReviewHistoryEntry[] }
            : {}),
      };
    })()
    : null;
  const hasStoryReviewSurface = isIllustrationStory && storyPages.length > 0;
  const isSeries = Boolean(series);
  const isDraft = status === 'draft';
  const followUpDetail = isDraft && !artifact.followUpCompleted ? missingDetails[0] : undefined;
  const isWorking = status === 'queued' || status === 'generating';
  const isRecoverable = status === 'failed' || status === 'cancelled' || status === 'partial';
  const storyFailureKind = metadataRecord?.storyFailureKind;
  const storyRecovery = metadataRecord?.storyRecovery as IllustrationStoryRecoveryPlan | null | undefined;
  const studioReview = metadataRecord?.studioReview as { status?: string; reviewedAt?: string } | undefined;
  const requiresStudioReview = isIllustrationStory
    && hasOutput
    && studioReview?.status !== 'approved';
  const storyHasScenes = isIllustrationStory && storyScenes.length > 0;
  const storyAudioGateFailed = storyHasScenes
    && (storyFailureKind === 'audio-gate' || storyFailureKind === 'gemini-audio');
  const canCancel = isDraft || isWorking;
  const canRetry = isRecoverable && !isSeries && !storyHasScenes;
  const canOutput = !isSeries && (status === 'ready' || status === 'partial') && hasOutput;
  const previewType = outputKind(artifact.kind);
  const metadataEntries = hasMetadata
    ? Object.entries(metadataRecord ?? {}).slice(0, 4)
    : [];
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const initialStoryLane: IllustrationStoryLane = metadataRecord?.storyLane === 'fal'
    ? 'fal'
    : metadataRecord?.storyLane === 'minimax'
      ? 'minimax'
      : metadataRecord?.storyLane === 'pollinations'
        ? 'pollinations'
        : 'local';
  const initialStoryModel = initialStoryLane === 'fal'
    ? (typeof metadataRecord?.falModelSlug === 'string'
      ? metadataRecord.falModelSlug
      : ILLUSTRATION_STORY_FAL_MODELS[0]?.slug ?? null)
    : initialStoryLane === 'pollinations'
      ? (typeof metadataRecord?.pollinationsModelSlug === 'string'
        ? metadataRecord.pollinationsModelSlug
        : ILLUSTRATION_STORY_POLLINATIONS_MODELS[0]?.slug ?? null)
      : null;
  const [storyLane, setStoryLane] = useState<IllustrationStoryLane>(initialStoryLane);
  const [storyModelSlug, setStoryModelSlug] = useState<string | null>(initialStoryModel);
  const models = ILLUSTRATION_STORY_FAL_MODELS;

  useEffect(() => {
    setStoryLane(initialStoryLane);
    setStoryModelSlug(initialStoryModel);
  }, [artifact.id, initialStoryLane, initialStoryModel]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    setFollowUpAnswer('');
  }, [artifact.id, followUpDetail]);

  const submitFollowUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!followUpDetail || !followUpAnswer.trim()) return;
    onFollowUpSubmit?.(followUpDetail, followUpAnswer.trim());
    setFollowUpAnswer('');
  };

  const chooseStoryLane = (lane: IllustrationStoryLane, modelSlug: string | null) => {
    setStoryLane(lane);
    setStoryModelSlug(modelSlug);
    onStoryLaneChange?.(lane, modelSlug);
  };

  const renderOutput = () => {
    if (!canOutput || !outputUrl) return null;
    if (previewType === 'image') {
      return (
        <div className="creative-artifact-card__preview">
          <img src={outputUrl} alt={artifact.outputLabel ?? `Preview of ${artifact.title}`} />
        </div>
      );
    }
    if (previewType === 'video') {
      return (
        <div className="creative-artifact-card__preview">
          <video src={outputUrl} controls playsInline preload="metadata" />
        </div>
      );
    }
    if (previewType === 'audio') {
      return (
        <div className="creative-artifact-card__preview creative-artifact-card__preview--audio">
          <FileAudio size={24} aria-hidden="true" />
          <span className="creative-artifact-card__preview-label">{artifact.outputLabel ?? 'Audio signal ready'}</span>
          <audio src={outputUrl} controls preload="metadata" />
        </div>
      );
    }
    return (
      <div className="creative-artifact-card__preview creative-artifact-card__preview--generic">
        <FileText size={24} aria-hidden="true" />
        <span className="creative-artifact-card__preview-label">{artifact.outputLabel ?? 'Artifact signal ready'}</span>
        <span className="creative-artifact-card__preview-subline">Use preview to open the full creative output.</span>
      </div>
    );
  };

  const renderSeries = () => {
    if (!series) return null;
    const assembledEpisodes = series.episodes.filter(episode => Boolean(episode.outputUrl)).length;
    const readyScenes = series.episodes.reduce(
      (sum, episode) => sum + episode.scenes.filter(scene => scene.status === 'ready').length,
      0,
    );
    const totalScenes = series.episodes.reduce((sum, episode) => sum + episode.scenes.length, 0);
    const canAssembleSeries = series.episodes.length > 0
      && series.episodes.every(episode => episode.status === 'ready' && episode.outputUrl)
      && !series.finalAssemblyUrl;

    return (
      <div className="creative-series" aria-label="Series production dashboard">
        <div className="creative-series__heading">
          <div>
            <span className="creative-artifact-card__output-label">Series production board</span>
            <div className="creative-series__summary">
              <Layers3 size={15} aria-hidden="true" />
              <strong>{assembledEpisodes}/{series.episodes.length} episodes assembled</strong>
              <span>{readyScenes}/{totalScenes} scenes ready</span>
            </div>
          </div>
          <span className={`creative-series__manifest-status creative-series__manifest-status--${series.status}`}>
            {series.status === 'assembling' ? 'Assembling' : series.status}
          </span>
        </div>
        {savedSeriesCount > 0 && (
          <button
            type="button"
            className="creative-series__history-button"
            onClick={onOpenSeriesHistory}
          >
            <History size={13} aria-hidden="true" />
            HISTORY · {savedSeriesCount}
          </button>
        )}

        <div className="creative-series__toolbar">
          <div className="creative-series__mode" role="group" aria-label="Series render lane">
            <span>RENDER LANE</span>
            <button
              type="button"
              className={seriesRenderMode === 'local' ? 'is-selected' : ''}
              onClick={() => onSeriesModeChange?.('local')}
              aria-pressed={seriesRenderMode === 'local'}
              disabled={seriesIsRunning}
            >
              FREE / BROWSER
            </button>
            <button
              type="button"
              className={seriesRenderMode === 'premium' ? 'is-selected is-premium' : 'is-premium'}
              onClick={() => onSeriesModeChange?.('premium')}
              aria-pressed={seriesRenderMode === 'premium'}
              disabled={seriesIsRunning}
            >
              PREMIUM / FAL
            </button>
          </div>
          {seriesIsRunning ? (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--quiet" onClick={onSeriesPause}>
              <Pause size={14} aria-hidden="true" />
              Pause episode
            </button>
          ) : canAssembleSeries ? (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--primary" onClick={onSeriesAssemble}>
              <PackageCheck size={14} aria-hidden="true" />
              Assemble series
            </button>
          ) : null}
        </div>

        {seriesRenderMode === 'premium' && (
          <p className="creative-series__lane-note">
            Premium is a separate confirmed lane. It requires the existing Lyria soundtrack plus a hosted neural portrait, then returns a muxed visual when the audio gate passes.
          </p>
        )}

        <div className="creative-series__episodes">
          {series.episodes.map(episode => {
            const runnableScenes = episode.scenes.filter(scene => ['planned', 'failed', 'cancelled'].includes(scene.status));
            const allScenesReady = episode.scenes.length > 0 && episode.scenes.every(scene => scene.status === 'ready');
            const isCurrentEpisode = seriesRunningEpisodeId === episode.id;
            return (
              <details className="creative-series__episode" key={episode.id} open={isCurrentEpisode || episode.status === 'partial' || episode.status === 'failed'}>
                <summary className="creative-series__episode-summary">
                  <span className="creative-series__episode-number">E{String(episode.number).padStart(2, '0')}</span>
                  <span className="creative-series__episode-title">{episode.title}</span>
                  <span className="creative-series__episode-progress">{episode.progress}% · {seriesEpisodeLabel(episode)}</span>
                </summary>
                <div className="creative-series__episode-body">
                  <p className="creative-series__episode-brief">{episode.brief}</p>
                  <div className="creative-series__episode-actions">
                    {!seriesIsRunning && runnableScenes.length > 0 && (
                      <button
                        type="button"
                        className="creative-artifact-card__button creative-artifact-card__button--primary"
                        onClick={() => onSeriesEpisodeStart?.(episode.id, seriesRenderMode)}
                      >
                        <Play size={13} aria-hidden="true" />
                        {episode.status === 'cancelled' || episode.status === 'partial' ? 'Resume episode' : 'Start episode'}
                      </button>
                    )}
                    {allScenesReady && !episode.outputUrl && !seriesIsRunning && (
                      <button
                        type="button"
                        className="creative-artifact-card__button"
                        onClick={() => onSeriesAssembleEpisode?.(episode.id)}
                      >
                        <PackageCheck size={13} aria-hidden="true" />
                        Assemble episode
                      </button>
                    )}
                    {episode.outputUrl && (
                      <a
                        className="creative-artifact-card__button"
                        href={episode.outputUrl}
                        target="_blank"
                        rel="noreferrer"
                        download={`episode-${String(episode.number).padStart(2, '0')}-assembly.json`}
                      >
                        <Eye size={13} aria-hidden="true" />
                        Inspect assembly
                      </a>
                    )}
                  </div>
                  <div className="creative-series__scenes">
                    {episode.scenes.map(scene => (
                      <div className="creative-series__scene" data-status={scene.status} key={scene.id}>
                        <div className="creative-series__scene-main">
                          <span className="creative-series__scene-title">{scene.title}</span>
                          <span className="creative-series__scene-status">
                            {scene.status} · {scene.progress}%
                            {scene.jobId ? ` · job ${scene.jobId.slice(0, 12)}` : ''}
                          </span>
                          {scene.error && <span className="creative-series__scene-error">{scene.error}</span>}
                        </div>
                        <div className="creative-series__scene-actions">
                          {scene.outputUrl && (
                            <a href={scene.outputUrl} target="_blank" rel="noreferrer" aria-label={`Inspect ${scene.title}`} className="creative-series__scene-link">
                              INSPECT
                            </a>
                          )}
                          {['failed', 'cancelled'].includes(scene.status) && !seriesIsRunning && (
                            <button type="button" onClick={() => onSeriesSceneRetry?.(episode.id, scene.id, seriesRenderMode)}>
                              RETRY
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            );
          })}
        </div>

        {series.finalAssemblyUrl && (
          <div className="creative-series__final">
            <PackageCheck size={18} aria-hidden="true" />
            <div>
              <strong>Finished series package ready</strong>
              <span>Every assembled episode is included. The package is recoverable from this manifest.</span>
            </div>
            <a href={series.finalAssemblyUrl} target="_blank" rel="noreferrer" download="surrogate-oracle-series.json">
              DOWNLOAD
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      className="creative-artifact-card oracle-console-frame"
      data-status={status}
      data-story={isIllustrationStory || undefined}
      data-testid="creative-artifact-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-live="polite"
    >
      <header className="creative-artifact-card__chrome">
        <div className="creative-artifact-card__identity">
          <div className="creative-artifact-card__eyebrow">
            {kindIcon(artifact.kind)}
            <span>Money Mite / creative dispatch</span>
          </div>
          <h2 className="creative-artifact-card__title" id={titleId}>{artifact.title}</h2>
          <div className="creative-artifact-card__request">
            REQUEST {artifact.requestId} · {formatCreatedAt(artifact.createdAt)}
          </div>
        </div>
        <button
          type="button"
          className="creative-artifact-card__close"
          onClick={onClose}
          aria-label="Close creative artifact card"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="creative-artifact-card__body" id={descriptionId}>
        <div className="creative-artifact-card__state-row">
          <div className="creative-artifact-card__state" data-testid="creative-artifact-status">
            {statusIcon(status)}
            <span>{requiresStudioReview ? 'Unreviewed studio render' : statusLabel(status)}</span>
          </div>
          <div className="creative-artifact-card__state-note">
            {requiresStudioReview ? 'watch + listen before approval' : statusNote(status)}
          </div>
        </div>

        <div>
          <span className="creative-artifact-card__prompt-label">Brief received</span>
          <p className="creative-artifact-card__prompt">{artifact.prompt}</p>
        </div>

        {followUpDetail && (
          <div className="creative-artifact-card__follow-up" role="group" aria-labelledby={`${descriptionId}-follow-up`}>
            <div className="creative-artifact-card__follow-up-heading">
              <Sparkles size={15} aria-hidden="true" />
              <span id={`${descriptionId}-follow-up`}>Money Mite asks one thing</span>
            </div>
            <p className="creative-artifact-card__follow-up-question">
              {creativeDetailQuestion(followUpDetail)}
            </p>
            <form className="creative-artifact-card__follow-up-form" onSubmit={submitFollowUp}>
              <label htmlFor={`${descriptionId}-follow-up-answer`}>
                {creativeDetailLabel(followUpDetail)}
              </label>
              <div className="creative-artifact-card__follow-up-input-row">
                <input
                  id={`${descriptionId}-follow-up-answer`}
                  type="text"
                  value={followUpAnswer}
                  onChange={(event) => setFollowUpAnswer(event.target.value)}
                  placeholder="Add one clear detail..."
                  autoComplete="off"
                  maxLength={280}
                />
                <button
                  type="submit"
                  className="creative-artifact-card__button creative-artifact-card__button--primary"
                  disabled={!followUpAnswer.trim()}
                >
                  Add to brief
                </button>
              </div>
            </form>
          </div>
        )}

        {isDraft && (
          <div className="creative-artifact-card__confirmation" role="status">
            {isIllustrationStory && artifact.followUpCompleted && (
              <div className="creative-story-choice" role="group" aria-label="Story visual lane">
                <div className="creative-story-choice__heading">Choose the visual lane</div>
                <div className="creative-story-choice__options">
                  <button
                    type="button"
                    className={`creative-story-choice__option${storyLane === 'local' ? ' is-selected' : ''}`}
                    onClick={() => chooseStoryLane('local', null)}
                  >
                    <strong>LOCAL / FREE</strong>
                    <span>Opt down to authored panel motion and local FFmpeg. No hosted video charge.</span>
                  </button>
                  <button
                    type="button"
                    className={`creative-story-choice__option${storyLane === 'pollinations' ? ' is-selected' : ''}`}
                    onClick={() => chooseStoryLane(
                      'pollinations',
                      ILLUSTRATION_STORY_POLLINATIONS_MODELS.find(model => model.slug === storyModelSlug)?.slug
                        ?? ILLUSTRATION_STORY_POLLINATIONS_MODELS[0]?.slug
                        ?? null,
                    )}
                  >
                    <strong>OPEN SHOTS / FREE-FIRST</strong>
                    <span>One few-second Pollinations shot per panel, then local FFmpeg stitching. Paid-only models are refused.</span>
                  </button>
                  <button
                    type="button"
                    className={`creative-story-choice__option${storyLane === 'fal' ? ' is-selected' : ''}`}
                    onClick={() => chooseStoryLane(
                      'fal',
                      models.find(model => model.slug === storyModelSlug && (model.provider ?? 'fal') === 'fal')?.slug
                        ?? ILLUSTRATION_STORY_FAL_MODELS[0]?.slug
                        ?? null,
                    )}
                  >
                    <strong>LIVING STORY / PREMIUM · HOLD</strong>
                    <span>H3 stays blocked until a server-verified representative action proof passes. No metered H3 jobs are submitted before that proof.</span>
                  </button>
                </div>
                {storyLane === 'pollinations' && (
                  <div className="creative-story-choice__fal">
                    <label htmlFor={`${descriptionId}-pollinations-model`}>Open video model</label>
                    <select
                      id={`${descriptionId}-pollinations-model`}
                      value={storyModelSlug ?? ''}
                      onChange={(event) => chooseStoryLane('pollinations', event.target.value || null)}
                    >
                      {ILLUSTRATION_STORY_POLLINATIONS_MODELS.map(model => (
                        <option value={model.slug} key={model.slug}>{model.label} · {model.costLabel}</option>
                      ))}
                    </select>
                    {storyModelSlug && (() => {
                      const model = ILLUSTRATION_STORY_POLLINATIONS_MODELS.find(item => item.slug === storyModelSlug);
                      return model ? <small>{model.description} Estimated run: about {Math.ceil(model.expectedSeconds / 60)} minutes.</small> : null;
                    })()}
                  </div>
                )}
                {storyLane === 'pollinations' && (
                  <p className="creative-story-choice__warning">
                    Free-first is fail-closed: the server checks Pollinations’ live catalog, refuses paid-only models, and never falls through to FAL. A Pollinations server key may still be required.
                  </p>
                )}
                {storyLane === 'fal' && (
                  <div className="creative-story-choice__fal">
                    <label htmlFor={`${descriptionId}-fal-model`}>Approved FAL model</label>
                    <select
                      id={`${descriptionId}-fal-model`}
                      value={storyModelSlug ?? ''}
                      onChange={(event) => chooseStoryLane('fal', event.target.value || null)}
                    >
                      {models.filter(model => (model.provider ?? 'fal') === 'fal').map(model => (
                        <option value={model.slug} key={model.slug}>{model.label} · {model.costLabel}</option>
                      ))}
                    </select>
                    {storyModelSlug && (() => {
                      const model = models.find(item => item.slug === storyModelSlug && (item.provider ?? 'fal') === 'fal');
                      return model ? <small>{model.description} Estimated scene wait: about {Math.ceil(model.expectedSeconds / 60)} minutes.</small> : null;
                    })()}
                  </div>
                )}
                {storyLane === 'fal' && (
                  <p className="creative-story-choice__warning">
                     Premium is currently held. The app will not submit the ten metered H3 jobs until representative action proof is available; camera-only evidence is rejected.
                  </p>
                )}
              </div>
            )}
            <div className="creative-artifact-card__confirmation-heading">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>{artifact.requiresConfirmation ? 'Confirmation required' : 'Ready to dispatch'}</span>
            </div>
            <p className="creative-artifact-card__confirmation-copy">
              {isIllustrationStory && storyLane === 'pollinations'
                ? 'This explicitly confirms 32 ordered Pollinations short-shot requests followed by local FFmpeg assembly. The provider must pass the live non-paid-only catalog check; human watch-and-listen review remains required.'
                : isIllustrationStory && storyLane === 'fal'
                 ? 'The premium H3 lane is staged but held: representative action proof must pass before any metered chunk jobs can be submitted.'
                : artifact.confirmationCopy
                ?? (artifact.requiresConfirmation
                  ? 'Money Mite will send this brief into the production lane only after you clear it.'
                   : 'The brief is staged. Clear it when you are ready to start production.')}
            </p>
          </div>
        )}

        {isWorking && (
          <div className="creative-artifact-card__progress-panel" role="status" aria-label={`Generation ${progress}% complete`}>
            <div className="creative-artifact-card__progress-head">
              <span className="creative-artifact-card__progress-label">
                {status === 'queued' ? 'Holding for a production slot' : 'Building the artifact'}
              </span>
              <span className="creative-artifact-card__progress-value">{progress}%</span>
            </div>
            <div
              className="creative-artifact-card__progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Creative artifact generation progress"
            >
              <span className="creative-artifact-card__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="creative-artifact-card__progress-note">
              <span className="creative-artifact-card__progress-pulse" aria-hidden="true" />
              {status === 'queued'
                ? 'The request is safe in the queue. No duplicate dispatch will be made.'
                : 'Signal is moving. You can cancel without hiding the current state.'}
            </p>
          </div>
        )}

        {hasStoryReviewSurface && (
          <IllustrationStoryOpenKitchen
            pages={storyPages}
            scenes={storyScenes}
            manifest={storyReviewManifest}
            outputUrl={outputUrl}
            audioSources={storyAudioSources}
            storyStage={String(metadataRecord?.storyStage ?? 'studio review required')}
            progress={progress}
            onStorySceneRetry={storyReadOnly ? undefined : onStorySceneRetry}
            onStorySceneReplace={storyReadOnly ? undefined : onStorySceneReplace}
            onStoryFilmRetry={onStoryFilmRetry}
            onStoryRecoveryConfirm={onStoryRecoveryConfirm}
            recovery={storyRecovery}
            onStoryReviewApprove={onStoryReviewApprove}
            onStoryReviewReject={onStoryReviewReject}
            onStoryReviewStateChange={onStoryReviewStateChange}
          />
        )}

        {status === 'ready' && !isSeries && !hasStoryReviewSurface && (
          <div className="creative-artifact-card__output">
            <span className="creative-artifact-card__output-label">Output signal</span>
            {renderOutput() ?? (
              <div className="creative-artifact-card__preview creative-artifact-card__preview--generic">
                <Check size={24} aria-hidden="true" />
                <span className="creative-artifact-card__preview-label">Artifact assembled</span>
                <span className="creative-artifact-card__preview-subline">The provider returned no preview URL.</span>
              </div>
            )}
            <div className="creative-artifact-card__output-meta">
              <span>{artifact.outputLabel ?? 'Creative artifact'}</span>
              <span>{artifact.providerLabel}</span>
            </div>
          </div>
        )}

        {status === 'partial' && !isSeries && !hasStoryReviewSurface && (
          <div className="creative-artifact-card__output">
            <span className="creative-artifact-card__output-label">Recovered output</span>
            {renderOutput() ?? (
              <div className="creative-artifact-card__preview creative-artifact-card__preview--generic">
                <Sparkles size={24} aria-hidden="true" />
                <span className="creative-artifact-card__preview-label">Partial artifact recovered</span>
                <span className="creative-artifact-card__preview-subline">The available signal can be reviewed or regenerated.</span>
              </div>
            )}
            <div className="creative-artifact-card__output-meta">
              <span>{artifact.outputLabel ?? 'Partial creative artifact'}</span>
              <span>{artifact.providerLabel}</span>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="creative-artifact-card__error" role="alert">
            <span className="creative-artifact-card__error-label">Production stopped</span>
            <span>{artifact.error ?? 'The provider did not return a usable artifact. Nothing was saved as complete.'}</span>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="creative-artifact-card__cancelled" role="status">
            This dispatch was cancelled before a complete artifact arrived. The original brief is still available to retry.
          </div>
        )}

        {hasMetadata && !isIllustrationStory && (
          <div className="creative-artifact-card__metadata" aria-label="Artifact metadata">
            {metadataEntries.map(([key, value]) => (
              <div key={key}>{key}: {formatMetadataValue(value)}</div>
            ))}
          </div>
        )}

        {renderSeries()}

        <div className="creative-artifact-card__actions">
          {isDraft && (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--primary" onClick={onConfirm}>
              <Check size={14} aria-hidden="true" />
              {artifact.confirmationLabel ?? (artifact.requiresConfirmation ? 'Confirm production' : 'Start production')}
            </button>
          )}
          {canRetry && (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--purple" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              Retry dispatch
            </button>
          )}
          {storyAudioGateFailed && onStoryFilmRetry && !hasStoryReviewSurface && (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--purple" onClick={onStoryFilmRetry}>
              <RefreshCw size={14} aria-hidden="true" />
              Retry stitch + audio gate
            </button>
          )}
          {canOutput && (
            <>
              <button type="button" className="creative-artifact-card__button" onClick={onPreview}>
                <Eye size={14} aria-hidden="true" />
                Preview
              </button>
              <button type="button" className="creative-artifact-card__button" onClick={onDownload}>
                <Download size={14} aria-hidden="true" />
                Download
              </button>
            </>
          )}
          {canCancel && (
            <button type="button" className="creative-artifact-card__button creative-artifact-card__button--quiet" onClick={onCancel}>
              <OctagonX size={14} aria-hidden="true" />
              Cancel
            </button>
          )}
          <button type="button" className="creative-artifact-card__button creative-artifact-card__button--quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </section>
  );
}

export default CreativeArtifactCard;