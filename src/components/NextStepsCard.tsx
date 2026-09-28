import type { NextStepsArgs } from '../../shared/types';
import { Icon } from './Icon';

export function NextStepsCard({ next }: { next?: NextStepsArgs }) {
  if (!next || !next.steps.length) return null;

  return (
    <section className="glass panel next-steps" aria-label="Next steps">
      <div className="panel-head">
        <h3 className="eyebrow">Next steps</h3>
      </div>

      <ol className="steps">
        {next.steps.map((step, i) => (
          <li key={i}>
            <span className="step-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {!!next.documents?.length && (
        <>
          <h4 className="subhead">Keep these ready</h4>
          <ul className="docs">
            {next.documents.map((doc, i) => (
              <li key={i}>
                <Icon name="check" />
                <span>{doc}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {next.deadline && <p className="deadline">{next.deadline}</p>}
    </section>
  );
}
