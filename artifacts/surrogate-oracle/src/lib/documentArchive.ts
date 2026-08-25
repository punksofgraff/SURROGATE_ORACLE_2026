export type ArchivedDocumentReadout = {
  id: string;
  name: string;
  kind: 'text' | 'pdf' | 'docx' | 'image' | 'video';
  text: string;
  detail: string;
  savedAt: string;
  dimensions?: string;
  duration?: number;
};

const ARCHIVE_PREFIX = 'surrogate_document_readouts_v1_';

function storageKey(seekerKey: string) {
  return `${ARCHIVE_PREFIX}${encodeURIComponent(seekerKey)}`;
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadDocumentArchive(seekerKey: string | null): ArchivedDocumentReadout[] {
  if (!seekerKey || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(seekerKey));
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function saveDocumentReadout(
  seekerKey: string | null,
  readout: Omit<ArchivedDocumentReadout, 'id' | 'savedAt'>,
): ArchivedDocumentReadout | null {
  if (!seekerKey || typeof localStorage === 'undefined') return null;
  const entry: ArchivedDocumentReadout = { ...readout, id: makeId(), savedAt: new Date().toISOString() };
  const next = [entry, ...loadDocumentArchive(seekerKey)].slice(0, 50);
  try {
    localStorage.setItem(storageKey(seekerKey), JSON.stringify(next));
    return entry;
  } catch {
    return null;
  }
}
