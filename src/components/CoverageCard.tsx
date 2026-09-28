import type { AssessCoverageArgs, CoverageVerdict } from '../../shared/types';
import { Icon, type IconName } from './Icon';

const VERDICTS: Record<CoverageVerdict, { label: string; icon: IconName; level: number }> = {
  likely_covered: { label: 'Likely covered', icon: 'shield', level: 3 },
  partly_covered: { label: 'Partly covered', icon: 'shield', level: 2 },
  likely_not_covered: { label: 'Likely not covered', icon: 'alert', level: 1 },
  need_more_info: { label: 'Needs more information', icon: 'info', level: 0 },
};

export const verdictLabel = (verdict: CoverageVerdict) => (VERDICTS[verdict] ?? VERDICTS.need_more_info).label;

export function CoverageCard({ coverage }: { coverage?: AssessCoverageArgs }) {
  if (!coverage) return null;
  const v = VERDICTS[coverage.verdict] ?? VERDICTS.need_more_info;

  return (
    <section className="glass panel coverage" data-level={v.level} aria-label="Coverage view">
      <div className="panel-head">
        <h3 className="eyebrow">Coverage view</h3>
        {coverage.confidence && <span className="chip">{coverage.confidence} confidence</span>}
      </div>

      <div className="verdict">
        <Icon name={v.icon} />
        <div>
          <strong>{v.label}</strong>
          <p>{coverage.summary}</p>
        </div>
      </div>

      {/* A three-step meter rather than red/amber/green: the brand has exactly one accent colour. */}
      <div className="verdict-meter" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} data-on={v.level >= n} />
        ))}
      </div>

      {!!coverage.reasons?.length && (
        <ul className="reasons">
          {coverage.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      {!!coverage.clause_refs?.length && (
        <p className="hint">
          Based on {coverage.clause_refs.length === 1 ? 'clause' : 'clauses'}{' '}
          <span className="mono">{coverage.clause_refs.join(', ')}</span>
        </p>
      )}
    </section>
  );
}
