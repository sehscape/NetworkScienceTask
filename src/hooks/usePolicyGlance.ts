import { useCallback, useEffect, useState } from 'react';
import { loadGlance, type Glance } from '../docs/glance';
import type { PolicyDocument } from '../docs/types';

interface State {
  docId?: string;
  glance?: Glance;
  error?: string;
}

/** The "at a glance" summary of a loaded policy, fetched once and shared. */
export function usePolicyGlance(doc: PolicyDocument | null) {
  const [state, setState] = useState<State>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!doc) return;
    let live = true;
    loadGlance(doc).then(
      (glance) => live && setState({ docId: doc.id, glance }),
      (err: Error) => live && setState({ docId: doc.id, error: err.message }),
    );
    return () => {
      live = false;
    };
  }, [doc, attempt]);

  const retry = useCallback(() => {
    setState({});
    setAttempt((n) => n + 1);
  }, []);

  const current = doc && state.docId === doc.id ? state : {};
  return {
    glance: current.glance,
    error: current.error,
    loading: !!doc && !current.glance && !current.error,
    retry,
  };
}
