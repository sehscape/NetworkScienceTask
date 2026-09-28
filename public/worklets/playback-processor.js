/**
 * Plays the model's 24 kHz PCM as it streams in.
 *
 * A tiny jitter buffer (prebufferMs) smooths out network bursts at the start
 * of each reply. `clear` drops everything instantly, which is what makes
 * barge-in feel natural: the moment the caller talks over the assistant, it
 * goes quiet instead of finishing the sentence from its buffer.
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const prebufferMs = options?.processorOptions?.prebufferMs ?? 80;
    this.prebuffer = Math.round((sampleRate * prebufferMs) / 1000);
    this.queue = [];
    this.queued = 0;
    this.current = null;
    this.offset = 0;
    this.playing = false;
    this.waitingSince = -1;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'push') {
        this.queue.push(msg.samples);
        this.queued += msg.samples.length;
      } else if (msg.type === 'clear') {
        this.queue.length = 0;
        this.queued = 0;
        this.current = null;
        this.offset = 0;
        this.waitingSince = -1;
        this.setPlaying(false);
      }
    };
  }

  setPlaying(value) {
    if (value === this.playing) return;
    this.playing = value;
    this.port.postMessage({ type: 'state', playing: value });
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];

    if (!this.playing) {
      if (this.queued === 0) return true;
      if (this.waitingSince < 0) this.waitingSince = currentTime;
      // Wait for a little audio to build up, but never longer than 150 ms.
      const waited = currentTime - this.waitingSince;
      if (this.queued < this.prebuffer && waited < 0.15) return true;
      this.waitingSince = -1;
      this.setPlaying(true);
    }

    let written = 0;
    while (written < out.length) {
      if (!this.current) {
        this.current = this.queue.shift() ?? null;
        this.offset = 0;
        if (!this.current) break;
      }
      const n = Math.min(out.length - written, this.current.length - this.offset);
      out.set(this.current.subarray(this.offset, this.offset + n), written);
      written += n;
      this.offset += n;
      this.queued -= n;
      if (this.offset >= this.current.length) this.current = null;
    }

    if (written < out.length) this.setPlaying(false);
    return true;
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
