import { useEffect, useRef, type ReactNode } from 'react';
import type { Utterance } from '../live/live-call';

interface Props {
  lines: Utterance[];
  empty?: ReactNode;
}

/** Live captions. Sticks to the bottom unless the reader has scrolled up. */
export function Transcript({ lines, empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  if (!lines.length) return <div className="transcript transcript-empty">{empty}</div>;

  return (
    <div className="transcript scroll-area" ref={scrollRef} onScroll={onScroll} aria-live="polite">
      {lines.map((line) => (
        <div key={line.id} className={`line line-${line.speaker}`} data-final={line.final}>
          <span className="line-who">
            {line.speaker === 'caller' ? 'You' : 'Covered'}
            {line.language && <span className="line-lang">{line.language.native}</span>}
          </span>
          <p className="line-text">
            {line.text}
            {!line.final && <span className="caret" aria-hidden="true" />}
            {line.interrupted && <span className="line-tag">interrupted</span>}
            {line.typed && <span className="line-tag">typed</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
