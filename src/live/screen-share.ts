import { bytesToBase64 } from '../audio/pcm-player';

export interface ScreenStats {
  sent: number;
  skipped: number;
  lastSentAt: number;
}

const MAX_SIDE = 1280; // policy wording is small print; don't shrink it too far
const FRAME_INTERVAL_MS = 1000; // Live API takes at most ~1 frame per second
const KEYFRAME_MS = 15_000; // resend an unchanged frame now and then so it stays in context
const CHANGE_THRESHOLD = 1.5; // mean abs difference (0-255) on a small grayscale thumbnail

export const canShareScreen = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/**
 * Captures a tab/window and forwards JPEG frames to the model.
 *
 * A policy document mostly sits still while people talk about it, so frames
 * are only sent when the picture actually changes (the caller scrolls, zooms,
 * switches pages). That keeps token usage, and therefore context pressure,
 * way down compared to blindly streaming 1 fps.
 */
export class ScreenShare {
  stream?: MediaStream;
  stats: ScreenStats = { sent: 0, skipped: 0, lastSentAt: 0 };

  private video = document.createElement('video');
  private canvas = document.createElement('canvas');
  private thumb = document.createElement('canvas');
  private sentThumb?: Uint8ClampedArray; // what the model last saw
  private timer?: number;
  private busy = false;

  constructor(
    private onFrame: (jpegBase64: string) => void,
    private onEnded: () => void,
    private onStats?: (stats: ScreenStats) => void,
  ) {
    this.video.muted = true;
    this.video.playsInline = true;
    this.thumb.width = 96;
    this.thumb.height = 54;
  }

  async start() {
    const options: DisplayMediaStreamOptions & Record<string, unknown> = {
      video: { frameRate: { ideal: 5, max: 10 } },
      audio: false,
      // Chrome hints: don't offer our own tab, but let people hop between tabs mid-share.
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    };

    this.stream = await navigator.mediaDevices.getDisplayMedia(options);
    const [track] = this.stream.getVideoTracks();
    track.addEventListener('ended', () => {
      this.stop();
      this.onEnded();
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    this.stats = { sent: 0, skipped: 0, lastSentAt: 0 };
    this.sentThumb = undefined;
    this.timer = window.setInterval(() => void this.tick(), FRAME_INTERVAL_MS);
    void this.tick();
    return this.stream;
  }

  /** Force the next tick to send, e.g. right after a session reconnects. */
  resendNextFrame() {
    this.sentThumb = undefined;
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
  }

  private async tick() {
    if (this.busy || !this.stream) return;
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return;

    this.busy = true;
    try {
      const thumb = this.grayscaleThumb();
      const changed = !this.sentThumb || meanDiff(thumb, this.sentThumb) > CHANGE_THRESHOLD;
      const stale = Date.now() - this.stats.lastSentAt > KEYFRAME_MS;
      if (!changed && !stale) {
        this.stats = { ...this.stats, skipped: this.stats.skipped + 1 };
        this.onStats?.(this.stats);
        return;
      }

      const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      this.canvas.width = Math.round(w * scale);
      this.canvas.height = Math.round(h * scale);
      this.canvas.getContext('2d')!.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob || !this.stream) return;

      this.onFrame(bytesToBase64(await blob.arrayBuffer()));
      // Compare against the last frame we *sent*, so a slow scroll still adds up to a change.
      this.sentThumb = thumb;
      this.stats = { ...this.stats, sent: this.stats.sent + 1, lastSentAt: Date.now() };
      this.onStats?.(this.stats);
    } finally {
      this.busy = false;
    }
  }

  private grayscaleThumb() {
    const ctx = this.thumb.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, 0, 0, this.thumb.width, this.thumb.height);
    const { data } = ctx.getImageData(0, 0, this.thumb.width, this.thumb.height);

    const gray = new Uint8ClampedArray(data.length / 4);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    return gray;
  }
}

function meanDiff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return diff / a.length;
}
