import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  CircleAlert,
  Eye,
  FileAudio,
  Film,
  Headphones,
  History,
  Image as ImageIcon,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react';
import type {
  IllustrationStoryPage,
  IllustrationStoryReviewAudioSource,
  IllustrationStoryReviewEvidence,
  IllustrationStoryReviewHistoryAction,
  IllustrationStoryReviewManifest,
  IllustrationStoryReviewShot,
  IllustrationStoryReviewState,
  IllustrationStoryScene,
} from '../lib/creativeProduction';
import { filterIllustrationStoryReviewHistory } from '../lib/creativeProduction';
import './IllustrationStoryOpenKitchen.css';

type IllustrationStoryOpenKitchenProps = {
  pages: IllustrationStoryPage[];
  scenes: IllustrationStoryScene[];
  manifest: IllustrationStoryReviewManifest | null;
  outputUrl?: string | null;
  audioSources: IllustrationStoryReviewAudioSource[];
  storyStage?: string;
  progress: number;
  onStorySceneRetry?: (pageNumber: number) => void;
  onStorySceneReplace?: (pageNumber: number) => void;
  onStoryFilmRetry?: () => void;
  onStoryReviewApprove?: () => void;
  onStoryReviewReject?: (reason?: string, pageNumber?: number) => void;
  onStoryReviewStateChange?: (state: IllustrationStoryReviewState, pageNumber?: number) => void;
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function pageForShot(pages: IllustrationStoryPage[], shot: IllustrationStoryReviewShot): IllustrationStoryPage | null {
  return pages.find(page => page.pageNumber === shot.pageNumber) ?? null;
}

function audioStatusLabel(source: IllustrationStoryReviewAudioSource): string {
  switch (source.status) {
    case 'available': return 'available';
    case 'fallback': return 'fallback';
    case 'failed': return 'failed';
    case 'missing': return 'missing';
    default: return 'not supplied';
  }
}

function isRequiredAudio(source: IllustrationStoryReviewAudioSource): boolean {
  return source.id !== 'sfx' && source.status !== 'not-requested';
}

function formatReviewDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function reviewActionLabel(action: NonNullable<IllustrationStoryReviewManifest['reviewHistory']>[number]['action']): string {
  switch (action) {
    case 'inspection': return 'Inspected';
    case 'approval': return 'Approved';
    case 'rejection': return 'Rejected';
  }
}

function reviewChangeLabel(entry: NonNullable<IllustrationStoryReviewManifest['reviewHistory']>[number]): string {
  if (entry.action === 'approval') return 'Approved the reviewed studio render.';
  if (entry.action === 'rejection') {
    return entry.pageNumber
      ? `Rejected shot ${String(entry.pageNumber).padStart(2, '0')}.`
      : 'Rejected the studio render.';
  }
  const inspected = `${entry.inspectedShotNumbers.length}/32 shots inspected`;
  const shot = entry.pageNumber
    ? `Inspected shot ${String(entry.pageNumber).padStart(2, '0')}`
    : null;
  return entry.audioListened
    ? `${shot ? `${shot} · ` : ''}${inspected}; current mix listened to.`
    : `${shot ? `${shot} · ` : ''}${inspected}`;
}

function EvidenceVideo({
  evidence,
  title,
}: {
  evidence: IllustrationStoryReviewEvidence;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !evidence.mediaUrl) return;
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(Math.max(0, evidence.offsetSeconds), Math.max(0, video.duration - 0.04));
    }
  }, [evidence.mediaUrl, evidence.offsetSeconds]);

  if (!evidence.available || !evidence.mediaUrl) {
    return (
      <div className="story-kitchen__evidence-missing" role="status">
        <CircleAlert size={16} aria-hidden="true" />
        <span>Rendered evidence unavailable</span>
      </div>
    );
  }

  return (
    <div className="story-kitchen__evidence-media">
      <video
        ref={videoRef}
        src={evidence.mediaUrl}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (video && Number.isFinite(video.duration)) {
            video.currentTime = Math.min(Math.max(0, evidence.offsetSeconds), Math.max(0, video.duration - 0.04));
          }
        }}
        aria-label={`${title} ${evidence.label} evidence`}
      />
    </div>
  );
}

function SourceCrop({ shot }: { shot: IllustrationStoryReviewShot }) {
  const { source } = shot;
  return (
    <div className="story-kitchen__source-frame" aria-label={`Original source panel ${shot.pageNumber}`}>
      {source.assetUrl ? (
        <img
          src={source.assetUrl}
          alt={`Original illustration panel ${String(shot.pageNumber).padStart(2, '0')}`}
          style={{
            left: `${source.column * -100}%`,
            top: `${source.row * -100}%`,
          }}
        />
      ) : (
        <div className="story-kitchen__evidence-missing">
          <ImageIcon size={16} aria-hidden="true" />
          <span>Source panel unavailable</span>
        </div>
      )}
      <span className="story-kitchen__source-chip">
        Sheet {source.sheetIndex + 1} · R{source.row + 1} C{source.column + 1}
      </span>
    </div>
  );
}

function EvidenceCard({
  evidence,
  title,
}: {
  evidence: IllustrationStoryReviewEvidence;
  title: string;
}) {
  return (
    <article className="story-kitchen__evidence-card">
      <div className="story-kitchen__evidence-label">
        <span>{evidence.label}</span>
        <small>{formatTime(evidence.offsetSeconds)}</small>
      </div>
      <EvidenceVideo evidence={evidence} title={title} />
      <small className="story-kitchen__evidence-source">
        {evidence.source === 'scene' ? 'Rendered scene clip' : evidence.source === 'assembled-film' ? 'Assembled film checkpoint' : 'No media reference'}
      </small>
    </article>
  );
}

export function IllustrationStoryOpenKitchen({
  pages,
  scenes,
  manifest,
  outputUrl,
  audioSources,
  storyStage,
  progress,
  onStorySceneRetry,
  onStorySceneReplace,
  onStoryFilmRetry,
  onStoryReviewApprove,
  onStoryReviewReject,
  onStoryReviewStateChange,
}: IllustrationStoryOpenKitchenProps) {
  const shots = manifest?.shots ?? [];
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  const [reviewedShots, setReviewedShots] = useState<Set<number>>(
    () => new Set(manifest?.review?.inspectedShotNumbers ?? []),
  );
  const [audioReviewed, setAudioReviewed] = useState(manifest?.review?.audioListened ?? false);
  const [rejectionReason, setRejectionReason] = useState('');
  const filmRef = useRef<HTMLVideoElement>(null);
  const [filmReady, setFilmReady] = useState(false);
  const [historyShotFilter, setHistoryShotFilter] = useState<number | 'all'>('all');
  const [historyActionFilter, setHistoryActionFilter] = useState<IllustrationStoryReviewHistoryAction | 'all'>('all');

  useEffect(() => {
    setSelectedPageNumber(1);
    setReviewedShots(new Set(manifest?.review?.inspectedShotNumbers ?? []));
    setAudioReviewed(manifest?.review?.audioListened ?? false);
    setRejectionReason('');
    setFilmReady(false);
    setHistoryShotFilter('all');
    setHistoryActionFilter('all');
  }, [manifest?.createdAt, outputUrl]);

  const selectedShot = shots.find(shot => shot.pageNumber === selectedPageNumber) ?? shots[0] ?? null;
  const selectedPage = selectedShot ? pageForShot(pages, selectedShot) : null;
  const selectedScene = scenes.find(scene => scene.pageNumber === selectedShot?.pageNumber);
  const reviewHistory = useMemo(
    () => filterIllustrationStoryReviewHistory(manifest?.reviewHistory, {
      pageNumber: historyShotFilter,
      action: historyActionFilter,
    }),
    [historyActionFilter, historyShotFilter, manifest?.reviewHistory],
  );
  const requiredAudio = audioSources.filter(isRequiredAudio);
  const missingAudio = requiredAudio.length < 8
    ? [{
      id: 'audio-inventory',
      label: 'Required audio inventory',
      status: 'missing',
      sourceLabel: 'Review manifest did not persist all required sources',
      generated: false,
      note: 'Narration, six character tracks, music, and any lane-specific audio must be listed before approval.',
    } satisfies IllustrationStoryReviewAudioSource]
    : requiredAudio.filter(source => source.status !== 'available');
  const manifestLoaded = Boolean(manifest && manifest.version === 1 && manifest.pageCount === 32 && shots.length === 32);
  const visualEvidenceReady = manifestLoaded && shots.every(shot => (
    Boolean(shot.source.assetUrl)
      && shot.rendered.evidence.length === 3
      && shot.rendered.evidence.every(evidence => evidence.available && evidence.mediaUrl)
  ));
  const allShotsReviewed = manifestLoaded && shots.every(shot => reviewedShots.has(shot.pageNumber));
  const canApprove = Boolean(
    onStoryReviewApprove
      && manifestLoaded
      && Boolean(manifest?.complete)
      && visualEvidenceReady
      && allShotsReviewed
      && audioReviewed
      && missingAudio.length === 0,
  );
  const reviewSummary = useMemo(() => {
    if (!manifestLoaded) return 'Waiting for the complete review manifest.';
    if (!visualEvidenceReady) return 'Rendered checkpoints are missing for one or more shots.';
    if (missingAudio.length) return `${missingAudio.length} required audio source${missingAudio.length === 1 ? '' : 's'} need attention.`;
    if (!allShotsReviewed) return `${reviewedShots.size}/32 shots inspected.`;
    if (!audioReviewed) return 'Listen to the current mix before approval.';
    return 'Visual and audio evidence inspected.';
  }, [allShotsReviewed, audioReviewed, manifestLoaded, missingAudio.length, reviewedShots.size, visualEvidenceReady]);

  useEffect(() => {
    const video = filmRef.current;
    if (!video || !selectedShot || !filmReady) return;
    video.currentTime = Math.min(
      Math.max(0, selectedShot.startSeconds),
      Math.max(0, video.duration - 0.04),
    );
  }, [filmReady, selectedShot]);

  const markSelectedShotReviewed = () => {
    if (!selectedShot) return;
    setReviewedShots(current => {
      const next = new Set(current);
      next.add(selectedShot.pageNumber);
      onStoryReviewStateChange?.({
        inspectedShotNumbers: [...next].sort((a, b) => a - b),
        audioListened: audioReviewed,
        updatedAt: new Date().toISOString(),
      }, selectedShot.pageNumber);
      return next;
    });
  };

  const changeAudioReview = (listened: boolean) => {
    setAudioReviewed(listened);
    onStoryReviewStateChange?.({
      inspectedShotNumbers: [...reviewedShots].sort((a, b) => a - b),
      audioListened: listened,
      updatedAt: new Date().toISOString(),
    });
  };

  const rejectSelectedShot = () => {
    const reason = rejectionReason.trim();
    if (!reason || !onStoryReviewReject) return;
    onStoryReviewReject(reason, selectedShot?.pageNumber);
  };

  return (
    <section className="story-kitchen" aria-label="Open Kitchen Studio" data-testid="story-review-workspace">
      <header className="story-kitchen__header">
        <div>
          <div className="story-kitchen__eyebrow">
            <AudioLines size={14} aria-hidden="true" />
            <span>Open Kitchen Studio</span>
            <span className="story-kitchen__live-dot" aria-hidden="true" />
          </div>
          <h3>See the ingredients. Hear the mix. Sign off only when it holds.</h3>
          <p>
            A calm co-pilot review room for the original panels, the authored shot plan, and every audio source that actually made it into this render.
          </p>
        </div>
        <div className="story-kitchen__header-status">
          <span className="story-kitchen__status-pill" data-state={manifest?.complete ? 'ready' : 'pending'}>
            <LockKeyhole size={13} aria-hidden="true" />
            {manifest?.complete ? 'Evidence loaded' : 'Evidence pending'}
          </span>
          <small>{storyStage ?? 'studio review required'} · {Math.round(progress)}%</small>
        </div>
      </header>

      <div className="story-kitchen__timeline-heading">
        <div>
          <span className="story-kitchen__section-kicker">01 / Source timeline</span>
          <strong>{manifestLoaded ? '32 original panels, locked in order' : 'Loading the 32-shot manifest'}</strong>
        </div>
        <span className="story-kitchen__timeline-count">{reviewedShots.size}/32 inspected</span>
      </div>
      <div className="story-kitchen__timeline" role="list" aria-label="Story shot timeline" data-testid="story-shot-timeline">
        {shots.map(shot => {
          const isSelected = shot.pageNumber === selectedShot?.pageNumber;
          const scene = scenes.find(item => item.pageNumber === shot.pageNumber);
          const state = shot.rendered.status;
          return (
            <button
              type="button"
              key={shot.pageNumber}
              role="listitem"
              className={`story-kitchen__timeline-item${isSelected ? ' is-selected' : ''}`}
              data-state={state}
              data-reviewed={reviewedShots.has(shot.pageNumber) || undefined}
              onClick={() => setSelectedPageNumber(shot.pageNumber)}
              aria-current={isSelected ? 'step' : undefined}
              aria-label={`Shot ${String(shot.pageNumber).padStart(2, '0')}, ${state}`}
              data-testid={`story-shot-${shot.pageNumber}`}
            >
              <span>{String(shot.pageNumber).padStart(2, '0')}</span>
              <small>{formatTime(shot.startSeconds)}</small>
              {reviewedShots.has(shot.pageNumber) && <Check size={11} aria-hidden="true" />}
              {scene?.status === 'failed' && <CircleAlert size={11} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <section className="story-kitchen__history" aria-label="Studio review history" data-testid="story-review-history">
        <div className="story-kitchen__panel-heading">
          <div>
            <span className="story-kitchen__section-kicker">02 / Studio review history</span>
            <strong>
              {historyShotFilter === 'all' && historyActionFilter === 'all'
                ? 'Every review decision, in order'
                : `${reviewHistory.length} matching event${reviewHistory.length === 1 ? '' : 's'}`}
            </strong>
          </div>
          <History size={16} aria-hidden="true" />
        </div>
        <div className="story-kitchen__history-filters" aria-label="Filter studio review history">
          <label>
            <span>Shot</span>
            <select
              value={historyShotFilter}
              onChange={event => {
                const value = event.target.value;
                setHistoryShotFilter(value === 'all' ? 'all' : Number(value));
              }}
              data-testid="select-review-history-shot"
            >
              <option value="all">All shots</option>
              {shots.map(shot => (
                <option key={shot.pageNumber} value={shot.pageNumber}>
                  Shot {String(shot.pageNumber).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Decision</span>
            <select
              value={historyActionFilter}
              onChange={event => setHistoryActionFilter(event.target.value as IllustrationStoryReviewHistoryAction | 'all')}
              data-testid="select-review-history-action"
            >
              <option value="all">All events</option>
              <option value="approval">Approvals</option>
              <option value="rejection">Rejections</option>
              <option value="inspection">Inspections</option>
            </select>
          </label>
          {(historyShotFilter !== 'all' || historyActionFilter !== 'all') && (
            <button
              type="button"
              className="story-kitchen__history-clear"
              onClick={() => {
                setHistoryShotFilter('all');
                setHistoryActionFilter('all');
              }}
              data-testid="button-clear-review-history-filters"
            >
              Clear filters
            </button>
          )}
        </div>
        {reviewHistory.length ? (
          <ol className="story-kitchen__history-list">
            {reviewHistory.map((entry, index) => (
              <li className="story-kitchen__history-item" key={`${entry.occurredAt}-${entry.action}-${index}`}>
                <span className={`story-kitchen__history-marker story-kitchen__history-marker--${entry.action}`} aria-hidden="true">
                  {entry.action === 'approval' ? <Check size={12} /> : entry.action === 'rejection' ? <X size={12} /> : <Eye size={12} />}
                </span>
                <div className="story-kitchen__history-copy">
                  <div className="story-kitchen__history-topline">
                    <strong>{reviewActionLabel(entry.action)}</strong>
                    <time dateTime={entry.occurredAt}>{formatReviewDate(entry.occurredAt)}</time>
                  </div>
                  <span>{reviewChangeLabel(entry)}</span>
                  {entry.reason && <p>{entry.reason}</p>}
                  <small>by {entry.reviewer || 'Studio reviewer'}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : manifest?.reviewHistory?.length ? (
          <p className="story-kitchen__history-empty">
            No review events match these filters. Clear filters to restore the complete chronological history.
          </p>
        ) : (
          <p className="story-kitchen__history-empty">
            No chronological events have been recorded yet. New inspections, approvals, and shot-level reasons will appear here.
          </p>
        )}
      </section>

      {selectedShot && (
        <div className="story-kitchen__workspace">
          <div className="story-kitchen__visual-column">
            <div className="story-kitchen__column-heading">
              <div>
                <span className="story-kitchen__section-kicker">02 / Selected shot</span>
                <strong>Shot {String(selectedShot.pageNumber).padStart(2, '0')} · {selectedPage?.title ?? 'Panel'}</strong>
              </div>
              <span className="story-kitchen__time-range">
                {formatTime(selectedShot.startSeconds)} → {formatTime(selectedShot.endSeconds)}
              </span>
            </div>
            <div className="story-kitchen__source-output">
              <article className="story-kitchen__source-card">
                <div className="story-kitchen__media-heading">
                  <ImageIcon size={13} aria-hidden="true" />
                  <span>Original source</span>
                  <small>immutable</small>
                </div>
                <SourceCrop shot={selectedShot} />
              </article>
              <article className="story-kitchen__output-card">
                <div className="story-kitchen__media-heading">
                  <Film size={13} aria-hidden="true" />
                  <span>Assembled output</span>
                  <small>{selectedShot.rendered.status}</small>
                </div>
                {outputUrl ? (
                  <video
                    ref={filmRef}
                    src={outputUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={() => setFilmReady(true)}
                    aria-label={`Assembled story film at shot ${selectedShot.pageNumber}`}
                  />
                ) : (
                  <div className="story-kitchen__evidence-missing">
                    <CircleAlert size={16} aria-hidden="true" />
                    <span>Final output is not available</span>
                  </div>
                )}
              </article>
            </div>

            <div className="story-kitchen__evidence-heading">
              <div>
                <span className="story-kitchen__section-kicker">03 / Evidence checkpoints</span>
                <strong>Beginning, middle, and end of this shot</strong>
              </div>
              <span>{selectedShot.rendered.evidence.filter(evidence => evidence.available).length}/3 loaded</span>
            </div>
            <div className="story-kitchen__evidence-grid">
              {selectedShot.rendered.evidence.map(evidence => (
                <EvidenceCard key={evidence.label} evidence={evidence} title={`Shot ${selectedShot.pageNumber}`} />
              ))}
            </div>
            <div className="story-kitchen__shot-attestation">
              <div>
                <Eye size={15} aria-hidden="true" />
                <span>
                  {reviewedShots.has(selectedShot.pageNumber)
                    ? 'This shot is marked inspected.'
                    : 'Watch the checkpoints and mark this shot inspected when the artwork stays legible.'}
                </span>
              </div>
              <button
                type="button"
                className="story-kitchen__button story-kitchen__button--quiet"
                onClick={markSelectedShotReviewed}
                disabled={!selectedShot.rendered.evidence.every(evidence => evidence.available)}
              >
                <Check size={13} aria-hidden="true" />
                {reviewedShots.has(selectedShot.pageNumber) ? 'Inspected' : 'Mark shot inspected'}
              </button>
            </div>
          </div>

          <aside className="story-kitchen__detail-column">
            <section className="story-kitchen__glass-panel">
              <div className="story-kitchen__panel-heading">
                <div>
                  <span className="story-kitchen__section-kicker">04 / Shot plan</span>
                  <strong>{selectedShot.shotPlan.treatment.replaceAll('-', ' ')}</strong>
                </div>
                <span className="story-kitchen__plan-badge">{selectedShot.shotPlan.performanceCue.replaceAll('-', ' ')}</span>
              </div>
              <dl className="story-kitchen__plan-list">
                <div><dt>Subject</dt><dd>{selectedShot.shotPlan.subjectFocus}</dd></div>
                <div><dt>Action</dt><dd>{selectedShot.shotPlan.actionBeat}</dd></div>
                <div><dt>Environment</dt><dd>{selectedShot.shotPlan.environmentBeat}</dd></div>
                <div><dt>Camera</dt><dd>{selectedShot.shotPlan.cameraMove}</dd></div>
                <div><dt>Sound cue</dt><dd>{selectedShot.shotPlan.soundCue} · +{selectedShot.shotPlan.soundOffsetSeconds.toFixed(2)}s</dd></div>
                <div><dt>Lip sync</dt><dd>{selectedShot.shotPlan.lipSyncMode.replaceAll('-', ' ')}</dd></div>
              </dl>
              {selectedScene?.status === 'failed' && (
                <div className="story-kitchen__recovery" role="alert">
                  <CircleAlert size={14} aria-hidden="true" />
                  <span>{selectedScene.error ?? 'This shot needs recovery.'}</span>
                  <div>
                    {onStorySceneRetry && (
                      <button type="button" onClick={() => onStorySceneRetry(selectedShot.pageNumber)}>
                        <RotateCcw size={12} aria-hidden="true" /> Retry shot
                      </button>
                    )}
                    {selectedScene.failureKind === 'provider-safety' && onStorySceneReplace && (
                      <button type="button" onClick={() => onStorySceneReplace(selectedShot.pageNumber)}>
                        Use safe replacement
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="story-kitchen__glass-panel story-kitchen__audio-panel">
              <div className="story-kitchen__panel-heading">
                <div>
                  <span className="story-kitchen__section-kicker">05 / Audio kitchen</span>
                  <strong>Actual sources in this mix</strong>
                </div>
                <Headphones size={16} aria-hidden="true" />
              </div>
              <div className="story-kitchen__audio-list">
                {audioSources.map(source => (
                  <div className="story-kitchen__audio-row" data-status={source.status} key={source.id}>
                    <span className="story-kitchen__audio-icon">
                      {source.id === 'music' ? <Volume2 size={13} aria-hidden="true" /> : source.id === 'sfx' ? <AudioLines size={13} aria-hidden="true" /> : <FileAudio size={13} aria-hidden="true" />}
                    </span>
                    <div className="story-kitchen__audio-copy">
                      <strong>{source.label}</strong>
                      <small>{source.sourceLabel}</small>
                      {source.note && <span>{source.note}</span>}
                    </div>
                    <span className="story-kitchen__audio-status">{audioStatusLabel(source)}</span>
                    {source.previewUrl && (
                      <audio src={source.previewUrl} controls preload="none" aria-label={`Preview ${source.label}`} />
                    )}
                  </div>
                ))}
              </div>
              {outputUrl && (
                <div className="story-kitchen__mix-preview">
                  <div>
                    <Film size={13} aria-hidden="true" />
                    <strong>Current assembled mix</strong>
                    <small>Listen to the actual delivered balance.</small>
                  </div>
                  <audio src={outputUrl} controls preload="metadata" aria-label="Current assembled story mix" />
                </div>
              )}
              {missingAudio.length > 0 && (
                <div className="story-kitchen__audio-alert" role="alert">
                  <CircleAlert size={14} aria-hidden="true" />
                  <span>{missingAudio.map(source => source.label).join(', ')} {missingAudio.length === 1 ? 'is' : 'are'} not available as required review evidence.</span>
                </div>
              )}
              {onStoryFilmRetry && (
                <button type="button" className="story-kitchen__button story-kitchen__button--outline" onClick={onStoryFilmRetry}>
                  <RotateCcw size={13} aria-hidden="true" />
                  Rebuild available audio + mix
                </button>
              )}
              <label className="story-kitchen__listen-check">
                <input
                  type="checkbox"
                  checked={audioReviewed}
                  onChange={event => changeAudioReview(event.target.checked)}
                />
                <span>
                  <ShieldCheck size={14} aria-hidden="true" />
                  I listened to the current mix
                </span>
              </label>
            </section>

            <section className="story-kitchen__review-panel">
              <div className="story-kitchen__panel-heading">
                <div>
                  <span className="story-kitchen__section-kicker">06 / Review gate</span>
                  <strong>{reviewSummary}</strong>
                </div>
                <LockKeyhole size={16} aria-hidden="true" />
              </div>
              <button
                type="button"
                className="story-kitchen__button story-kitchen__button--approve"
                onClick={onStoryReviewApprove}
                disabled={!canApprove}
                title={canApprove ? 'Approve this reviewed studio render' : reviewSummary}
                data-testid="button-approve-story-review"
              >
                <Check size={14} aria-hidden="true" />
                {canApprove ? 'Approve reviewed studio render' : 'Approval locked'}
              </button>
              <div className="story-kitchen__reject">
                <label htmlFor={`story-reject-${selectedPageNumber}`}>Reject selected shot with a reason</label>
                <textarea
                  id={`story-reject-${selectedPageNumber}`}
                  value={rejectionReason}
                  onChange={event => setRejectionReason(event.target.value)}
                  placeholder="Example: the source panel is obscured at the end checkpoint."
                  rows={3}
                  maxLength={500}
                />
                <button
                  type="button"
                  className="story-kitchen__button story-kitchen__button--reject"
                  onClick={rejectSelectedShot}
                  disabled={!onStoryReviewReject || !rejectionReason.trim()}
                  data-testid="button-reject-story-review"
                >
                  <X size={14} aria-hidden="true" />
                  Reject shot {String(selectedShot.pageNumber).padStart(2, '0')}
                </button>
              </div>
              <p className="story-kitchen__trust-note">
                <LockKeyhole size={12} aria-hidden="true" />
                This render remains Unreviewed until all 32 shots and the current audio mix are explicitly inspected.
              </p>
            </section>
          </aside>
        </div>
      )}

      {!selectedShot && (
        <div className="story-kitchen__empty" role="status">
          <Play size={20} aria-hidden="true" />
          <strong>Waiting for shot evidence</strong>
          <span>The studio will open the selected source/output comparison when the full review manifest arrives.</span>
        </div>
      )}
    </section>
  );
}

export default IllustrationStoryOpenKitchen;