import { useEffect, useRef } from 'react';
import type { ScreenStats } from '../live/screen-share';
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
      <div className="screen-empty">
        <span className="icon-tile">
          <Icon name="screen" />
        </span>
        <h3>Show a document that isn&rsquo;t a file</h3>
        <p>
          Share a tab or window, like your insurer&rsquo;s portal or an email with your policy. The assistant watches it
          live and reads the clause before it answers.
        </p>
        <button className="btn btn-outline" onClick={onShare}>
          <Icon name="screen" />
          Share a tab or window
        </button>
        <p className="hint">
          {viewer ? (
            <>
              <span className="live-dot" /> {viewer.title} is open in another tab. Share that tab.
            </>
          ) : (
            <>
              Want to try it?{' '}
              <a href="/policy.html?doc=health" target="_blank" rel="noopener">
                Open a sample policy in a new tab
              </a>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="screen-live">
      <div className="screen-live-head">
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
    </div>
  );
}
