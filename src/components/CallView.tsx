import { useCallback, useState, type FormEvent, type RefObject } from 'react';
import type { CallSnapshot } from '../hooks/useLiveCall';
import { useSampleViewer } from '../hooks/useSampleViewer';
import type { LiveCall } from '../live/live-call';
import { canShareScreen } from '../live/screen-share';
import { policies } from '../policies';
import { ClaimFileCard } from './ClaimFileCard';
import { ClauseList } from './ClauseList';
import { CoverageCard } from './CoverageCard';
import { Icon } from './Icon';
import { NextStepsCard } from './NextStepsCard';
import { PayoutCard } from './PayoutCard';
import { ScreenPanel } from './ScreenPanel';
import { Transcript } from './Transcript';
import { VoiceOrb } from './VoiceOrb';

interface Props {
  snapshot: CallSnapshot;
  callRef: RefObject<LiveCall | null>;
  onEnd: () => void;
  onToggleMute: () => void;
  onShare: () => void;
  onStopShare: () => void;
  onSendText: (text: string) => void;
}

export function CallView({ snapshot, callRef, onEnd, onToggleMute, onShare, onStopShare, onSendText }: Props) {
  const { phase, caseState, transcript, speaking, muted, screen, screenStats, activity } = snapshot;
  const viewer = useSampleViewer();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const getLevels = useCallback(
    () => ({ input: callRef.current?.inputLevel ?? 0, output: callRef.current?.outputLevel ?? 0 }),
    [callRef],
  );

  const orbState =
    phase === 'connecting'
      ? 'connecting'
      : phase === 'reconnecting'
        ? 'reconnecting'
        : speaking
          ? 'speaking'
          : muted
            ? 'muted'
            : 'listening';

  const stateLabel = {
    connecting: 'Connecting to Gemini…',
    reconnecting: 'Reconnecting, hold on…',
    speaking: 'Speaking · talk over me any time',
    muted: 'You are muted',
    listening: 'Listening',
  }[orbState];

  const latest = activity[0];
  const suggestions = viewer ? policies[viewer.doc as keyof typeof policies]?.prompts : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendText(draft);
    setDraft('');
  };

  return (
    <main className="call">
      <aside className="call-col call-left">
        <ScreenPanel stream={screen} stats={screenStats} viewer={viewer} onShare={onShare} onStop={onStopShare} />
        <ClauseList citations={caseState.citations} />
      </aside>

      <section className="call-col call-center">
        <div className="orb-wrap">
          <VoiceOrb getLevels={getLevels} state={orbState} />
        </div>
        <p className="call-state" aria-live="polite">
          {stateLabel}
        </p>

        <div className="activity-slot" aria-live="polite">
          {/* Re-keyed per tool call; CSS fades it in, holds, then fades it out. */}
          {latest && (
            <span className="chip chip-accent activity" key={latest.id}>
              <Icon name="sparkle" />
              {latest.text}
            </span>
          )}
        </div>

        <Transcript
          lines={transcript}
          empty={
            phase === 'live' && (
              <div className="suggest">
                <p className="eyebrow">Try saying</p>
                <ul>
                  {(suggestions ?? [
                    'I was in hospital last week. How do I make a claim?',
                    'What does my policy say about room rent?',
                    'Mera accident hua hai, claim kaise karu?',
                  ]).map((s) => (
                    <li key={s}>“{s}”</li>
                  ))}
                </ul>
              </div>
            )
          }
        />

        {snapshot.error && phase === 'live' && (
          <p className="inline-error" role="alert">
            <Icon name="alert" /> {snapshot.error}
          </p>
        )}

        {typing && (
          <form className="type-bar glass" onSubmit={submit}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type instead of speaking…"
              aria-label="Message"
            />
            <button className="icon-btn" type="submit" aria-label="Send" disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        )}

        <div className="dock glass glass-strong" role="toolbar" aria-label="Call controls">
          <button
            className="icon-btn"
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
            onClick={onToggleMute}
          >
            <Icon name={muted ? 'micOff' : 'mic'} />
          </button>
          {canShareScreen() && (
            <button
              className="icon-btn"
              aria-pressed={!!screen}
              aria-label={screen ? 'Stop sharing screen' : 'Share screen'}
              title={screen ? 'Stop sharing' : 'Share your policy'}
              onClick={screen ? onStopShare : onShare}
            >
              <Icon name={screen ? 'screenOff' : 'screen'} />
            </button>
          )}
          <button
            className="icon-btn"
            aria-pressed={typing}
            aria-label="Type a message"
            title="Type instead"
            onClick={() => setTyping((t) => !t)}
          >
            <Icon name="keyboard" />
          </button>
          <span className="dock-divider" />
          <button className="btn btn-primary" onClick={onEnd}>
            <Icon name="hangup" />
            End call
          </button>
        </div>
      </section>

      <aside className="call-col call-right">
        <ClaimFileCard claim={caseState.claim} recentlyUpdated={caseState.recentlyUpdated} />
        <CoverageCard coverage={caseState.coverage} />
        <PayoutCard payout={caseState.payout} />
        <NextStepsCard next={caseState.nextSteps} />
      </aside>
    </main>
  );
}
