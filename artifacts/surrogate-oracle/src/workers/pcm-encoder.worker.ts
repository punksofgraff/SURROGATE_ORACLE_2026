// Web Worker for encoding PCM chunks to a WAV Blob URL
// This offloads the heavy Int16Array concatenation and ArrayBuffer manipulation
// from the main V8 thread, preventing GC stutters during Oracle responses.

self.onmessage = (e: MessageEvent<{ chunks: Int16Array[]; sampleRate: number }>) => {
  const { chunks, sampleRate } = e.data;
  
  if (!chunks || chunks.length === 0) {
    self.postMessage({ audioUrl: '' });
    return;
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = combined.buffer.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(combined);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(blob);
  
  self.postMessage({ audioUrl });
};
