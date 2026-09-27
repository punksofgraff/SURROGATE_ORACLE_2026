/**
 * SignalChaptersPanel — private, browser-local chapter collection for PRINTS.
 * Deliberate save only. No transcript auto-save. No output generation.
 */
import './SignalChaptersPanel.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignalChapters } from '../hooks/useSignalChapters';
import { exportChapter, newChapterDraft } from '../lib/signalChapters';
import type { ChapterDraft, SignalChapter, ChapterOutput } from '../lib/signalChapters';

export interface SignalChaptersPanelProps {
  draft: ChapterDraft | null;
  draftVersion: number;
  selectedId: string | null;
  onContinue: (chapter: SignalChapter) => void;
  onStartFresh: () => void;
  onDeleted: (id: string) => void;
  onSaved?: (chapter: SignalChapter) => void;
  continuationLocked?: boolean;
  onCapture?: () => void;
}

const MAX_TITLE = 100;
const MAX_SUMMARY = 1600;
const MAX_THREAD = 600;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface EditorState {
  draft: ChapterDraft;
  selectedOutputIds: string[];
  isNew: boolean;
}

function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'UNKNOWN DATE';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function snapshot(e: EditorState | null): string {
  if (!e) return '';
  const { title, summary, thread, threadKind } = e.draft;
  return JSON.stringify([title, summary, thread, threadKind, [...e.selectedOutputIds].sort()]);
}

export function SignalChaptersPanel({
  draft, draftVersion, selectedId, onContinue, onStartFresh, onDeleted, onSaved,
  continuationLocked = false, onCapture,
}: SignalChaptersPanelProps) {
  const { chapters, loading, error, reload, save, remove } = useSignalChapters();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [baseline, setBaseline] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SignalChapter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const lastVersionRef = useRef(draftVersion);

  const sorted = useMemo(
    () => [...chapters].sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0)),
    [chapters],
  );
  const persisted = useMemo(
    () => (editor ? chapters.find(c => c.id === editor.draft.id) ?? null : null),
    [chapters, editor],
  );
  const dirty = editor !== null && snapshot(editor) !== baseline;

  const openEditor = useCallback((next: EditorState) => {
    setEditor(next);
    setBaseline(next.isNew ? '' : snapshot(next));
    setSaveState('idle');
    setSaveError(null);
    setValidation(null);
    setDeleteError(null);
  }, []);

  // Ask before abandoning dirty edits
  const guard = useCallback((label: string, run: () => void) => {
    if (savingRef.current) return;
    if (dirty) setPending({ label, run });
    else run();
  }, [dirty]);

  // Refresh / navigation safety while dirty
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const openDraft = useCallback((d: ChapterDraft) => {
    openEditor({ draft: { ...d }, selectedOutputIds: d.outputs.filter(o => o.availability !== 'unavailable').map(o => o.id), isNew: true });
  }, [openEditor]);

  // draftVersion bump -> open captured draft once (never auto-save)
  useEffect(() => {
    if (draftVersion === lastVersionRef.current) return;
    lastVersionRef.current = draftVersion;
    if (!draft) return;
    const d = draft;
    guard('A new encounter capture is ready. Opening it will discard your unsaved edits.', () => openDraft(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftVersion]);

  const openChapter = (c: SignalChapter) => {
    guard(`Open "${c.title}"? Your unsaved edits will be discarded.`, () =>
      openEditor({ draft: { id: c.id, title: c.title, summary: c.summary, thread: c.thread, threadKind: c.threadKind, outputs: c.outputs }, selectedOutputIds: c.outputs.map(o => o.id), isNew: false }));
  };

  const newBlank = () => {
    guard('Start a blank chapter? Your unsaved edits will be discarded.', () => {
      openDraft({ ...newChapterDraft(), outputs: [] });
    });
  };

  const closeEditor = () => guard('Close the editor? Your unsaved edits will be discarded.', () => setEditor(null));

  const patch = (p: Partial<ChapterDraft>) => {
    if (!editor) return;
    setEditor({ ...editor, draft: { ...editor.draft, ...p } });
    if (saveState === 'saved' || saveState === 'error') setSaveState('idle');
    setValidation(null);
  };

  const toggleOutput = (id: string) => {
    if (!editor) return;
    const has = editor.selectedOutputIds.includes(id);
    setEditor({ ...editor, selectedOutputIds: has ? editor.selectedOutputIds.filter(x => x !== id) : [...editor.selectedOutputIds, id] });
    if (saveState === 'saved') setSaveState('idle');
  };

  const doSave = async () => {
    if (!editor || savingRef.current) return;
    const title = editor.draft.title.trim();
    const summary = editor.draft.summary.trim();
    if (!title) { setValidation('Give this chapter a title before saving.'); return; }
    if (!summary) { setValidation('Add a summary so future you knows what this chapter holds.'); return; }
    savingRef.current = true;
    setSaveState('saving');
    setSaveError(null);
    const payload: ChapterDraft = {
      ...editor.draft,
      title: title.slice(0, MAX_TITLE),
      summary: summary.slice(0, MAX_SUMMARY),
      thread: editor.draft.thread.trim().slice(0, MAX_THREAD),
      outputs: editor.draft.outputs.filter(o => editor.selectedOutputIds.includes(o.id)),
    };
    try {
      const saved = await save(payload);
      const next: EditorState = {
        draft: { id: saved.id, title: saved.title, summary: saved.summary, thread: saved.thread, threadKind: saved.threadKind, outputs: editor.draft.outputs },
        selectedOutputIds: saved.outputs.map(o => o.id),
        isNew: false,
      };
      setEditor(next);
      setBaseline(snapshot(next));
      setSaveState('saved');
      onSaved?.(saved);
    } catch (e) {
      setSaveState('error');
      setSaveError(e instanceof Error ? e.message : 'The browser could not store this chapter.');
    } finally {
      savingRef.current = false;
    }
  };

  const doDelete = async () => {
    if (!confirmDelete || deletingRef.current) return;
    const target = confirmDelete;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await remove(target.id);
      setConfirmDelete(null);
      if (editor?.draft.id === target.id) setEditor(null);
      setNotice(`"${target.title}" removed from this browser.`);
      onDeleted(target.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed. The chapter is still saved.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const doExport = (c: SignalChapter) => {
    const blob = new Blob([exportChapter(c)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'chapter';
    a.download = `signal-chapter-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const continueTarget = !error && persisted && !dirty ? persisted : null;
  const lockReason = 'Selection is locked after entry begins. Exit the encounter to change what carries forward.';
  const selectedChapter = selectedId ? chapters.find(c => c.id === selectedId) ?? null : null;

  return (
    <section className="sc" aria-label="Signal chapters" data-testid="signal-chapters">
      <header className="sc-head">
        <div>
          <span className="sc-kicker">PRINTS / PRIVATE CHAPTERS</span>
          <h2 className="sc-title">SIGNAL CHAPTERS</h2>
          <p className="sc-lede">Threads you chose to keep from the alley. Nothing is saved until you press save.</p>
        </div>
        <div className="sc-head__actions">
          {onCapture && (
            <button type="button" className="sc-btn sc-btn--ghost" onClick={onCapture} disabled={saveState === 'saving'} data-testid="chapter-capture">
              CAPTURE THIS ENCOUNTER
            </button>
          )}
          <button type="button" className="sc-btn" onClick={newBlank} disabled={saveState === 'saving'} data-testid="chapter-new">
            NEW CHAPTER
          </button>
        </div>
      </header>

      <p className="sc-privacy" data-testid="text-chapter-privacy">
        Saved only in this browser profile. Not synced to your wallet or other devices. Anyone using this browser profile can access these chapters. Export a backup; clearing site data removes them.
      </p>

      <div className="sc-carry" data-testid="status-continuation">
        <div className="sc-carry__state">
          <span className="sc-label">NEXT ENCOUNTER CARRIES</span>
          <strong>{selectedChapter ? selectedChapter.title : selectedId ? 'A chapter no longer in this browser' : 'Nothing — fresh start'}</strong>
        </div>
        <button
          type="button"
          className="sc-btn sc-btn--ghost"
          onClick={onStartFresh}
          disabled={continuationLocked}
          aria-describedby={continuationLocked ? 'sc-lock-note' : undefined}
          data-testid="chapter-start-fresh"
        >
          START FRESH — CARRY NO CHAPTER
        </button>
        {continuationLocked && <p id="sc-lock-note" className="sc-note">{lockReason}</p>}
      </div>

      {notice && <p className="sc-status sc-status--ok" role="status">{notice}</p>}

      {pending && (
        <div className="sc-confirm" role="alertdialog" aria-modal="false" aria-label="Unsaved edits" aria-describedby="sc-pending-msg">
          <p id="sc-pending-msg">{pending.label}</p>
          <div className="sc-row-actions">
            <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setPending(null)} autoFocus>KEEP EDITING</button>
            <button type="button" className="sc-btn sc-btn--danger" onClick={() => { const r = pending.run; setPending(null); r(); }}>DISCARD EDITS</button>
          </div>
        </div>
      )}

      <div className="sc-grid">
        {/* ── Collection ─────────────────────────────── */}
        <div className="sc-list" aria-busy={loading}>
          <span className="sc-label">COLLECTION · NEWEST FIRST</span>
          {error ? (
            <div className="sc-status sc-status--err" role="alert">
              <p>Chapters could not be read from this browser. They have not been deleted.</p>
              <button type="button" className="sc-btn" onClick={() => reload()} data-testid="chapter-reload">RETRY</button>
            </div>
          ) : loading && chapters.length === 0 ? (
            <div className="sc-skel" aria-label="Loading chapters">
              <span /><span /><span />
            </div>
          ) : sorted.length === 0 ? (
            <div className="sc-empty">
              <strong>NO CHAPTERS YET</strong>
              <p>Capture an encounter or start a blank chapter. The alley never writes here on its own.</p>
            </div>
          ) : (
            <ul className="sc-items">
              {sorted.map(c => {
                const open = editor?.draft.id === c.id;
                const sel = selectedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`sc-item${open ? ' sc-item--open' : ''}`}
                      onClick={() => openChapter(c)}
                      disabled={saveState === 'saving'}
                      aria-current={open ? 'true' : undefined}
                      data-testid={`chapter-item-${c.id}`}
                    >
                      <span className="sc-item__title">{c.title}</span>
                      <span className="sc-item__meta">
                        {c.threadKind.toUpperCase()} · {fmtDate(c.createdAt)}
                        {sel && <em className="sc-tag">CARRIED FORWARD</em>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Editor ─────────────────────────────────── */}
        <div className="sc-editor">
          {!editor ? (
            <div className="sc-empty">
              <strong>NO CHAPTER OPEN</strong>
              <p>Select a chapter to read, edit, export, or carry it into your next encounter.</p>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); void doSave(); }} noValidate>
              <div className="sc-editor__top">
                <span className="sc-label">{editor.isNew ? 'UNSAVED CHAPTER' : dirty ? 'EDITING · UNSAVED CHANGES' : 'SAVED CHAPTER'}</span>
                <button type="button" className="sc-link" onClick={closeEditor} disabled={saveState === 'saving'} data-testid="chapter-close">CLOSE</button>
              </div>

              <label className="sc-field">
                <span>TITLE <small>{editor.draft.title.length}/{MAX_TITLE}</small></span>
                <input value={editor.draft.title} maxLength={MAX_TITLE} required disabled={saveState === 'saving'} onChange={e => patch({ title: e.target.value })} data-testid="chapter-title" />
              </label>
              <label className="sc-field">
                <span>SUMMARY <small>{editor.draft.summary.length}/{MAX_SUMMARY}</small></span>
                <textarea rows={6} value={editor.draft.summary} maxLength={MAX_SUMMARY} required disabled={saveState === 'saving'} onChange={e => patch({ summary: e.target.value })} data-testid="chapter-summary" />
              </label>
              <label className="sc-field">
                <span>THREAD TO PICK UP <small>{editor.draft.thread.length}/{MAX_THREAD}</small></span>
                <textarea rows={3} value={editor.draft.thread} maxLength={MAX_THREAD} disabled={saveState === 'saving'} onChange={e => patch({ thread: e.target.value })} data-testid="chapter-thread" />
              </label>

              <fieldset className="sc-kind" disabled={saveState === 'saving'}>
                <legend>THREAD KIND</legend>
                {(['reflective', 'creative'] as const).map(k => (
                  <label key={k} className={editor.draft.threadKind === k ? 'is-on' : ''}>
                    <input type="radio" name="sc-kind" value={k} checked={editor.draft.threadKind === k} onChange={() => patch({ threadKind: k })} data-testid={`chapter-kind-${k}`} />
                    {k.toUpperCase()}
                  </label>
                ))}
              </fieldset>

              <fieldset className="sc-outputs" disabled={saveState === 'saving'}>
                <legend>OUTPUTS TO KEEP AS REFERENCES</legend>
                {editor.draft.outputs.length === 0 ? (
                  <p className="sc-note">No outputs attached. Nothing will be generated.</p>
                ) : editor.draft.outputs.map(o => (
                  <OutputRow key={o.id} output={o} checked={editor.selectedOutputIds.includes(o.id)} onToggle={() => toggleOutput(o.id)} />
                ))}
              </fieldset>

              <p className="sc-consent">
                Saving stores only the text above and the outputs you checked, as links. The conversation transcript is not saved, and nothing new is generated. Remote media may expire; a chapter only keeps its link.
              </p>

              {validation && <p className="sc-status sc-status--err" role="alert">{validation}</p>}
              {saveState === 'error' && (
                <div className="sc-status sc-status--err" role="alert">
                  <p>Not saved. {saveError} Your text is still here.</p>
                </div>
              )}
              {saveState === 'saved' && <p className="sc-status sc-status--ok" role="status" data-testid="status-chapter-saved">Saved to this browser.</p>}

              <div className="sc-row-actions">
                <button type="submit" className="sc-btn" disabled={saveState === 'saving'} aria-busy={saveState === 'saving'} data-testid="chapter-save">
                  {saveState === 'saving' ? 'SAVING…' : saveState === 'error' ? 'RETRY SAVE' : 'SAVE CHAPTER'}
                </button>
                {persisted && (
                  <>
                    <button
                      type="button"
                      className="sc-btn sc-btn--ghost"
                      disabled={!continueTarget || continuationLocked || selectedId === persisted.id}
                      onClick={() => continueTarget && onContinue(continueTarget)}
                      aria-describedby="sc-continue-note"
                      data-testid="chapter-continue"
                    >
                      {selectedId === persisted.id ? 'CARRIED INTO NEXT ENCOUNTER' : 'CONTINUE IN NEXT ENCOUNTER'}
                    </button>
                    <button type="button" className="sc-btn sc-btn--ghost" onClick={() => doExport(persisted)} data-testid="chapter-export">EXPORT JSON</button>
                    <button type="button" className="sc-btn sc-btn--danger" onClick={() => { setDeleteError(null); setConfirmDelete(persisted); }}
                      disabled={saveState === 'saving'} data-testid="chapter-delete">DELETE</button>
                  </>
                )}
              </div>
              {persisted && (
                <p id="sc-continue-note" className="sc-note">
                  {continuationLocked ? lockReason : dirty ? 'Save your edits first. Continue uses the saved version only.' : 'Continue carries the saved version of this chapter into your next encounter.'}
                </p>
              )}
            </form>
          )}

          {confirmDelete && (
            <div className="sc-confirm" role="alertdialog" aria-modal="false" aria-label={`Delete ${confirmDelete.title}`} aria-describedby="sc-delete-msg">
              <p id="sc-delete-msg">Delete <strong>"{confirmDelete.title}"</strong> from this browser? This removes the chapter text and its saved links. Original portraits, source media and hosted files are not affected and remain where they are.</p>
              {deleteError && <p className="sc-status sc-status--err" role="alert">{deleteError}</p>}
              <div className="sc-row-actions">
                <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setConfirmDelete(null)} disabled={deleting} autoFocus>CANCEL</button>
                <button type="button" className="sc-btn sc-btn--danger" onClick={() => void doDelete()} disabled={deleting} data-testid="chapter-delete-confirm">
                  {deleting ? 'DELETING…' : deleteError ? 'RETRY DELETE' : 'DELETE CHAPTER'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OutputRow({ output, checked, onToggle }: { output: ChapterOutput; checked: boolean; onToggle: () => void }) {
  const href = output.availability === 'unavailable' ? null : safeHttps(output.url);
  const badge = !href
    ? 'REFERENCE ONLY · BROWSER-ONLY, EXPIRED OR RESTRICTED MEDIA — FILE NOT SAVED'
    : output.availability === 'external'
      ? 'EXTERNAL LINK · MAY EXPIRE'
      : 'HOSTED REFERENCE · MAY BE REMOVED';
  return (
    <div className="sc-output">
      <label>
        <input type="checkbox" checked={checked} onChange={onToggle} data-testid={`chapter-output-${output.id}`} />
        <span>{output.label} <small>{output.kind}</small></span>
      </label>
      <span className={`sc-tag${!href ? ' sc-tag--muted' : ''}`}>{badge}</span>
      {href && (
        <a className="sc-link" href={href} target="_blank" rel="noopener noreferrer">OPEN LINK</a>
      )}
    </div>
  );
}
