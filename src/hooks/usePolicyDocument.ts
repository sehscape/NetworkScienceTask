import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentError, loadFiles, loadSample, releaseDocument, type LoadProgress } from '../docs/load';
import type { PolicyDocument } from '../docs/types';

export type DocStatus = 'empty' | 'loading' | 'ready' | 'error';

/** The policy the caller has loaded, shared by the home, call and summary views. */
export function usePolicyDocument() {
  const [doc, setDoc] = useState<PolicyDocument | null>(null);
  const [status, setStatus] = useState<DocStatus>('empty');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const current = useRef<PolicyDocument | null>(null);
  const attempt = useRef(0);

  const load = useCallback(async (task: (onProgress: LoadProgress) => Promise<PolicyDocument>) => {
    const id = ++attempt.current;
    setStatus('loading');
    setError('');
    setProgress('Opening…');

    try {
      const next = await task((message) => id === attempt.current && setProgress(message));
      if (id !== attempt.current) {
        releaseDocument(next); // a newer upload won
        return;
      }
      if (current.current) releaseDocument(current.current);
      current.current = next;
      setDoc(next);
      setStatus('ready');
    } catch (err) {
      if (id !== attempt.current) return;
      setError(err instanceof DocumentError ? err.message : 'Could not read that file.');
      setStatus(current.current ? 'ready' : 'error');
    }
  }, []);

  const fromFiles = useCallback((files: File[]) => load((p) => loadFiles(files, p)), [load]);
  const fromSample = useCallback((sample: 'health' | 'motor') => load((p) => loadSample(sample, p)), [load]);

  const clear = useCallback(() => {
    attempt.current++;
    if (current.current) releaseDocument(current.current);
    current.current = null;
    setDoc(null);
    setStatus('empty');
    setError('');
  }, []);

  useEffect(() => () => {
    if (current.current) releaseDocument(current.current);
  }, []);

  return { doc, status, progress, error, fromFiles, fromSample, clear };
}

export type PolicyState = ReturnType<typeof usePolicyDocument>;
