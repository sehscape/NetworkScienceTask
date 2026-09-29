import type { ClauseEffect } from '../../shared/types';
import type { Citation } from '../live/case-tools';
import { Icon } from './Icon';

const EFFECT_LABEL: Record<ClauseEffect, string> = {
  supports: 'Supports claim',
  limits: 'Limits payout',
  excludes: 'Exclusion',
  procedure: 'Procedure',
  neutral: 'Context',
};

const CHECK_LABEL = {
  exact: 'Word for word from your policy',
  closest: 'Matched to your policy’s wording',
  none: 'Not found word for word',
} as const;

interface Props {
  citations: Citation[];
  /** Optional per-clause notes (from the post-call report) shown instead of the live one-liner. */
  notes?: Record<string, string>;
  empty?: string;
  /** Show a clause in the policy viewer. */
  onSelect?: (citation: Citation) => void;
}

export function ClauseList({
  citations,
  notes,
  empty = 'Clauses the assistant relies on get pinned here, word for word.',
  onSelect,
}: Props) {
  return (
    <section className="glass panel clauses" aria-label="Cited clauses">
      <div className="panel-head">
        <h3 className="eyebrow">Cited clauses</h3>
        {citations.length > 0 && <span className="chip">{citations.length}</span>}
      </div>

      {citations.length === 0 ? (
        <p className="panel-empty">{empty}</p>
      ) : (
        <ol className="clause-list">
          {citations.map((c) => (
            <li key={c.id} className="clause" data-effect={c.effect ?? 'neutral'}>
              <div className="clause-head">
                <span className="clause-ref mono">
                  <Icon name="pin" />
                  {c.clause_ref}
                </span>
                {c.title && <span className="clause-title">{c.title}</span>}
                {c.effect && <span className="clause-effect">{EFFECT_LABEL[c.effect]}</span>}
              </div>
              <blockquote>“{c.quote}”</blockquote>
              <p className="clause-meaning">{notes?.[c.clause_ref] ?? c.meaning}</p>
              {(c.check || onSelect) && (
                <div className="clause-foot">
                  {c.check && (
                    <span className="clause-check" data-check={c.check}>
                      <Icon name={c.check === 'none' ? 'alert' : 'check'} />
                      {CHECK_LABEL[c.check]}
                      {c.location && ` · p.${c.location.page}`}
                    </span>
                  )}
                  {onSelect && (
                    <button type="button" className="link-btn clause-show" onClick={() => onSelect(c)}>
                      Show in policy
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
