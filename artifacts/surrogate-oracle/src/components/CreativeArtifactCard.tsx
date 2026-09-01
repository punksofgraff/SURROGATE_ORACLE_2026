import { useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  Eye,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  History,
  LoaderCircle,
  OctagonX,
  Pause,
  Play,
  Layers3,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  creativeDetailLabel,
  creativeDetailQuestion,
  type CreativeArtifact,
  type CreativeEpisode,
  type CreativeMissingDetail,
  type CreativeSeriesHistoryEntry,
  type SeriesRenderMode,
} from '../lib/creativeProduction';
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
  const isIllustrationStory = artifact.metadata?.production === 'illustration-story-proof';
  const isSeries = Boolean(series);
  const isDraft = status === 'draft';
  const followUpDetail = isDraft && !artifact.followUpCompleted ? missingDetails[0] : undefined;
  const isWorking = status === 'queued' || status === 'generating';
  const isRecoverable = status === 'failed' || status === 'cancelled' || status === 'partial';
  const canCancel = isDraft || isWorking;
  const canRetry = isRecoverable && !isSeries;
  const canOutput = !isSeries && (status === 'ready' || status === 'partial') && hasOutput;
  const previewType = outputKind(artifact.kind);
  const metadataEntries = hasMetadata
    ? Object.entries(metadataRecord ?? {}).slice(0, 4)
    : [];
  const [followUpAnswer, setFollowUpAnswer] = useState('');

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
      className="creative-artifact-card"
      data-status={status}
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
          <div className="creative-artifact-card__state">
            {statusIcon(status)}
            <span>{statusLabel(status)}</span>
          </div>
          <div className="creative-artifact-card__state-note">{statusNote(status)}</div>
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
            <div className="creative-artifact-card__confirmation-heading">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>{artifact.requiresConfirmation ? 'Confirmation required' : 'Ready to dispatch'}</span>
            </div>
            <p className="creative-artifact-card__confirmation-copy">
              {artifact.confirmationCopy
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

        {isIllustrationStory && storyPages.length > 0 && (
          <div className="creative-story-proof" aria-label="Illustration story production">
            <div className="creative-story-proof__heading">
              <Layers3 size={15} aria-hidden="true" />
              <strong>Illustration story / {storyPages.length} pages</strong>
              <span>{formatMetadataValue(metadataRecord?.storyStage ?? 'page plan ready')}</span>
            </div>
            <div className="creative-story-proof__track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="creative-story-proof__pages">
              {storyPages.map(page => (
                <span key={page.id} title={`${page.title}: ${page.narration}`} data-state={progress >= (page.pageNumber / storyPages.length) * 100 ? 'complete' : 'planned'}>
                  {String(page.pageNumber).padStart(2, '0')}
                </span>
              ))}
            </div>
            <p>
              Two local 4×4 illustration sheets · {Math.round(storyPages.reduce((sum, page) => sum + page.durationSeconds, 0))} seconds ·
              gentle zoom/fade transitions · Lyria backing music · child-friendly narration
            </p>
          </div>
        )}

        {status === 'ready' && !isSeries && (
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

        {status === 'partial' && !isSeries && (
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

        {hasMetadata && (
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