import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';
import { MicCapture, MicError } from '../audio/mic-capture';
import { PcmPlayer, bytesToBase64 } from '../audio/pcm-player';
import { openDocChannel } from '../lib/doc-channel';
import { cleanSpaces } from '../lib/format';
import { emptyCase, runTool, type CaseState } from './case-tools';
import { ScreenShare, type ScreenStats } from './screen-share';

export type CallPhase = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error';

export interface Utterance {
  id: string;
  speaker: 'caller' | 'assistant';
  text: string;
  final: boolean;
  interrupted?: boolean;
  typed?: boolean;
}

export interface Activity {
  id: string;
  text: string;
  at: number;
}

export interface LiveCallHandlers {
  onPhase(phase: CallPhase, error?: string): void;
  onTranscript(lines: Utterance[]): void;
  onCase(state: CaseState): void;
  onActivity(item: Activity): void;
  onSpeaking(speaking: boolean): void;
  onScreen(stream: MediaStream | undefined, stats: ScreenStats): void;
}

const MAX_RECONNECT_ATTEMPTS = 3;

class CallError extends Error {}

/**
 * One phone call with the assistant.
 *
 * Owns the mic, the speaker, the optional screen share and the Live API
 * session, and translates the raw server stream into things the UI cares
 * about: a transcript, a case file, and who is talking. Knows nothing about
 * React.
 */
export class LiveCall {
  phase: CallPhase = 'idle';
  caseState: CaseState = emptyCase();
  transcript: Utterance[] = [];
  startedAt = 0;
  endedAt = 0;
  muted = false;

  private session?: Session;
  private generation = 0;
  private resumeHandle?: string;
  private reconnecting = false;

  private mic?: MicCapture;
  private player?: PcmPlayer;
  private screen?: ScreenShare;
  private doc = openDocChannel();

  private openCaller?: Utterance;
  private openAssistant?: Utterance;
  private idCounter = 0;

  constructor(private handlers: LiveCallHandlers) {}

  // ---------------------------------------------------------------- public

  get inputLevel() {
    return this.mic?.level ?? 0;
  }

  get outputLevel() {
    return this.player?.level ?? 0;
  }

  get assistantSpeaking() {
    return this.player?.playing ?? false;
  }

  async start() {
    if (this.phase !== 'idle') return;
    this.setPhase('connecting');

    try {
      this.player = new PcmPlayer();
      this.player.onPlayingChange = (playing) => this.handlers.onSpeaking(playing);
      await this.player.start();

      this.mic = new MicCapture((pcm) => this.sendAudio(pcm));
      await this.mic.start();

      await this.connect();
      if (this.abandoned()) return;
      this.startedAt = Date.now();
      this.setPhase('live');
      this.sendEvent('[call connected]');
    } catch (err) {
      if (this.hasEnded()) return;
      this.teardown();
      this.setPhase('error', describeError(err));
    }
  }

  end() {
    if (this.phase === 'ended' || this.phase === 'idle') return;
    this.endedAt = Date.now();
    this.closeOpenTurns();
    this.teardown();
    this.setPhase('ended');
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.mic?.setMuted(muted);
    // Tell the server the stream paused so its voice detector doesn't wait for more.
    if (muted) this.session?.sendRealtimeInput({ audioStreamEnd: true });
  }

  sendText(text: string) {
    const clean = text.trim();
    if (!clean || !this.session) return;
    this.player?.interrupt();
    this.closeOpenTurns();
    this.pushUtterance({ speaker: 'caller', text: clean, final: true, typed: true });
    this.session.sendRealtimeInput({ text: clean });
  }

  async startScreenShare() {
    if (this.screen?.stream) return;
    const screen = new ScreenShare(
      (jpeg) => this.session?.sendRealtimeInput({ video: { data: jpeg, mimeType: 'image/jpeg' } }),
      () => this.onScreenEnded(),
      (stats) => this.handlers.onScreen(this.screen?.stream, stats),
    );

    try {
      const stream = await screen.start();
      this.screen = screen;
      this.handlers.onScreen(stream, screen.stats);
      // Give the first frame a moment to arrive before asking the model to look at it.
      window.setTimeout(() => this.screen?.stream && this.sendEvent('[screen shared]'), 1500);
    } catch (err) {
      screen.stop();
      // Closing the picker is a normal choice, not an error.
      if ((err as DOMException)?.name !== 'NotAllowedError') throw err;
    }
  }

  stopScreenShare() {
    if (!this.screen) return;
    this.screen.stop();
    this.onScreenEnded();
  }

  // ------------------------------------------------------------ connection

  private async connect(resumeHandle?: string) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resumeHandle }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new CallError(body.message ?? 'Could not start a session.');

    const gen = ++this.generation;
    const ai = new GoogleGenAI({ apiKey: body.token, httpOptions: { apiVersion: 'v1alpha' } });

    // Model, prompt and tools are locked into the token server-side; this config is just a fallback.
    this.session = await ai.live.connect({
      model: body.model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (msg) => gen === this.generation && this.handleMessage(msg),
        onerror: (e) => gen === this.generation && console.warn('[live] socket error', e),
        onclose: (e) => gen === this.generation && this.handleClose(e),
      },
    });
  }

  private handleClose(event: CloseEvent) {
    this.session = undefined;
    if (this.phase === 'live') {
      void this.reconnect(event.reason);
    } else if (this.phase === 'connecting') {
      this.teardown();
      this.setPhase('error', event.reason || 'The connection closed before the call started.');
    }
  }

  /** Called on goAway (server is about to recycle the socket) or an unexpected drop. */
  private async reconnect(reason?: string) {
    if (this.reconnecting || this.phase === 'ended') return;
    if (!this.resumeHandle) {
      this.teardown();
      this.setPhase('error', reason ? `The call dropped: ${reason}` : 'The call dropped.');
      return;
    }

    this.reconnecting = true;
    this.setPhase('reconnecting');
    const old = this.session;
    this.generation++; // ignore anything the old socket still says
    this.session = undefined;
    try {
      old?.close();
    } catch {
      /* already closed */
    }

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        await this.connect(this.resumeHandle);
        this.reconnecting = false;
        if (this.abandoned()) return;
        this.screen?.resendNextFrame();
        this.setPhase('live');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, attempt * 800));
        // The caller may have hung up while we were waiting.
        if (this.hasEnded()) return;
      }
    }

    this.reconnecting = false;
    this.teardown();
    this.setPhase('error', 'Lost the connection to Gemini and could not resume the call.');
  }

  // --------------------------------------------------------------- inbound

  private handleMessage(msg: LiveServerMessage) {
    const content = msg.serverContent;

    if (content?.interrupted) {
      // Caller barged in: silence the buffered audio right away.
      this.player?.interrupt();
      if (this.openAssistant) {
        this.openAssistant.interrupted = true;
        this.openAssistant.final = true;
        this.openAssistant = undefined;
        this.emitTranscript();
      }
    }

    if (content?.inputTranscription?.text) {
      this.appendCaller(content.inputTranscription.text);
    }

    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) {
        this.player?.enqueue(part.inlineData.data);
        this.closeCallerTurn();
      }
    }

    if (content?.outputTranscription?.text) {
      this.appendAssistant(content.outputTranscription.text);
    }

    if (content?.turnComplete) {
      this.closeOpenTurns();
    }

    if (msg.toolCall?.functionCalls?.length) {
      this.handleToolCalls(msg.toolCall.functionCalls);
    }

    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }

    if (msg.goAway) {
      void this.reconnect('server recycled the connection');
    }
  }

  private handleToolCalls(calls: FunctionCall[]) {
    const functionResponses = calls.map((call) => {
      const name = call.name ?? '';
      const result = runTool(name, call.args, this.caseState);
      this.caseState = result.state;
      this.handlers.onCase(this.caseState);
      this.handlers.onActivity({ id: this.nextId(), text: result.activity, at: Date.now() });

      if (name === 'cite_clause' && typeof call.args?.clause_ref === 'string') {
        this.doc.post({ type: 'highlight', ref: call.args.clause_ref, quote: String(call.args.quote ?? '') });
      }
      return { id: call.id, name, response: result.response };
    });

    // 3.1 Flash Live only supports blocking tools: the model waits for this reply before it speaks again.
    this.session?.sendToolResponse({ functionResponses });
  }

  // -------------------------------------------------------------- outbound

  private sendAudio(pcm: ArrayBuffer) {
    if (this.phase !== 'live' || !this.session) return;
    this.session.sendRealtimeInput({
      audio: { data: bytesToBase64(pcm), mimeType: 'audio/pcm;rate=16000' },
    });
  }

  private sendEvent(text: string) {
    this.session?.sendRealtimeInput({ text });
  }

  private onScreenEnded() {
    this.screen = undefined;
    this.handlers.onScreen(undefined, { sent: 0, skipped: 0, lastSentAt: 0 });
    if (this.phase === 'live') this.sendEvent('[screen stopped]');
  }

  // ------------------------------------------------------------ transcript

  private appendCaller(text: string) {
    if (!this.openCaller) {
      this.openCaller = this.pushUtterance({ speaker: 'caller', text: '', final: false });
    }
    this.openCaller.text += text;
    this.emitTranscript();
  }

  private appendAssistant(text: string) {
    this.closeCallerTurn();
    if (!this.openAssistant) {
      this.openAssistant = this.pushUtterance({ speaker: 'assistant', text: '', final: false });
    }
    this.openAssistant.text += text;
    this.emitTranscript();
  }

  private closeCallerTurn() {
    if (!this.openCaller) return;
    this.openCaller.final = true;
    this.openCaller = undefined;
    this.emitTranscript();
  }

  private closeOpenTurns() {
    if (this.openCaller) this.openCaller.final = true;
    if (this.openAssistant) this.openAssistant.final = true;
    this.openCaller = undefined;
    this.openAssistant = undefined;
    this.emitTranscript();
  }

  private pushUtterance(u: Omit<Utterance, 'id'>) {
    const utterance: Utterance = { id: this.nextId(), ...u };
    this.transcript.push(utterance);
    this.emitTranscript();
    return utterance;
  }

  private emitTranscript() {
    this.handlers.onTranscript(
      this.transcript
        .map((u) => ({ ...u, text: cleanSpaces(u.text) }))
        .filter((u) => u.text || !u.final),
    );
  }

  // ----------------------------------------------------------------- misc

  /** True if the caller hung up while we were awaiting something; cleans up the late session. */
  private abandoned() {
    if (!this.hasEnded()) return false;
    this.generation++;
    try {
      this.session?.close();
    } catch {
      /* noop */
    }
    this.session = undefined;
    return true;
  }

  private hasEnded() {
    return this.phase === 'ended' || this.phase === 'error';
  }

  private setPhase(phase: CallPhase, error?: string) {
    this.phase = phase;
    this.handlers.onPhase(phase, error);
  }

  private teardown() {
    this.generation++;
    try {
      this.session?.close();
    } catch {
      /* noop */
    }
    this.session = undefined;
    this.mic?.stop();
    this.player?.stop();
    this.screen?.stop();
    this.doc.close();
    this.mic = undefined;
    this.player = undefined;
    if (this.screen) {
      this.screen = undefined;
      this.handlers.onScreen(undefined, { sent: 0, skipped: 0, lastSentAt: 0 });
    }
  }

  private nextId() {
    return `u${(this.idCounter++).toString(36)}`;
  }
}

function describeError(err: unknown) {
  if (err instanceof MicError) {
    if (err.reason === 'denied') return 'Microphone access is blocked. Allow it from the address bar and try again.';
    if (err.reason === 'no-device') return 'No microphone was found. Plug one in and try again.';
    return 'This browser can\'t capture audio. Try the latest Chrome or Edge.';
  }
  if (err instanceof CallError) return err.message;
  if (err instanceof TypeError) return 'Network error. Check your connection and try again.';
  return err instanceof Error ? err.message : 'Something went wrong starting the call.';
}
