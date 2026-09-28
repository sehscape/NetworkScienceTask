import { useCallback, useEffect, useRef } from 'react';
import { CallView } from './components/CallView';
import { HomeView } from './components/HomeView';
import { SummaryView } from './components/SummaryView';
import { TopBar } from './components/TopBar';
import { initLiquidGlass } from './design/liquid-glass.js';
import type { PolicyDocument } from './docs/types';
import { useLiveCall } from './hooks/useLiveCall';
import { usePolicyDocument } from './hooks/usePolicyDocument';
import { prewarmSession, type PolicyContext } from './live/live-call';

const toContext = (doc: PolicyDocument | null): PolicyContext | undefined =>
  doc ? { name: doc.name, text: doc.contextText } : undefined;

export default function App() {
  const call = useLiveCall();
  const policy = usePolicyDocument();
  const { phase, error, startedAt } = call.snapshot;

  useEffect(() => initLiquidGlass(), []);

  // The policy baked into the session at start; anything loaded later is sent mid-call.
  const attachedId = useRef<string | null>(null);

  const { start: startCall, attachPolicy } = call;

  const start = useCallback(() => {
    attachedId.current = policy.doc?.id ?? null;
    void startCall(toContext(policy.doc));
  }, [startCall, policy.doc]);

  const prewarm = useCallback(() => prewarmSession(toContext(policy.doc)), [policy.doc]);

  useEffect(() => {
    if (phase !== 'live' || !policy.doc || policy.doc.id === attachedId.current) return;
    attachedId.current = policy.doc.id;
    attachPolicy(toContext(policy.doc)!);
  }, [phase, policy.doc, attachPolicy]);

  // One screen per stage of the call, each with a single primary action:
  // home -> "Start a call", live -> "End call", summary -> "Download PDF".
  const view =
    phase === 'connecting' || phase === 'live' || phase === 'reconnecting'
      ? 'call'
      : phase === 'ended'
        ? 'summary'
        : 'home';

  return (
    <div className={`app app-${view}`}>
      <TopBar phase={phase} startedAt={startedAt} />
      {view === 'home' && (
        <HomeView policy={policy} onStart={start} onPrewarm={prewarm} error={phase === 'error' ? error : undefined} />
      )}
      {view === 'call' && (
        <CallView
          snapshot={call.snapshot}
          policy={policy}
          callRef={call.callRef}
          onEnd={call.end}
          onToggleMute={call.toggleMute}
          onShare={call.shareScreen}
          onStopShare={call.stopScreen}
          onSendText={call.sendText}
        />
      )}
      {view === 'summary' && (
        <SummaryView snapshot={call.snapshot} policyName={policy.doc?.name} onNewCall={call.reset} />
      )}
    </div>
  );
}
