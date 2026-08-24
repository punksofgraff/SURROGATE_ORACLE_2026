export type AudioVerification = {
  playable: boolean;
  anchorDurationSeconds: number | null;
  outputDurationSeconds: number | null;
  durationDeltaSeconds: number | null;
  audioStreamPresent: boolean;
  waveformCompared: boolean;
  waveformMatch: boolean | null;
  method: string;
};

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function boxType(bytes: Uint8Array, offset: number): string {
  return new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
}

export function mp4DurationAndAudio(bytes: Uint8Array): {
  durationSeconds: number | null;
  audioStreamPresent: boolean;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let movieTimescale = 0;
  let movieDuration = 0;
  let audioStreamPresent = false;
  const walk = (start: number, end: number, inAudioTrack = false) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = readU32(view, offset);
      const type = boxType(bytes, offset);
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        size = readU32(view, offset + 8) * 2 ** 32 + readU32(view, offset + 12);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) break;
      const body = offset + header;
      const child = type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl';
      let trackIsAudio = inAudioTrack;
      if (type === 'hdlr' && body + 12 <= offset + size) {
        trackIsAudio = new TextDecoder().decode(bytes.subarray(body + 8, body + 12)) === 'soun';
        if (trackIsAudio) audioStreamPresent = true;
      }
      if (type === 'mvhd' && body + 20 <= offset + size) {
        const version = bytes[body];
        const timescaleOffset = version === 1 ? body + 20 : body + 12;
        const durationOffset = version === 1 ? body + 24 : body + 16;
        if (durationOffset + (version === 1 ? 8 : 4) <= offset + size) {
          movieTimescale = readU32(view, timescaleOffset);
          movieDuration = version === 1
            ? readU32(view, durationOffset) * 2 ** 32 + readU32(view, durationOffset + 4)
            : readU32(view, durationOffset);
        }
      }
      if (child) walk(body, offset + size, trackIsAudio);
      offset += size;
    }
  };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(4, 8)) === 'ftyp') walk(0, bytes.length);
  return {
    durationSeconds: movieTimescale > 0 ? movieDuration / movieTimescale : null,
    audioStreamPresent,
  };
}

// MPEG frame headers provide reliable timing without requiring a decoder in Edge.
export function mp3Duration(bytes: Uint8Array): number | null {
  let offset = 0;
  let duration = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length && frames < 500000) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset++; continue; }
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    const padding = (bytes[offset + 2] >> 1) & 1;
    if (layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3 || version === 1) { offset++; continue; }
    const rates = version === 3 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const kbps = version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIndex]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160][bitrateIndex];
    const frameLength = Math.floor((version === 3 ? 144 : 72) * kbps * 1000 / rates[sampleIndex]) + padding;
    if (frameLength < 5 || offset + frameLength > bytes.length) { offset++; continue; }
    duration += (version === 3 ? 1152 : 576) / rates[sampleIndex];
    offset += frameLength;
    frames++;
  }
  return frames ? duration : null;
}

export function verifyOutputAudio(outputBytes: Uint8Array, anchorBytes: Uint8Array): AudioVerification {
  const output = mp4DurationAndAudio(outputBytes);
  const anchorDuration = mp3Duration(anchorBytes);
  const delta = anchorDuration !== null && output.durationSeconds !== null
    ? Math.abs(anchorDuration - output.durationSeconds) : null;
  return {
    playable: output.audioStreamPresent && output.durationSeconds !== null,
    anchorDurationSeconds: anchorDuration,
    outputDurationSeconds: output.durationSeconds,
    durationDeltaSeconds: delta,
    audioStreamPresent: output.audioStreamPresent,
    waveformCompared: false,
    waveformMatch: null,
    method: 'mp4-audio-track-and-mp3-frame-timing',
  };
}

export function isAudioVerificationAcceptable(verification: AudioVerification): boolean {
  return verification.playable
    && verification.audioStreamPresent
    && verification.anchorDurationSeconds !== null
    && verification.durationDeltaSeconds !== null
    && verification.durationDeltaSeconds <= Math.max(0.75, verification.anchorDurationSeconds * 0.05);
}