import type { ClaimFile } from '../../shared/types';
import { labelFor, missingFields } from '../live/case-tools';
import { formatDate, formatINR } from '../lib/format';

const ORDER: (keyof ClaimFile)[] = [
  'claim_type',
  'policyholder',
  'patient_or_driver',
  'policy_number',
  'policy_name',
  'insurer',
  'incident_date',
  'location',
  'incident_summary',
  'claim_amount',
  'claim_route',
  'insurer_informed',
];

// Long values read better across the full card width.
const WIDE = new Set<keyof ClaimFile>(['incident_summary', 'policy_number', 'policy_name', 'location']);

function display(key: keyof ClaimFile, claim: ClaimFile) {
  const value = claim[key];
  if (value === undefined || value === '') return null;
  switch (key) {
    case 'claim_amount':
      return formatINR(value as number);
    case 'incident_date':
      return formatDate(value as string);
    case 'insurer_informed':
      return value ? 'Yes' : 'Not yet';
    case 'claim_type':
    case 'claim_route': {
      const s = String(value);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    default:
      return String(value);
  }
}

interface Props {
  claim: ClaimFile;
  recentlyUpdated?: (keyof ClaimFile)[];
  compact?: boolean;
}

export function ClaimFileCard({ claim, recentlyUpdated = [], compact }: Props) {
  const filled = ORDER.filter((key) => display(key, claim) !== null);
  const missing = missingFields(claim);
  const requiredCount = filled.filter((k) => !missing.includes(k)).length + missing.length;
  const progress = requiredCount ? 1 - missing.length / requiredCount : 0;

  return (
    <section className={`glass panel claim-file${compact ? ' compact' : ''}`} aria-label="Claim file">
      <div className="panel-head">
        <h3 className="eyebrow">Claim file</h3>
        {!compact && filled.length > 0 && (
          <span className="progress" role="img" aria-label={`${Math.round(progress * 100)}% complete`}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </div>

      {filled.length === 0 ? (
        <p className="panel-empty">Details appear here as you describe what happened.</p>
      ) : (
        <dl className="fields">
          {filled.map((key) => (
            <div
              key={key}
              className={`field${WIDE.has(key) ? ' wide' : ''}`}
              data-fresh={recentlyUpdated.includes(key)}
            >
              <dt>{labelFor(key)}</dt>
              <dd>{display(key, claim)}</dd>
            </div>
          ))}
        </dl>
      )}

      {!compact && missing.length > 0 && filled.length > 0 && (
        <p className="missing">Still needed: {missing.map(labelFor).join(', ')}</p>
      )}
    </section>
  );
}
