import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';
import { MicCapture, MicError } from '../audio/mic-capture';
import { PcmPlayer, bytesToBase64 } from '../audio/pcm-player';
import { openDocChannel } from '../lib/doc-channel';
import { cleanSpaces } from '../lib/format';
import { detectLanguage, type Language } from '../lib/language';
import { emptyCase, runTool, type CaseState, type Citation } from './case-tools';
import { ScreenShare, type ScreenStats } from './screen-share';

export type CallPhase = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error';

export interface Utterance {
  id: string;
  speaker: 'caller' | 'assistant';
  text: string;
  final: boolean;
  interrupted?: boolean;
  typed?: boolean;
  language?: Language;
}

export interface Activity {
  id: string;
  text: string;
  at: number;
}

/** A policy the caller loaded in the app. Its text goes to the model. */
export interface PolicyContext {
  name: string;
  text: string;
}

export interface LiveCallHandlers {
  onPhase(phase: CallPhase, error?: string): void;
  onTranscript(lines: Utterance[]): void;
  onCase(state: CaseState): void;
  onActivity(item: Activity): void;
  onSpeaking(speaking: boolean): void;
  onScreen(stream: MediaStream | undefined, stats: ScreenStats): void;
  /** Time from the caller finishing to the first sound of the reply. */
  onLatency(ms: number): void;
  onLanguage(language: Language): void;
  /** The assistant cited a clause; the in-app viewer scrolls to it. */
  onCite(citation: Citation): void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
/** Mic level (0..1, smoothed) above which we count the caller as speaking. Noise-suppressed silence sits well below. */
const VOICE_LEVEL = 0.025;

class CallError extends Error {}

// ------------------------------------------------------------ token warm-up

interface SessionTicket {
  token: string;
  model: string;
}

async function requestTicket(body: { resumeHandle?: string; policy?: PolicyContext }): Promise<SessionTicket> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) throw new CallError(json.message ?? 'Could not start a session.');
  return json;
}

const ticketKey = (policy?: PolicyContext) => (policy ? `${policy.name}:${policy.text.length}` : 'none');
let warm: { key: string; at: number; ticket: Promise<SessionTicket> } | null = null;

/**
 * Fetch a session token before the caller clicks "Start a call" (on hover or
 * focus), so the click only has to open the WebSocket. Tokens must be used
 * within a minute, so a warm token older than 40 s is thrown away.
 */
export function prewarmSession(policy?: PolicyContext) {
  const key = ticketKey(policy);
  if (warm && warm.key === key && Date.now() - warm.at < 40_000) return;
  const ticket = requestTicket({ policy });
  ticket.catch(() => {
    if (warm?.ticket === ticket) warm = null;
  });
  warm = { key, at: Date.now(), ticket };
}

function takeWarmTicket(policy?: PolicyContext) {
  const hit = warm && warm.key === ticketKey(policy) && Date.now() - warm.at < 40_000 ? warm.ticket : null;
  warm = null;
  return hit;
}

// ---------------------------------------------------------------- the call

/**
 * One phone call with the assistant.
 *
 * Owns the mic, the speaker, the optional screen share and the Live API
 * session, and translates the raw server stream into things the UI cares
 * about: a transcript, a case file, who is talking, how fast replies come
 * and which language is being spoken. Knows nothing about React.
 */
export class LiveCall {
  phase: CallPhase = 'idle';
  caseState: CaseState = emptyCase();
  transcript: Utterance[] = [];
  languages: Language[] = [];
  startedAt = 0;
  endedAt = 0;
  muted = false;

  private session?: Session;
  private generation = 0;
  private resumeHandle?: string;
  private reconnecting = false;
  /** The policy baked into this session's system prompt (reused when resuming). */
  private sessionPolicy?: PolicyContext;

  private mic?: MicCapture;
  private player?: PcmPlayer;
  private screen?: ScreenShare;
  private doc = openDocChannel();

  private openCaller?: Utterance;
  private openAssistant?: Utterance;
  private idCounter = 0;

  // Latency tracking
  private lastInputAt = 0;
  private lastTranscriptAt = 0;
  private turnStartedAt = 0;
  private modelTurnOpen = false;

  constructor(
    private handlers: LiveCallHandlers,
    options: { policy?: PolicyContext } = {},
  ) {
    this.sessionPolicy = options.policy;
  }

  // ---------------------------------------------------------------- public

  get inputLevel() {
    return this.mic?.level ?? 0;
  }

  get outputLevel() {
    return this.player?.level ?? 0;
  }

  async start() {
    if (this.phase !== 'idle') return;
    this.setPhase('connecting');

    try {
      // Audio devices and the Gemini connection come up in parallel: the
      // mic permission prompt and the WebSocket handshake overlap.
      await Promise.all([this.startAudio(), this.connect()]);
      if (this.abandoned()) return;
      this.startedAt = Date.now();
      this.turnStartedAt = this.startedAt;
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
    this.pushUtterance({ speaker: 'caller', text: clean, final: true, typed: true, language: this.noteLanguage(clean) });
    this.lastInputAt = Date.now();
    this.session.sendRealtimeInput({ text: clean });
  }

  /** A policy loaded mid-call: hand its full text to the model right away. */
  attachPolicy(policy: PolicyContext) {
    if (this.phase !== 'live' || !this.session) return;
    this.sendEvent(`[policy uploaded: "${policy.name}". Full text follows.]\n${policy.text}`);
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

  private async startAudio() {
    const player = new PcmPlayer();
    player.onPlayingChange = (playing) => this.handlers.onSpeaking(playing);
    this.player = player;
    await player.start();

    const mic = new MicCapture((pcm) => {
      // Remember when the caller last made a sound (ignoring our own playback leaking in).
      if (!this.muted && !player.playing && mic.level > VOICE_LEVEL) this.lastInputAt = Date.now();
      this.sendAudio(pcm);
    });
    this.mic = mic;
    await mic.start();

    // The connection failed (or the caller hung up) while the permission prompt was open.
    if (this.hasEnded()) {
      mic.stop();
      player.stop();
    }
  }

  private async connect(resumeHandle?: string) {
    const ticket = (!resumeHandle && takeWarmTicket(this.sessionPolicy)) || requestTicket({ resumeHandle, policy: this.sessionPolicy });
    const { token, model } = await ticket;
    if (this.hasEnded()) return;

    const gen = ++this.generation;
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });

    // Model, prompt and tools are locked into the token server-side; this config is just a fallback.
    const session = await ai.live.connect({
      model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (msg) => gen === this.generation && this.handleMessage(msg),
        onerror: (e) => gen === this.generation && console.warn('[live] socket error', e),
        onclose: (e) => gen === this.generation && this.handleClose(e),
      },
    });

    // Torn down while the socket was opening (hang-up, or the mic was refused).
    if (gen !== this.generation) {
      try {
        session.close();
      } catch {
        /* noop */
      }
      return;
    }
    this.session = session;
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
    if (this.reconnecting || this.hasEnded()) return;
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
      this.modelTurnOpen = false;
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
        if (!this.modelTurnOpen) this.onReplyStarted();
        this.player?.enqueue(part.inlineData.data);
        this.closeCallerTurn();
      }
    }

    if (content?.outputTranscription?.text) {
      this.appendAssistant(content.outputTranscription.text);
    }

    if (content?.turnComplete) {
      this.modelTurnOpen = false;
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

  /**
   * First audio of a reply: measure how long the caller waited for it, from
   * the last moment their mic picked up speech. If the mic level never
   * crossed the threshold (a very quiet caller), fall back to when their
   * words were last transcribed, which slightly understates the wait.
   */
  private onReplyStarted() {
    const now = Date.now();
    this.modelTurnOpen = true;
    const spokeAt =
      this.lastInputAt > this.turnStartedAt
        ? this.lastInputAt
        : this.lastTranscriptAt > this.turnStartedAt
          ? this.lastTranscriptAt
          : 0;
    if (spokeAt && now - spokeAt < 10_000) this.handlers.onLatency(now - spokeAt);
    this.turnStartedAt = now;
  }

  private handleToolCalls(calls: FunctionCall[]) {
    const functionResponses = calls.map((call) => {
      const name = call.name ?? '';
      const result = runTool(name, call.args, this.caseState);
      this.caseState = result.state;
      this.handlers.onCase(this.caseState);
      this.handlers.onActivity({ id: this.nextId(), text: result.activity, at: Date.now() });

      if (name === 'cite_clause' && this.caseState.citations[0]) {
        const citation = this.caseState.citations[0];
        this.handlers.onCite(citation);
        // Also reaches the standalone policy page if it's open in another tab.
        this.doc.post({ type: 'highlight', ref: citation.clause_ref, quote: citation.quote });
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
    this.lastTranscriptAt = Date.now();
    if (!this.openCaller) {
      this.openCaller = this.pushUtterance({ speaker: 'caller', text: '', final: false });
    }
    this.openCaller.text = joinChunk(this.openCaller.text, text);
    this.emitTranscript();
  }

  private appendAssistant(text: string) {
    this.closeCallerTurn();
    if (!this.openAssistant) {
      this.openAssistant = this.pushUtterance({ speaker: 'assistant', text: '', final: false });
    }
    this.openAssistant.text = joinChunk(this.openAssistant.text, text);
    this.emitTranscript();
  }

  private closeCallerTurn() {
    if (!this.openCaller) return;
    this.openCaller.final = true;
    this.openCaller.language = this.noteLanguage(this.openCaller.text);
    this.openCaller = undefined;
    this.emitTranscript();
  }

  private closeOpenTurns() {
    this.closeCallerTurn();
    if (this.openAssistant) this.openAssistant.final = true;
    this.openAssistant = undefined;
    this.emitTranscript();
  }

  /** Labels the caller's language for the UI and the hand-off note. */
  private noteLanguage(text: string) {
    const language = detectLanguage(text);
    if (!language) return undefined;
    if (!this.languages.some((l) => l.code === language.code)) this.languages.push(language);
    this.handlers.onLanguage(language);
    return language;
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

/** Transcription arrives in chunks; a new sentence after a tool call sometimes comes without its leading space. */
function joinChunk(text: string, chunk: string) {
  return /[.?!।]$/.test(text) && /^[^\s.,?!]/.test(chunk) ? `${text} ${chunk}` : text + chunk;
}

function describeError(err: unknown) {
  if (err instanceof MicError) {
    if (err.reason === 'denied') return 'Microphone access is blocked. Allow it from the address bar and try again.';
    if (err.reason === 'no-device') return 'No microphone was found. Plug one in and try again.';
    return "This browser can't capture audio. Try the latest Chrome or Edge.";
  }
  if (err instanceof CallError) return err.message;
  if (err instanceof TypeError) return 'Network error. Check your connection and try again.';
  return err instanceof Error ? err.message : 'Something went wrong starting the call.';
}
