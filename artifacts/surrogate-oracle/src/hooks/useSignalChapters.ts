import { useCallback, useEffect, useState } from 'react';
import {
  readSignalChapters, saveSignalChapter, removeSignalChapter,
  SIGNAL_CHAPTERS_STORAGE_KEY, SIGNAL_CHAPTERS_CHANGE_EVENT,
  type ChapterDraft, type SignalChapter,
} from '../lib/signalChapters';

// Serializes cooperating tabs where Web Locks is available. Repositories still
// re-read within the critical section, never flushing a cached collection.
function mutateChapters<T>(mutation: () => T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(SIGNAL_CHAPTERS_STORAGE_KEY, mutation);
  }
  return Promise.resolve().then(mutation);
}

export function useSignalChapters(): {
  chapters: SignalChapter[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  save: (draft: ChapterDraft) => Promise<SignalChapter>;
  remove: (id: string) => Promise<void>;
} {
  const [chapters, setChapters] = useState<SignalChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    try {
      setChapters(readSignalChapters());
      setError(null);
    } catch (reason) {
      // Preserve last known state; never present storage corruption as an empty collection.
      setError(reason instanceof Error ? reason.message : 'Cannot load Signal Chapters');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SIGNAL_CHAPTERS_STORAGE_KEY || event.key === null) reload();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SIGNAL_CHAPTERS_CHANGE_EVENT, reload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SIGNAL_CHAPTERS_CHANGE_EVENT, reload);
    };
  }, [reload]);

  const save = useCallback(async (draft: ChapterDraft) => {
    const chapter = await mutateChapters(() => saveSignalChapter(draft));
    reload();
    return chapter;
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await mutateChapters(() => removeSignalChapter(id));
    reload();
  }, [reload]);

  return { chapters, loading, error, reload, save, remove };
}