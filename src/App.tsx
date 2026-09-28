import { useEffect } from 'react';
import { CallView } from './components/CallView';
import { HomeView } from './components/HomeView';
import { SummaryView } from './components/SummaryView';
import { TopBar } from './components/TopBar';
import { initLiquidGlass } from './design/liquid-glass.js';
import { useLiveCall } from './hooks/useLiveCall';

export default function App() {
  const call = useLiveCall();
  const { phase, error, startedAt } = call.snapshot;

  useEffect(() => initLiquidGlass(), []);

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
      {view === 'home' && <HomeView onStart={call.start} error={phase === 'error' ? error : undefined} />}
      {view === 'call' && (
        <CallView
          snapshot={call.snapshot}
          callRef={call.callRef}
          onEnd={call.end}
          onToggleMute={call.toggleMute}
          onShare={call.shareScreen}
          onStopShare={call.stopScreen}
          onSendText={call.sendText}
        />
      )}
      {view === 'summary' && <SummaryView snapshot={call.snapshot} onNewCall={call.reset} />}
    </div>
  );
}
