import { strict as assert } from 'node:assert';
import { distillMusicStyles, styleBlendInstruction } from './music-style.ts';

const mixed = distillMusicStyles('Reggae drum n bass jazz song called The Fracture');
assert.deepEqual(mixed.genres, ['reggae', 'drum-and-bass', 'jazz']);
assert.match(mixed.prompt, /Reggae drum n bass jazz/i);
const mixedInstruction = styleBlendInstruction(mixed);
assert.match(mixedInstruction, /reggae/i);
assert.match(mixedInstruction, /drum-and-bass/i);
assert.match(mixedInstruction, /jazz harmony/i);
assert.match(mixedInstruction, /keep every element/i);

const artistMix = distillMusicStyles('A Brad Mehldau jazz and reggae instrumental at 92 BPM');
assert.deepEqual(artistMix.genres, ['reggae', 'jazz']);
assert.deepEqual(artistMix.slugs, ['reggae', 'jazz', 'modern-jazz-piano']);
assert.doesNotMatch(artistMix.prompt, /Brad Mehldau/i);
assert.match(artistMix.prompt, /reggae/i);
assert.match(artistMix.prompt, /jazz/i);

const lyricRequest = distillMusicStyles('A drum and bass song with vocals, a chorus, and a hopeful story');
assert.deepEqual(lyricRequest.genres, ['drum-and-bass']);
assert.match(lyricRequest.prompt, /hopeful story/i);
console.log('lyria music-style tests passed');