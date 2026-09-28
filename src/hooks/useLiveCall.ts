import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyCase, type CaseState } from '../live/case-tools';
import { LiveCall, type Activity, type CallPhase, type Utterance } from '../live/live-call';
import type { ScreenStats } from '../live/screen-share';

const NO_STATS: ScreenStats = { sent: 0, skipped: 0, lastSentAt: 0 };

export interface CallSnapshot {
  phase: CallPhase;
  error?: string;
  transcript: Utterance[];
  caseState: CaseState;
  activity: Activity[];
  speaking: boolean;
  muted: boolean;
  screen?: MediaStream;
  screenStats: ScreenStats;
  startedAt: number;
  endedAt: number;
}

const initial = (): CallSnapshot => ({
  phase: 'idle',
  transcript: [],
  caseState: emptyCase(),
  activity: [],
  speaking: false,
  muted: false,
  screenStats: NO_STATS,
  startedAt: 0,
  endedAt: 0,
});

/** React binding for a LiveCall. A fresh LiveCall is created for every call. */
export function useLiveCall() {
  const [snapshot, setSnapshot] = useState<CallSnapshot>(initial);
  const callRef = useRef<LiveCall | null>(null);

  const patch = useCallback((next: Partial<CallSnapshot>) => setSnapshot((s) => ({ ...s, ...next })), []);

  const start = useCallback(async () => {
    callRef.current?.end();
    setSnapshot(initial());

    const call = new LiveCall({
      onPhase: (phase, error) =>
        patch({ phase, error, startedAt: call.startedAt, endedAt: call.endedAt }),
      onTranscript: (transcript) => patch({ transcript }),
      onCase: (caseState) => patch({ caseState }),
      onActivity: (item) => setSnapshot((s) => ({ ...s, activity: [item, ...s.activity].slice(0, 30) })),
      onSpeaking: (speaking) => patch({ speaking }),
      onScreen: (screen, screenStats) => patch({ screen, screenStats }),
    });
    callRef.current = call;
    await call.start();
  }, [patch]);

  const end = useCallback(() => callRef.current?.end(), []);

  const reset = useCallback(() => {
    callRef.current?.end();
    callRef.current = null;
    setSnapshot(initial());
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    call.setMuted(!call.muted);
    patch({ muted: call.muted });
  }, [patch]);

  const shareScreen = useCallback(async () => {
    try {
      await callRef.current?.startScreenShare();
    } catch {
      patch({ error: 'Screen sharing failed. Try a different tab or window.' });
    }
  }, [patch]);

  const stopScreen = useCallback(() => callRef.current?.stopScreenShare(), []);
  const sendText = useCallback((text: string) => callRef.current?.sendText(text), []);

  // Hang up if the page goes away mid-call.
  useEffect(() => {
    const onUnload = () => callRef.current?.end();
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      callRef.current?.end();
    };
  }, []);

  return { snapshot, callRef, start, end, reset, toggleMute, shareScreen, stopScreen, sendText };
}
