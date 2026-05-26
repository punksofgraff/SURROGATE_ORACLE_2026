/**
 * PCMPlayer.ts
 * 
 * High-performance, low-latency raw PCM audio player for the Web Audio API.
 * Designed for real-time streaming of audio chunks (e.g. from Gemini Live).
 * 
 * Supports queuing of Int16Array or Float32Array chunks and plays them
 * back with minimal jitter and zero intermediate file creation.
 */

export class PCMPlayer {
  private context: AudioContext;
  private sampleRate: number;
  private playbackRate: number;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private sourceNodes: AudioBufferSourceNode[] = [];

  private destination: AudioNode | null = null;

  /**
   * @param sampleRate  Input PCM sample rate (Gemini Live = 24000 Hz)
   * @param playbackRate  Playback speed multiplier. 1.0 = normal, 1.3 = 30% faster.
   *                      Values > 1 also raise pitch proportionally — acceptable for
   *                      the Charon voice which sits in the deep bass register.
   */
  constructor(sampleRate: number = 24000, playbackRate: number = 1.0) {
    this.sampleRate = sampleRate;
    this.playbackRate = playbackRate;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: this.sampleRate
    });
    this.destination = this.context.destination;
  }

  /**
   * Connect the player to an external node (e.g. an AnalyserNode for lip-sync).
   */
  public connect(node: AudioNode) {
    this.destination = node;
  }

  /**
   * Feed a chunk of raw PCM data to the player.
   * @param data Int16Array of PCM samples.
   */
  public feed(data: Int16Array) {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    // Convert Int16 to Float32 [-1.0, 1.0]
    const float32 = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32[i] = data[i] / 32768.0;
    }

    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;

    if (this.destination) {
      source.connect(this.destination);
      // Also connect to master destination if the external node doesn't
      if (this.destination !== this.context.destination) {
        source.connect(this.context.destination);
      }
    } else {
      source.connect(this.context.destination);
    }

    // Schedule playback to ensure no gaps between chunks
    const currentTime = this.context.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05; // small buffer to avoid clicks
    }

    source.start(this.nextStartTime);
    // Advance by actual playback duration (buffer.duration / playbackRate) so
    // back-to-back chunks stay gapless. Using buffer.duration alone would
    // over-shoot by (rate-1) seconds per chunk, leaving audible stutters.
    this.nextStartTime += buffer.duration / this.playbackRate;
    
    this.sourceNodes.push(source);
    
    // Clean up finished nodes
    source.onended = () => {
      const idx = this.sourceNodes.indexOf(source);
      if (idx > -1) this.sourceNodes.splice(idx, 1);
    };

    this.isPlaying = true;
  }

  /**
   * Stop all current and scheduled playback and clear the queue.
   */
  public stop() {
    this.sourceNodes.forEach(node => {
      try { node.stop(); } catch (e) { /* ignore already stopped */ }
    });
    this.sourceNodes = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }

  public close() {
    this.stop();
    this.context.close();
  }

  public getContext() {
    return this.context;
  }
}
