import { useEffect, useRef, useState } from 'react';
import type { CallSnapshot } from '../hooks/useLiveCall';
import type { PolicyState } from '../hooks/usePolicyDocument';
import { useSampleViewer } from '../hooks/useSampleViewer';
import { canShareScreen } from '../live/screen-share';
import { DocumentViewer } from './DocumentViewer';
import { PolicyDrop } from './PolicyDrop';
import { ScreenPanel } from './ScreenPanel';

interface Props {
  policy: PolicyState;
  snapshot: CallSnapshot;
  onShare: () => void;
  onStopShare: () => void;
}

type Tab = 'policy' | 'screen';

/**
 * Left side of the call: the caller's policy, readable in place, or their
 * shared screen. Switches to the screen tab by itself when sharing starts.
 */
export function DocumentPanel({ policy, snapshot, onShare, onStopShare }: Props) {
  const [tab, setTab] = useState<Tab>('policy');
  const viewer = useSampleViewer();
  const replaceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (snapshot.screen) setTab('screen');
  }, [snapshot.screen]);

  return (
    <section className="glass doc-panel" aria-label="Policy document">
      <div className="doc-panel-head">
        <div className="segmented" role="tablist" aria-label="What the assistant can see">
          <button role="tab" aria-selected={tab === 'policy'} onClick={() => setTab('policy')}>
            Policy document
          </button>
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
                focus={snapshot.focus}
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
