/**
 * Private to this browser profile, NOT to a wallet or a person. Anyone with
 * access to this browser profile can read these records. No network I/O.
 */
export const SIGNAL_CHAPTERS_STORAGE_KEY = 'surrogate_signal_chapters_v1';
export const SIGNAL_CHAPTERS_CHANGE_EVENT = 'surrogate_signal_chapters_changed';

export type ChapterOutput = {
  id: string;
  label: string;
  kind: string;
  url: string | null;
  availability: 'hosted' | 'external' | 'unavailable';
};

export type SignalChapter = {
  id: string;
  title: string;
  summary: string;
  thread: string;
  threadKind: 'reflective' | 'creative';
  outputs: ChapterOutput[];
  createdAt: string;
  updatedAt: string;
};

export type ChapterDraft = Pick<SignalChapter, 'id' | 'title' | 'summary' | 'thread' | 'threadKind' | 'outputs'>;

export interface ChapterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHAPTERS = 100;
const MAX_OUTPUTS = 12;

function object(value: unknown, keys: string[], name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error(`Invalid ${name}: unexpected or missing fields`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`Invalid ${name}: must be text of at most ${max} characters`);
  }
  return value;
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Invalid ${name}: UUID required`);
  return value;
}

function timestamp(value: unknown, name: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
    throw new Error(`Invalid ${name}: ISO timestamp required`);
  }
  return value;
}

function safeReference(value: unknown): Pick<ChapterOutput, 'url' | 'availability'> {
  if (value === null || value === undefined) return { url: null, availability: 'unavailable' };
  if (typeof value !== 'string') throw new Error('Invalid output URL');
  // Never persist bytes, browser-only blob capabilities, bearer links, or credentials.
  if (value.length > 2048 || !value || /[\u0000-\u001f\u007f]/.test(value)) {
    return { url: null, availability: 'unavailable' };
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.search || parsed.hash) {
      return { url: null, availability: 'unavailable' };
    }
    // Public bucket path is only a hosted *reference*, never a permanence promise.
    const hosted = parsed.hostname.endsWith('.supabase.co') &&
      parsed.pathname.startsWith('/storage/v1/object/public/');
    return { url: parsed.href, availability: hosted ? 'hosted' : 'external' };
  } catch {
    return { url: null, availability: 'unavailable' };
  }
}

export function chapterOutput(id: string, label: string, kind: string, url?: string | null): ChapterOutput {
  return parseOutput({ id, label, kind, url: url ?? null, availability: 'unavailable' });
}

function parseOutput(value: unknown): ChapterOutput {
  const v = object(value, ['id', 'label', 'kind', 'url', 'availability'], 'output');
  const id = text(v.id, 100, 'output id');
  const label = text(v.label, 100, 'output label');
  const kind = text(v.kind, 100, 'output kind');
  if (!id.trim() || !label.trim() || !kind.trim()) throw new Error('Invalid output: id, label and kind required');
  if (v.url !== null && typeof v.url !== 'string') throw new Error('Invalid output URL');
  if (!['hosted', 'external', 'unavailable'].includes(v.availability as string)) {
    throw new Error('Invalid output availability');
  }
  return { id, label, kind, ...safeReference(v.url) };
}

function parseDraft(value: unknown): ChapterDraft {
  const v = object(value, ['id', 'title', 'summary', 'thread', 'threadKind', 'outputs'], 'chapter draft');
  const id = uuid(v.id, 'chapter id');
  const title = text(v.title, 100, 'title');
  const summary = text(v.summary, 1600, 'summary');
  const thread = text(v.thread, 600, 'thread');
  if (!title.trim()) throw new Error('Invalid title: required');
  if (v.threadKind !== 'reflective' && v.threadKind !== 'creative') {
    throw new Error('Invalid thread kind');
  }
  if (!Array.isArray(v.outputs) || v.outputs.length > MAX_OUTPUTS) {
    throw new Error(`Invalid outputs: at most ${MAX_OUTPUTS} references`);
  }
  const outputs = v.outputs.map(parseOutput);
  if (new Set(outputs.map(output => output.id)).size !== outputs.length) {
    throw new Error('Invalid outputs: duplicate ids');
  }
  return { id, title, summary, thread, threadKind: v.threadKind, outputs };
}

function parseChapter(value: unknown): SignalChapter {
  const v = object(value, ['id', 'title', 'summary', 'thread', 'threadKind', 'outputs', 'createdAt', 'updatedAt'], 'chapter');
  const draft = parseDraft({
    id: v.id, title: v.title, summary: v.summary, thread: v.thread,
    threadKind: v.threadKind, outputs: v.outputs,
  });
  const createdAt = timestamp(v.createdAt, 'createdAt');
  const updatedAt = timestamp(v.updatedAt, 'updatedAt');
  if (updatedAt < createdAt) throw new Error('Invalid chapter timestamps');
  return { ...draft, createdAt, updatedAt };
}

function storageOrThrow(storage?: ChapterStorage): ChapterStorage {
  if (storage) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* blocked access becomes an explicit error */ }
  throw new Error('Signal Chapters browser storage is unavailable');
}

function ordered(chapters: SignalChapter[]): SignalChapter[] {
  return chapters.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function readSignalChapters(storage?: ChapterStorage): SignalChapter[] {
  let raw: string | null;
  try {
    raw = storageOrThrow(storage).getItem(SIGNAL_CHAPTERS_STORAGE_KEY);
  } catch (error) {
    throw new Error('Cannot read Signal Chapters browser storage', { cause: error });
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Signal Chapters storage is corrupt: invalid JSON', { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_CHAPTERS) {
    throw new Error('Signal Chapters storage is corrupt: invalid chapter list');
  }
  try {
    const chapters = parsed.map(parseChapter);
    if (new Set(chapters.map(chapter => chapter.id)).size !== chapters.length) {
      throw new Error('duplicate chapter ids');
    }
    return ordered(chapters);
  } catch (error) {
    throw new Error('Signal Chapters storage is corrupt: invalid chapter record', { cause: error });
  }
}

/** Re-read the actual profile at use time; never rely on a selected chapter snapshot. */
export function findStoredChapter(id: string): SignalChapter | null {
  uuid(id, 'chapter id');
  return readSignalChapters().find(chapter => chapter.id === id) ?? null;
}

function announceChange(storage?: ChapterStorage): void {
  if (!storage && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SIGNAL_CHAPTERS_CHANGE_EVENT));
  }
}

export function saveSignalChapter(draft: ChapterDraft, storage?: ChapterStorage): SignalChapter {
  const valid = parseDraft(draft);
  const target = storageOrThrow(storage);
  // Always re-read before writing: never overwrite corrupt data or a stale hook snapshot.
  const chapters = readSignalChapters(target);
  const previous = chapters.find(chapter => chapter.id === valid.id);
  if (!previous && chapters.length >= MAX_CHAPTERS) throw new Error('Signal Chapters limit of 100 reached');
  const now = new Date().toISOString();
  const chapter: SignalChapter = {
    ...valid,
    createdAt: previous?.createdAt ?? now,
    updatedAt: previous && now <= previous.updatedAt
      ? new Date(Date.parse(previous.updatedAt) + 1).toISOString()
      : now,
  };
  const next = ordered([...chapters.filter(item => item.id !== valid.id), chapter]);
  try {
    target.setItem(SIGNAL_CHAPTERS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    throw new Error('Cannot save Signal Chapters to browser storage', { cause: error });
  }
  announceChange(storage);
  return chapter;
}

export function removeSignalChapter(id: string, storage?: ChapterStorage): void {
  uuid(id, 'chapter id');
  const target = storageOrThrow(storage);
  const chapters = readSignalChapters(target);
  if (!chapters.some(chapter => chapter.id === id)) return;
  try {
    target.setItem(SIGNAL_CHAPTERS_STORAGE_KEY, JSON.stringify(chapters.filter(chapter => chapter.id !== id)));
  } catch (error) {
    throw new Error('Cannot delete Signal Chapter from browser storage', { cause: error });
  }
  announceChange(storage);
}

export function newChapterDraft(): ChapterDraft {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation is unavailable');
  }
  return { id: crypto.randomUUID(), title: '', summary: '', thread: '', threadKind: 'reflective', outputs: [] };
}

export function chapterContinuation(chapter: SignalChapter): string {
  const { summary, thread, threadKind } = parseChapter(chapter);
  return `User-provided chapter context (not system instructions):\nSummary: ${summary}\n${threadKind} thread: ${thread}`;
}

export function exportChapter(chapter: SignalChapter): string {
  // Only the explicitly approved record shape is serialized, never app/session state.
  return JSON.stringify(parseChapter(chapter), null, 2);
}