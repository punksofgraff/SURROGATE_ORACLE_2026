import React from 'react';
import { Archive, CalendarDays, ChevronRight, FileText, Image as ImageIcon, Video, X } from 'lucide-react';
import type { ArchivedDocumentReadout } from '../lib/documentArchive';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function kindIcon(kind: ArchivedDocumentReadout['kind']) {
  if (kind === 'image') return <ImageIcon size={16} />;
  if (kind === 'video') return <Video size={16} />;
  return <FileText size={16} />;
}

export function DocumentArchive({
  entries,
  onOpen,
  onClose,
}: {
  entries: ArchivedDocumentReadout[];
  onOpen: (entry: ArchivedDocumentReadout) => void;
  onClose: () => void;
}) {
  return (
    <div className="oracle-document-archive" role="dialog" aria-modal="true" aria-labelledby="document-archive-title">
      <div className="oracle-document-archive__panel">
        <div className="oracle-document-archive__header">
          <div>
            <div className="oracle-document-archive__eyebrow"><Archive size={16} /> PRIVATE READOUT ARCHIVE</div>
            <h2 id="document-archive-title">Saved signal readouts</h2>
            <p>Only readouts you chose to save appear here. Original files remain local and are never archived.</p>
          </div>
          <button type="button" className="oracle-document-card__close" onClick={onClose} aria-label="Close readout archive"><X size={18} /></button>
        </div>
        {entries.length === 0 ? (
          <div className="oracle-document-archive__empty">
            <Archive size={28} />
            <strong>THE ARCHIVE IS QUIET</strong>
            <span>Save a document readout after a local analysis to find it here later.</span>
          </div>
        ) : (
          <div className="oracle-document-archive__list">
            {entries.map((entry) => (
              <button type="button" className="oracle-document-archive__entry" key={entry.id} onClick={() => onOpen(entry)}>
                <span className="oracle-document-archive__entry-icon">{kindIcon(entry.kind)}</span>
                <span className="oracle-document-archive__entry-copy">
                  <strong>{entry.name}</strong>
                  <small><CalendarDays size={12} /> {formatDate(entry.savedAt)} · {entry.kind.toUpperCase()}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
