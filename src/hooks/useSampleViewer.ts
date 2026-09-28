import { useEffect, useState } from 'react';
import { openDocChannel } from '../lib/doc-channel';

/** Knows whether the sample policy viewer is open in another tab of this browser. */
export function useSampleViewer() {
  const [viewer, setViewer] = useState<{ doc: string; title: string } | null>(null);

  useEffect(() => {
    let lastSeen = 0;
    const channel = openDocChannel((msg) => {
      if (msg.type === 'hello') {
        lastSeen = Date.now();
        setViewer((v) => (v?.doc === msg.doc ? v : { doc: msg.doc, title: msg.title }));
      }
    });

    const poll = () => {
      channel.post({ type: 'ping' });
      if (Date.now() - lastSeen > 6000) setViewer(null);
    };
    poll();
    const timer = window.setInterval(poll, 2500);
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, []);

  return viewer;
}
