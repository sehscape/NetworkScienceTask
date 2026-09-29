import { useEffect, useRef, useState } from 'react';
import type { CallSnapshot } from '../hooks/useLiveCall';
import type { PolicyState } from '../hooks/usePolicyDocument';
import { useSampleViewer } from '../hooks/useSampleViewer';
import { canShareScreen } from '../live/screen-share';
import { chunkTarget, DocumentViewer, type FocusTarget, type ViewerFocus } from './DocumentViewer';
import { PolicyDrop } from './PolicyDrop';
import { PolicyGlance } from './PolicyGlance';
import { ScreenPanel } from './ScreenPanel';

interface Props {
  policy: PolicyState;
  snapshot: CallSnapshot;
  /** What the viewer should show next: a cited clause, or one picked by the caller. */
  focus?: ViewerFocus;
  onFocus: (target: FocusTarget) => void;
  onAsk?: (question: string) => void;
  onShare: () => void;
  onStopShare: () => void;
}

type Tab = 'policy' | 'glance' | 'screen';

/**
 * Left side of the call: the caller's policy, readable in place, a summary
 * of it, or their shared screen. Switches to the screen tab by itself when
 * sharing starts, and back to the policy when a clause needs showing.
 */
export function DocumentPanel({ policy, snapshot, focus, onFocus, onAsk, onShare, onStopShare }: Props) {
  const [tab, setTab] = useState<Tab>('policy');
  const viewer = useSampleViewer();
  const replaceInput = useRef<HTMLInputElement>(null);
  const sharing = useRef(false);
  sharing.current = !!snapshot.screen;

  useEffect(() => {
    if (snapshot.screen) setTab('screen');
  }, [snapshot.screen]);

  // A shared screen stays in front: that is what the assistant is looking at.
  useEffect(() => {
    if (focus) setTab((t) => (t === 'screen' && sharing.current ? t : 'policy'));
  }, [focus]);

  return (
    <section className="glass doc-panel" aria-label="Policy document">
      <div className="doc-panel-head">
        <div className="segmented" role="tablist" aria-label="What the assistant can see">
          <button role="tab" aria-selected={tab === 'policy'} onClick={() => setTab('policy')}>
            Policy
          </button>
          {policy.doc && (
            <button role="tab" aria-selected={tab === 'glance'} onClick={() => setTab('glance')}>
              At a glance
            </button>
          )}
          {canShareScreen() && (
            <button role="tab" aria-selected={tab === 'screen'} onClick={() => setTab('screen')}>
              Share screen{snapshot.screen ? ' · live' : ''}
            </button>
          )}
        </div>
      </div>

      <div className="doc-panel-body">
        {tab === 'policy' &&
          (policy.doc ? (
            <>
              <DocumentViewer
                key={policy.doc.id}
                doc={policy.doc}
                focus={focus}
                onAsk={onAsk}
                onReplace={() => replaceInput.current?.click()}
              />
              {policy.status === 'loading' && <div className="doc-busy">{policy.progress}</div>}
              <input
                ref={replaceInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = '';
                  if (files.length) void policy.fromFiles(files);
                }}
              />
            </>
          ) : (
            <div className="doc-empty">
              <PolicyDrop
                status={policy.status}
                progress={policy.progress}
                error={policy.error}
                onFiles={(files) => void policy.fromFiles(files)}
                onSample={(s) => void policy.fromSample(s)}
              />
            </div>
          ))}

        {tab === 'glance' && policy.doc && (
          <div className="doc-glance scroll-area">
            <PolicyGlance
              doc={policy.doc}
              onSelect={(chunk, label) =>
                onFocus({ ...chunkTarget(chunk), label: chunk.ref ? `${chunk.ref} · ${label}` : label })
              }
            />
          </div>
        )}

        {tab === 'screen' && (
          <ScreenPanel
            stream={snapshot.screen}
            stats={snapshot.screenStats}
            viewer={viewer}
            onShare={onShare}
            onStop={onStopShare}
          />
        )}
      </div>
    </section>
  );
}
