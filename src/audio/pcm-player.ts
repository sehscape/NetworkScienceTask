// Served as a plain file from /public so every browser can load it with addModule().
const playbackWorkletUrl = '/worklets/playback-processor.js';

const OUTPUT_RATE = 24000;

/** Streams Gemini's 24 kHz PCM16 output to the speakers. */
export class PcmPlayer {
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(512);

  playing = false;
  onPlayingChange?: (playing: boolean) => void;

  async start() {
    this.ctx = new AudioContext({ sampleRate: OUTPUT_RATE, latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(playbackWorkletUrl);

    this.node = new AudioWorkletNode(this.ctx, 'playback-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { prebufferMs: 80 },
    });
    this.node.port.onmessage = (event) => {
      if (event.data?.type === 'state') {
        this.playing = event.data.playing;
        this.onPlayingChange?.(this.playing);
      }
    };

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.node.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Created inside the "Start call" click, but some browsers still start suspended.
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /** Accepts base64 PCM16 little-endian, straight from the Live API. */
  enqueue(base64: string) {
    if (!this.node) return;
    const bytes = base64ToBytes(base64);
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 0x8000;
    this.node.port.postMessage({ type: 'push', samples: floats }, [floats.buffer]);
  }

  /** Drop everything that hasn't been played yet (barge-in). */
  interrupt() {
    this.node?.port.postMessage({ type: 'clear' });
  }

  /** Current output loudness, 0..1. */
  get level() {
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i] * this.samples[i];
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  stop() {
    this.node?.disconnect();
    this.analyser?.disconnect();
    void this.ctx?.close();
    this.node = undefined;
    this.analyser = undefined;
    this.ctx = undefined;
    this.playing = false;
  }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
