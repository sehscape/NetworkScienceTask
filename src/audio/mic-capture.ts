// Served as a plain file from /public so every browser can load it with addModule().
const captureWorkletUrl = '/worklets/capture-processor.js';

export type MicErrorReason = 'denied' | 'no-device' | 'unsupported' | 'unknown';

export class MicError extends Error {
  constructor(public reason: MicErrorReason) {
    super(`Microphone unavailable: ${reason}`);
  }
}

/**
 * Microphone -> 16 kHz PCM16 chunks.
 * The capture context runs at the device's native rate; resampling happens in
 * the worklet. (Forcing a 16 kHz AudioContext breaks in Firefox when the mic
 * runs at 48 kHz.)
 */
export class MicCapture {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private muted = false;

  /** Smoothed input level, 0..1, for the UI. */
  level = 0;

  constructor(private onChunk: (pcm: ArrayBuffer) => void) {}

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new MicError('unsupported');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('no-device');
      throw new MicError('unknown');
    }

    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(captureWorkletUrl);

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { chunkMs: 40 },
    });

    this.node.port.onmessage = (event) => {
      const msg = event.data;
      const target = Math.min(1, msg.level * 4);
      this.level = this.level * 0.6 + target * 0.4;
      if (msg.type === 'chunk') this.onChunk(msg.pcm);
    };

    source.connect(this.node);
    this.node.port.postMessage({ type: 'mute', value: this.muted });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.node?.port.postMessage({ type: 'mute', value: muted });
    if (muted) this.level = 0;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    void this.ctx?.close();
    this.stream = undefined;
    this.node = undefined;
    this.ctx = undefined;
    this.level = 0;
  }
}
