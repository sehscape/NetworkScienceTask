import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/format';
import type { CallPhase } from '../live/live-call';

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4b4bff" />
            <stop offset="1" stopColor="#1200ff" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
        <path
          d="M9 11.5a3.5 3.5 0 0 1 3.5-3.5h7a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5H15l-4 3.5V20a3.5 3.5 0 0 1-2-3.2z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M13 14l2 2 4-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Covered
    </span>
  );
}

function CallTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="mono">{formatDuration((now - since) / 1000)}</span>;
}

interface Props {
  phase: CallPhase;
  startedAt: number;
}

export function TopBar({ phase, startedAt }: Props) {
  const inCall = phase === 'live' || phase === 'reconnecting';

  return (
    <header className="topbar">
      <Logo />
      <div className="topbar-right">
        {inCall ? (
          <span className="chip chip-accent">
            <span className="live-dot" />
            {phase === 'reconnecting' ? 'Reconnecting' : 'Live'}
            {startedAt > 0 && <CallTimer since={startedAt} />}
          </span>
        ) : (
          <a className="btn btn-text" href="/policy.html?doc=health" target="_blank" rel="noopener">
            Sample policies
          </a>
        )}
      </div>
    </header>
  );
}
