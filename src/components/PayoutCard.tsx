import type { PayoutEstimate } from '../../shared/types';
import { formatINR } from '../lib/format';

export function PayoutCard({ payout }: { payout?: PayoutEstimate }) {
  if (!payout) return null;
  const share = payout.claimed ? payout.payable / payout.claimed : 0;

  return (
    <section className="glass panel payout" aria-label="Payout estimate">
      <div className="panel-head">
        <h3 className="eyebrow">Estimated payout</h3>
        <span className="chip">calculated, not guessed</span>
      </div>

      <div className="payout-hero">
        <strong>{formatINR(payout.payable)}</strong>
        <span>of {formatINR(payout.claimed)} claimed</span>
      </div>
      <div className="payout-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </div>

      {payout.steps.length > 0 && (
        <table className="payout-steps">
          <tbody>
            <tr>
              <th scope="row">Claimed</th>
              <td />
              <td>{formatINR(payout.claimed)}</td>
            </tr>
            {payout.steps.map((step, i) => (
              <tr key={i}>
                <th scope="row">
                  {step.label}
                  {step.clause_ref && <span className="mono"> · {step.clause_ref}</span>}
                </th>
                <td className="change">{step.change === 0 ? '—' : formatINR(step.change)}</td>
                <td>{formatINR(step.running)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {payout.callerPays > 0 && <p className="hint">You would bear about {formatINR(payout.callerPays)}.</p>}
      {payout.note && <p className="hint">{payout.note}</p>}
    </section>
  );
}
