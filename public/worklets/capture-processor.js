/**
 * Runs on the audio thread. Takes the mic at whatever rate the device gives us
 * (usually 48 kHz), downsamples to the 16 kHz mono PCM16 that Gemini Live
 * expects, and posts fixed-size chunks back to the main thread.
 *
 * Downsampling uses a box average over each output period, which doubles as a
 * cheap low-pass filter. Good enough for speech, and allocation-free.
 */
const TARGET_RATE = 16000;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkMs = options?.processorOptions?.chunkMs ?? 20;
    this.ratio = sampleRate / TARGET_RATE;
    this.chunk = new Int16Array(Math.round((TARGET_RATE * chunkMs) / 1000));
    this.filled = 0;
    this.phase = 0;
    this.acc = 0;
    this.accCount = 0;
    this.energy = 0;
    this.energyCount = 0;
    this.muted = false;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'mute') this.muted = !!event.data.value;
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      this.energy += sample * sample;
      this.energyCount++;

      this.acc += sample;
      this.accCount++;
      this.phase += 1;

      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const avg = this.acc / this.accCount;
        this.acc = 0;
        this.accCount = 0;

        const clamped = Math.max(-1, Math.min(1, avg));
        this.chunk[this.filled++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

        if (this.filled === this.chunk.length) this.flush();
      }
    }
    return true;
  }

  flush() {
    const level = Math.sqrt(this.energy / Math.max(1, this.energyCount));
    this.energy = 0;
    this.energyCount = 0;
    this.filled = 0;

    if (this.muted) {
      this.port.postMessage({ type: 'level', level: 0 });
      return;
    }

    const pcm = this.chunk.slice().buffer;
    this.port.postMessage({ type: 'chunk', pcm, level }, [pcm]);
  }
}

registerProcessor('capture-processor', CaptureProcessor);
