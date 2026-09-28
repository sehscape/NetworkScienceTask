import { useEffect, useRef } from 'react';
import type { ScreenStats } from '../live/screen-share';
import { canShareScreen } from '../live/screen-share';
import { Icon } from './Icon';

interface Props {
  stream?: MediaStream;
  stats: ScreenStats;
  viewer: { doc: string; title: string } | null;
  onShare: () => void;
  onStop: () => void;
}

export function ScreenPanel({ stream, stats, viewer, onShare, onStop }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  if (!stream) {
    return (
      <section className="glass panel screen-empty" aria-label="Screen sharing">
        <div className="screen-empty-icon">
          <Icon name="doc" />
        </div>
        <h3>Show your policy</h3>
        <p>
          Share the tab or window with your policy document. The assistant reads the clause on screen before it
          answers.
        </p>
        {canShareScreen() ? (
          <button className="btn btn-quiet" onClick={onShare}>
            <Icon name="screen" />
            Share screen
          </button>
        ) : (
          <p className="hint">Screen sharing needs Chrome, Edge or Firefox on a computer.</p>
        )}
        <p className="hint">
          {viewer ? (
            <>
              <span className="live-dot" /> {viewer.title} is open in another tab. Share that tab.
            </>
          ) : (
            <>
              No policy handy?{' '}
              <a href="/policy.html?doc=health" target="_blank" rel="noopener">
                Open a sample
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="glass panel screen-live" aria-label="Your shared screen">
      <div className="panel-head">
        <span className="chip chip-accent">
          <span className="live-dot" /> Assistant can see this
        </span>
        <button className="btn btn-text" onClick={onStop}>
          Stop sharing
        </button>
      </div>
      <div className="screen-frame">
        <video ref={videoRef} autoPlay muted playsInline />
        {/* Re-keyed on every frame sent so the edge flashes when the model gets a new look. */}
        {stats.sent > 0 && <span className="frame-pulse" key={stats.sent} aria-hidden="true" />}
      </div>
      <p className="screen-stats">
        {stats.sent} {stats.sent === 1 ? 'frame' : 'frames'} sent · {stats.skipped} unchanged skipped
        {viewer && <> · clauses light up in the sample tab</>}
      </p>
    </section>
  );
}
