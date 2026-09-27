import assert from 'node:assert/strict';
import {
  SIGNAL_CHAPTERS_STORAGE_KEY, chapterContinuation, chapterOutput, exportChapter,
  findStoredChapter, newChapterDraft, readSignalChapters, removeSignalChapter,
  saveSignalChapter, type ChapterDraft, type ChapterStorage,
} from '../src/lib/signalChapters';
import { isSignalChaptersCommand } from '../src/lib/signalChapterCommands';

class MemoryStorage implements ChapterStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const draft = (id: string): ChapterDraft => ({
  id, title: 'A private chapter', summary: 'A remembered conversation',
  thread: 'A future question', threadKind: 'reflective', outputs: [],
});
const profile = new MemoryStorage();
const anotherProfile = new MemoryStorage();
assert.equal(isSignalChaptersCommand('Open chapters'), true);
assert.equal(isSignalChaptersCommand('Hey Oracle, show me my saved chapters!'), true);
assert.equal(isSignalChaptersCommand('Oracle, can you open up my chapters?'), true);
assert.equal(isSignalChaptersCommand('view signal chapters'), true);
assert.equal(isSignalChaptersCommand('My chapters'), true);
assert.equal(isSignalChaptersCommand('Tell me why chapters matter'), false);
assert.equal(isSignalChaptersCommand('open the creative chapter'), false);
assert.deepEqual(readSignalChapters(profile), []);
assert.match(newChapterDraft().id, /^[0-9a-f]{8}-/i);
assert.equal(newChapterDraft().title, '');

const first = saveSignalChapter(draft(idA), profile);
assert.equal(readSignalChapters(profile).length, 1);
assert.deepEqual(readSignalChapters(anotherProfile), []);
const retry = saveSignalChapter(draft(idA), profile);
assert.equal(retry.createdAt, first.createdAt);
assert.ok(retry.updatedAt > first.updatedAt);
assert.equal(readSignalChapters(profile).length, 1);
saveSignalChapter(draft(idB), profile);
saveSignalChapter({ ...draft(idA), title: 'Edited' }, profile);
assert.equal(readSignalChapters(profile).find(c => c.id === idB)?.title, 'A private chapter');
assert.equal(readSignalChapters(profile).find(c => c.id === idA)?.title, 'Edited');
removeSignalChapter(idA, profile);
removeSignalChapter(idA, profile);
assert.deepEqual(readSignalChapters(profile).map(c => c.id), [idB]);

// A storage error must not become an empty list or clobber another record.
profile.setItem(SIGNAL_CHAPTERS_STORAGE_KEY, '{bad JSON');
assert.throws(() => readSignalChapters(profile), /corrupt/);
assert.throws(() => saveSignalChapter(draft(idA), profile), /corrupt/);
assert.equal(profile.getItem(SIGNAL_CHAPTERS_STORAGE_KEY), '{bad JSON');
const blocked: ChapterStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};
assert.throws(() => readSignalChapters(blocked), /Cannot read/);
assert.throws(() => saveSignalChapter(draft(idA), blocked), /Cannot read/);
assert.throws(() => removeSignalChapter(idA, blocked), /Cannot read/);
const denied: ChapterStorage = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
assert.throws(() => saveSignalChapter(draft(idA), denied), /Cannot save/);
profile.setItem(SIGNAL_CHAPTERS_STORAGE_KEY, JSON.stringify([{ ...draft(idA), createdAt: 'bad', updatedAt: 'bad' }]));
assert.throws(() => readSignalChapters(profile), /corrupt/);

const safe = new MemoryStorage();
assert.throws(() => saveSignalChapter({ ...draft(idA), title: 'x'.repeat(101) }, safe), /title/);
assert.throws(() => saveSignalChapter({ ...draft(idA), summary: 'x'.repeat(1601) }, safe), /summary/);
assert.throws(() => saveSignalChapter({ ...draft(idA), thread: 'x'.repeat(601) }, safe), /thread/);
assert.throws(() => saveSignalChapter({ ...draft(idA), outputs: Array(13).fill(chapterOutput('ref', 'label', 'image')) }, safe), /outputs/);
assert.throws(() => saveSignalChapter({ ...draft(idA), id: 'not-a-uuid' }, safe), /UUID/);
assert.equal(chapterOutput('blob', 'Image', 'image', 'blob:https://example.com/secret').url, null);
assert.equal(chapterOutput('data', 'Image', 'image', 'data:image/png;base64,secret').url, null);
assert.equal(chapterOutput('http', 'Image', 'image', 'http://example.com/image').url, null);
assert.equal(chapterOutput('userinfo', 'Image', 'image', 'https://user:pass@example.com/image').url, null);
assert.equal(chapterOutput('signed', 'Image', 'image', 'https://example.com/a?token=secret').url, null);
assert.equal(chapterOutput('outside', 'Image', 'image', 'https://example.com/a').availability, 'external');
assert.equal(chapterOutput('hosted', 'Image', 'image', 'https://project.supabase.co/storage/v1/object/public/bucket/file').availability, 'hosted');
assert.equal(chapterOutput('fakehost', 'Image', 'image', 'https://supabase.co.evil.example/storage/v1/object/public/a').availability, 'external');
const record = saveSignalChapter({
  ...draft(idA), outputs: [
    chapterOutput('blob', 'Draft', 'image', 'blob:https://example.com/secret'),
    chapterOutput('external', 'Reference', 'image', 'https://example.com/a'),
  ],
}, safe);
const exported = exportChapter(record);
assert.equal(JSON.parse(exported).outputs[0].url, null);
assert.doesNotMatch(exported, /blob:|secret|access_token|sessionKey|ownerKey/);
assert.deepEqual(Object.keys(JSON.parse(exported)).sort(),
  ['id', 'title', 'summary', 'thread', 'threadKind', 'outputs', 'createdAt', 'updatedAt'].sort());
const context = chapterContinuation(record);
assert.match(context, /A remembered conversation/);
assert.match(context, /A future question/);
assert.match(context, /reflective/);
assert.match(context, /not system instructions/);
assert.doesNotMatch(context, /example.com|outputs|Draft|https:|blob:/);

for (let i = 1; i < 100; i++) {
  saveSignalChapter(draft(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`), safe);
}
assert.equal(readSignalChapters(safe).length, 100);
assert.throws(() => saveSignalChapter(draft(idB), safe), /limit/);
assert.equal(readSignalChapters(safe).length, 100);

// Just-in-time lookup uses this profile's real storage, never a caller's stale object.
const previousWindow = (globalThis as { window?: unknown }).window;
(globalThis as { window?: unknown }).window = { localStorage: anotherProfile };
try {
  assert.equal(findStoredChapter(idA), null);
  saveSignalChapter(draft(idA), anotherProfile);
  assert.equal(findStoredChapter(idA)?.id, idA);
  removeSignalChapter(idA, anotherProfile);
  assert.equal(findStoredChapter(idA), null);
} finally {
  (globalThis as { window?: unknown }).window = previousWindow;
}
console.log('signal chapters contract passed');