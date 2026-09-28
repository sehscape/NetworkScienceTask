import { useCallback, useState, type FormEvent, type RefObject } from 'react';
import type { CallSnapshot } from '../hooks/useLiveCall';
import type { PolicyState } from '../hooks/usePolicyDocument';
import type { LiveCall } from '../live/live-call';
import { canShareScreen } from '../live/screen-share';
import { policies } from '../policies';
import { ClaimFileCard } from './ClaimFileCard';
import { ClauseList } from './ClauseList';
import { CoverageCard } from './CoverageCard';
import { DocumentPanel } from './DocumentPanel';
import { Icon } from './Icon';
import { NextStepsCard } from './NextStepsCard';
import { PayoutCard } from './PayoutCard';
import { Transcript } from './Transcript';
import { VoiceOrb } from './VoiceOrb';

interface Props {
  snapshot: CallSnapshot;
  policy: PolicyState;
  callRef: RefObject<LiveCall | null>;
  onEnd: () => void;
  onToggleMute: () => void;
  onShare: () => void;
  onStopShare: () => void;
  onSendText: (text: string) => void;
}

const DEFAULT_PROMPTS = [
  'I was in hospital last week. How do I make a claim?',
  'मेरी कार का एक्सीडेंट हुआ है, क्लेम कैसे करूँ?',
  'Room rent limit kitna hai meri policy mein?',
];

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function CallView(props: Props) {
  const { snapshot, policy, callRef, onEnd, onToggleMute, onShare, onStopShare, onSendText } = props;
  const { phase, caseState, transcript, speaking, muted, screen, activity, latencies, language } = snapshot;
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

  const inConversation = transcript.length > 0;
  const lastLatency = latencies[latencies.length - 1];
  const suggestions = policy.doc?.sample ? policies[policy.doc.sample].prompts : DEFAULT_PROMPTS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendText(draft);
    setDraft('');
  };

  return (
    <main className="call">
      <div className="call-col call-doc">
        <DocumentPanel policy={policy} snapshot={snapshot} onShare={onShare} onStopShare={onStopShare} />
      </div>

      <section className="call-col call-center" data-compact={inConversation}>
        {/* Before anyone speaks the orb is the hero; once the conversation starts it
            shrinks into a status bar so the conversation gets the room. */}
        <header className="call-status">
          <div className="orb-wrap">
            <VoiceOrb getLevels={getLevels} state={orbState} />
          </div>
          <div className="call-status-text">
            <p className="call-state" aria-live="polite">
              {stateLabel}
            </p>
            <div className="call-meters">
              <span className="meter" title="Language detected from what you say. The assistant replies in the same one.">
                <Icon name="globe" />
                {language ? (
                  <>
                    {language.name}
                    {language.native !== language.name && <span className="meter-native">{language.native}</span>}
                  </>
                ) : (
                  'Any language'
                )}
              </span>
              <span className="meter" title="Time from when you stop talking to the first sound of the reply">
                <Icon name="bolt" />
                {lastLatency ? (
                  <>
                    {(lastLatency / 1000).toFixed(2)} s reply
                    {latencies.length > 2 && (
                      <span className="meter-native">median {(median(latencies) / 1000).toFixed(2)} s</span>
                    )}
                  </>
                ) : (
                  'Reply time'
                )}
              </span>
            </div>
          </div>
        </header>

        <Transcript
          lines={transcript}
          activity={activity}
          empty={
            phase === 'live' && (
              <div className="suggest">
                <p className="eyebrow">Try saying, in any language</p>
                <ul>
                  {suggestions.slice(0, 3).map((s) => (
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
          <form className="prompt-bar type-bar" onSubmit={submit}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type instead of speaking…"
              aria-label="Message"
            />
            <button className="send-btn" type="submit" aria-label="Send" disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        )}

        <div className="dock" role="toolbar" aria-label="Call controls">
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
              title={screen ? 'Stop sharing' : 'Share a tab or window'}
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

      <aside className="call-col call-rail">
        <ClaimFileCard claim={caseState.claim} recentlyUpdated={caseState.recentlyUpdated} />
        <CoverageCard coverage={caseState.coverage} />
        <PayoutCard payout={caseState.payout} />
        <ClauseList citations={caseState.citations} />
        <NextStepsCard next={caseState.nextSteps} />
      </aside>
    </main>
  );
}
