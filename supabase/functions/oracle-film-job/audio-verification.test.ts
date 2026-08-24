import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isAudioVerificationAcceptable, verifyOutputAudio } from './audio-verification.ts';

function fixtureAudio(dir: string): Uint8Array {
  const path = join(dir, 'anchor.mp3');
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:a', 'libmp3lame', '-b:a', '128k', path,
  ]);
  return new Uint8Array(readFileSync(path));
}

function fixtureVideo(dir: string, audio: Uint8Array | null, duration = 2): Uint8Array {
  const audioPath = join(dir, 'anchor.mp3');
  const outputPath = join(dir, audio ? `video-${duration}.mp4` : 'silent.mp4');
  if (audio) writeFileSync(audioPath, audio);
  const args = [
    '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=64x64:d=${duration}`,
    ...(audio ? ['-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-shortest'] : ['-an']),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath,
  ];
  execFileSync('ffmpeg', args);
  return new Uint8Array(readFileSync(outputPath));
}

test('accepts an audio-bearing RunPod MP4 when duration is aligned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-film-audio-'));
  try {
    const anchor = fixtureAudio(dir);
    const result = verifyOutputAudio(fixtureVideo(dir, anchor), anchor);
    assert.equal(result.audioStreamPresent, true);
    assert.ok(result.durationDeltaSeconds !== null && result.durationDeltaSeconds <= 0.75);
    assert.equal(isAudioVerificationAcceptable(result), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects silent and truncated provider output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oracle-film-audio-'));
  try {
    const anchor = fixtureAudio(dir);
    const silent = verifyOutputAudio(fixtureVideo(dir, null), anchor);
    assert.equal(isAudioVerificationAcceptable(silent), false);
    const truncated = verifyOutputAudio(fixtureVideo(dir, anchor, 1), anchor);
    assert.equal(truncated.audioStreamPresent, true);
    assert.equal(isAudioVerificationAcceptable(truncated), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});