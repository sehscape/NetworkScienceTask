import { useRef, useState, type DragEvent } from 'react';
import type { DocStatus } from '../hooks/usePolicyDocument';
import { Icon } from './Icon';

interface Props {
  status: DocStatus;
  progress: string;
  error: string;
  onFiles: (files: File[]) => void;
  onSample: (sample: 'health' | 'motor') => void;
}

/** Drop a whole policy (PDF or photos) here, or pick one of the specimens. */
export function PolicyDrop({ status, progress, error, onFiles, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = status === 'loading';

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  };

  return (
    <div className="policy-drop">
      <button
        type="button"
        className="dropzone"
        data-over={over}
        data-busy={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={busy}
      >
        <span className="icon-tile">
          <Icon name={busy ? 'sparkle' : 'upload'} />
        </span>
        {busy ? (
          <>
            <strong>Reading your policy</strong>
            <span className="dropzone-progress">{progress}</span>
            <span className="loader" aria-hidden="true" />
          </>
        ) : (
          <>
            <strong>Upload your whole policy</strong>
            <span>Drop a PDF or photos of each page here, or click to choose</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />

      {error && (
        <p className="drop-error" role="alert">
          <Icon name="alert" /> {error}
        </p>
      )}

      <p className="drop-samples">
        No policy to hand? Try a specimen:{' '}
        <button type="button" className="link-btn" disabled={busy} onClick={() => onSample('health')}>
          Health
        </button>{' '}
        ·{' '}
        <button type="button" className="link-btn" disabled={busy} onClick={() => onSample('motor')}>
          Motor
        </button>
      </p>
    </div>
  );
}
