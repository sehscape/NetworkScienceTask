import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Activity, Utterance } from '../live/live-call';
import { Icon, type IconName } from './Icon';

interface Props {
  lines: Utterance[];
  activity?: Activity[];
  empty?: ReactNode;
}

const TOOL_ICON: Record<string, IconName> = {
  search_policy: 'search',
  flag_out_of_scope: 'shield',
  cite_clause: 'pin',
  estimate_payout: 'calc',
  assess_coverage: 'shield',
  update_claim: 'doc',
  set_next_steps: 'list',
};

/**
 * Live captions laid out like a conversation: the caller on the right, the
 * assistant on the left, and whatever the assistant did during a reply
 * (highlighting a clause, working out a payout) tagged under that reply.
 * Sticks to the bottom unless the reader has scrolled up.
 */
export function Transcript({ lines, activity = [], empty }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Attach each tool action to the assistant turn it happened during.
  const actionsByLine = useMemo(() => {
    const map = new Map<string, Activity[]>();
    const assistant = lines.filter((l) => l.speaker === 'assistant');
    for (const item of [...activity].sort((a, b) => a.at - b.at)) {
      const owner = [...assistant].reverse().find((l) => l.at <= item.at) ?? assistant[0];
      if (!owner) continue;
      const list = map.get(owner.id) ?? [];
      // Keep one tag per tool per turn, showing its latest result.
      map.set(owner.id, [...list.filter((a) => a.tool !== item.tool), item]);
    }
    return map;
  }, [lines, activity]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines, actionsByLine]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  };

  if (!lines.length) return <div className="conversation conversation-empty">{empty}</div>;

  return (
    <div className="conversation scroll-area" ref={scrollRef} onScroll={onScroll} aria-live="polite">
      {lines.map((line) => {
        const actions = actionsByLine.get(line.id);
        return (
          <div key={line.id} className={`msg msg-${line.speaker}`} data-final={line.final}>
            <span className="msg-meta">
              {line.speaker === 'caller' ? 'You' : 'Covered'}
              {line.language && <span className="msg-lang">{line.language.native}</span>}
              {line.typed && <span className="msg-lang">typed</span>}
            </span>
            <p className="bubble">
              {line.text}
              {!line.final && <span className="caret" aria-hidden="true" />}
              {line.interrupted && <span className="msg-cut">interrupted</span>}
            </p>
            {actions && (
              <ul className="msg-actions" aria-label="What the assistant did">
                {actions.map((a) => (
                  <li key={a.id}>
                    <Icon name={TOOL_ICON[a.tool] ?? 'sparkle'} />
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
