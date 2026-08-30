import { useEffect, useId } from 'react';
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
  LoaderCircle,
  OctagonX,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { CreativeArtifact } from '../lib/creativeProduction';
import './CreativeArtifactCard.css';

export type CreativeArtifactCardProps = {
  artifact: CreativeArtifact;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onClose: () => void;
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

export function CreativeArtifactCard({
  artifact,
  onConfirm,
  onCancel,
  onRetry,
  onDownload,
  onPreview,
  onClose,
}: CreativeArtifactCardProps) {
  const titleId = useId();
  const descriptionId = useId();
  const status = artifact.status;
  const progress = Math.max(0, Math.min(100, Number(artifact.progress) || 0));
  const outputUrl = artifact.outputUrl;
  const metadataRecord = artifact.metadata as Record<string, unknown> | undefined;
  const hasOutput = Boolean(outputUrl);
  const hasMetadata = Boolean(metadataRecord && Object.keys(metadataRecord).length);
  const isDraft = status === 'draft';
  const isWorking = status === 'queued' || status === 'generating';
  const isRecoverable = status === 'failed' || status === 'cancelled' || status === 'partial';
  const canCancel = isDraft || isWorking;
  const canRetry = isRecoverable;
  const canOutput = (status === 'ready' || status === 'partial') && hasOutput;
  const previewType = outputKind(artifact.kind);
  const metadataEntries = hasMetadata
    ? Object.entries(metadataRecord ?? {}).slice(0, 4)
    : [];

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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

        {status === 'ready' && (
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

        {status === 'partial' && (
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