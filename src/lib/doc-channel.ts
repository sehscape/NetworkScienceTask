/**
 * The sample policy viewer (policy.html) runs in its own tab so it can be
 * screen-shared. Both tabs share an origin, so a BroadcastChannel lets the
 * call page "point" at a clause: when the assistant cites 3.6, the viewer
 * scrolls to it and lights it up, and the next screen frame shows that to
 * the model and the caller.
 */
export type DocMessage =
  | { type: 'highlight'; ref: string; quote?: string }
  | { type: 'hello'; doc: string; title: string }
  | { type: 'ping' };

const CHANNEL_NAME = 'covered:policy-viewer';

export function openDocChannel(onMessage?: (message: DocMessage) => void) {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: (_: DocMessage) => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  if (onMessage) channel.onmessage = (event) => onMessage(event.data as DocMessage);
  return {
    post: (message: DocMessage) => channel.postMessage(message),
    close: () => channel.close(),
  };
}

/** "Clause 3.6(b)" -> ["3.6", "3"], most specific first. */
export function refCandidates(ref: string) {
  const match = ref.match(/\d+(?:\.\d+)*/);
  if (!match) return [];
  const parts = match[0].split('.');
  const out: string[] = [];
  for (let i = parts.length; i > 0; i--) out.push(parts.slice(0, i).join('.'));
  return out;
}
