import type { ReactNode } from 'react';
import type { PolicyChunk, PolicyDocument } from '../docs/types';
import { usePolicyGlance } from '../hooks/usePolicyGlance';
import { Icon } from './Icon';

interface Props {
  doc: PolicyDocument;
  /** When set, every item is a button that shows its clause in the viewer. */
  onSelect?: (chunk: PolicyChunk, label: string) => void;
}

const source = (chunk: PolicyChunk) => `${chunk.ref ? `${chunk.ref} · ` : ''}p.${chunk.location.page}`;

/**
 * The policy boiled down: headline numbers and the clauses most likely to
 * cut a claim, each tied to the clause it comes from.
 */
export function PolicyGlance({ doc, onSelect }: Props) {
  const { glance, error, loading, retry } = usePolicyGlance(doc);

  const item = (chunk: PolicyChunk, label: string, className: string, children: ReactNode) =>
    onSelect ? (
      <button type="button" className={className} onClick={() => onSelect(chunk, label)} title="Show this clause">
        {children}
      </button>
    ) : (
      <div className={className}>{children}</div>
    );

  if (loading) {
    return (
      <div className="glance" aria-busy="true">
        <p className="eyebrow">At a glance</p>
        <p className="glance-status">
          <span className="loader" aria-hidden="true" />
          Gemini is reading all {doc.pages.length} pages for the numbers that matter…
        </p>
        <div className="glance-skeleton" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !glance) {
    return (
      <div className="glance">
        <p className="eyebrow">At a glance</p>
        <p className="glance-status">
          Couldn&rsquo;t summarise this policy just now.{' '}
          <button type="button" className="link-btn" onClick={retry}>
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="glance">
      <header className="glance-head">
        <p className="eyebrow">At a glance</p>
        <h3>{glance.product}</h3>
        <p>{glance.oneLiner}</p>
      </header>

      {glance.facts.length > 0 && (
        <ul className="glance-facts">
          {glance.facts.map((f) => (
            <li key={`${f.label}${f.chunk.id}`}>
              {item(
                f.chunk,
                f.label,
                'glance-fact',
                <>
                  <span className="glance-label">{f.label}</span>
                  <strong className="glance-value">{f.value}</strong>
                  <span className="glance-src mono" title={f.verified ? 'Found word for word in this clause' : undefined}>
                    {f.verified && <Icon name="check" />}
                    {source(f.chunk)}
                  </span>
                </>,
              )}
            </li>
          ))}
        </ul>
      )}

      {glance.watchOuts.length > 0 && (
        <div className="glance-watch">
          <p className="glance-subhead">
            <Icon name="alert" /> Watch out for
          </p>
          <ul>
            {glance.watchOuts.map((w) => (
              <li key={`${w.title}${w.chunk.id}`}>
                {item(
                  w.chunk,
                  w.title,
                  'glance-watch-item',
                  <>
                    <span className="glance-watch-text">
                      <strong>{w.title}</strong>
                      <span>{w.detail}</span>
                    </span>
                    <span className="glance-src mono">{source(w.chunk)}</span>
                  </>,
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="glance-foot">
        Summarised by Gemini from your policy. {onSelect ? 'Tap an item to see its clause.' : 'Every item names the clause it comes from.'}
      </p>
    </div>
  );
}
