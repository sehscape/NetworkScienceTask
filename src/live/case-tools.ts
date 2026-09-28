import type {
  AssessCoverageArgs,
  CiteClauseArgs,
  ClaimFile,
  ClaimType,
  EstimatePayoutArgs,
  NextStepsArgs,
  PayoutEstimate,
} from '../../shared/types';
import { formatINR, toNumber } from '../lib/format';
import { redact } from '../lib/redact';
import { calculatePayout } from './payout';

export interface Citation extends CiteClauseArgs {
  id: string;
  at: number;
}

export interface CaseState {
  claim: ClaimFile;
  /** Fields touched by the most recent update, so the UI can flash them. */
  recentlyUpdated: (keyof ClaimFile)[];
  citations: Citation[];
  coverage?: AssessCoverageArgs;
  payout?: PayoutEstimate;
  nextSteps?: NextStepsArgs;
}

export const emptyCase = (): CaseState => ({ claim: {}, recentlyUpdated: [], citations: [] });

export interface ToolResult {
  state: CaseState;
  /** Sent back to the model as the function response. */
  response: Record<string, unknown>;
  /** Short line for the activity feed, e.g. "Pinned clause 3.6". */
  activity: string;
}

const REQUIRED_FIELDS: Record<ClaimType | 'unknown', (keyof ClaimFile)[]> = {
  health: ['policy_number', 'patient_or_driver', 'incident_date', 'incident_summary', 'location', 'claim_amount', 'claim_route'],
  motor: ['policy_number', 'incident_date', 'incident_summary', 'location', 'claim_amount', 'insurer_informed'],
  home: ['policy_number', 'incident_date', 'incident_summary', 'location', 'claim_amount'],
  travel: ['policy_number', 'incident_date', 'incident_summary', 'location', 'claim_amount'],
  life: ['policy_number', 'policyholder', 'incident_date', 'incident_summary'],
  other: ['policy_number', 'incident_date', 'incident_summary'],
  unknown: ['claim_type', 'policy_number', 'incident_date', 'incident_summary'],
};

const CLAIM_KEYS = new Set<keyof ClaimFile>([
  'claim_type',
  'policy_number',
  'insurer',
  'policy_name',
  'policyholder',
  'patient_or_driver',
  'incident_date',
  'incident_summary',
  'location',
  'claim_amount',
  'claim_route',
  'insurer_informed',
]);

export function missingFields(claim: ClaimFile) {
  const required = REQUIRED_FIELDS[claim.claim_type ?? 'unknown'];
  return required.filter((key) => claim[key] === undefined || claim[key] === '');
}

let idCounter = 0;
const nextId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function updateClaim(state: CaseState, args: Record<string, unknown>): ToolResult {
  const patch: ClaimFile = {};
  for (const [key, raw] of Object.entries(args)) {
    if (!CLAIM_KEYS.has(key as keyof ClaimFile) || raw === null || raw === undefined || raw === '') continue;
    const k = key as keyof ClaimFile;
    if (k === 'claim_amount') patch.claim_amount = toNumber(raw);
    else if (k === 'insurer_informed') patch.insurer_informed = raw === true || raw === 'true';
    else (patch as Record<string, unknown>)[k] = redact(String(raw));
  }

  const claim = { ...state.claim, ...patch };
  const updated = Object.keys(patch) as (keyof ClaimFile)[];
  const missing = missingFields(claim);

  return {
    state: { ...state, claim, recentlyUpdated: updated },
    response: { saved: updated, still_missing: missing, claim_file: claim },
    activity: updated.length ? `Claim file updated: ${updated.map(labelFor).join(', ')}` : 'Claim file checked',
  };
}

function citeClause(state: CaseState, args: CiteClauseArgs): ToolResult {
  const ref = String(args.clause_ref || 'unnumbered').trim();
  const citation: Citation = {
    id: nextId(),
    at: Date.now(),
    clause_ref: ref,
    title: args.title,
    quote: String(args.quote ?? '').trim(),
    meaning: String(args.meaning ?? '').trim(),
    effect: args.effect,
  };

  // Re-citing the same clause refreshes it and moves it to the top instead of duplicating.
  const others = state.citations.filter((c) => c.clause_ref.toLowerCase() !== ref.toLowerCase());
  const citations = [citation, ...others];

  return {
    state: { ...state, citations, recentlyUpdated: [] },
    response: { pinned: true, clause_ref: ref, clauses_pinned: citations.length },
    activity: `Pinned clause ${ref}${args.title ? ` · ${args.title}` : ''}`,
  };
}

function assessCoverage(state: CaseState, args: AssessCoverageArgs): ToolResult {
  const coverage: AssessCoverageArgs = {
    verdict: args.verdict ?? 'need_more_info',
    summary: String(args.summary ?? ''),
    reasons: Array.isArray(args.reasons) ? args.reasons.map(String) : [],
    clause_refs: Array.isArray(args.clause_refs) ? args.clause_refs.map(String) : [],
    confidence: args.confidence,
  };
  return {
    state: { ...state, coverage, recentlyUpdated: [] },
    response: { recorded: true },
    activity: `Coverage view: ${coverage.verdict.replace(/_/g, ' ')}`,
  };
}

/** Adjustments the calculator can't apply as given. Better to send the model back than to show a wrong number. */
function payoutProblems(args: EstimatePayoutArgs) {
  const problems: string[] = [];
  if (!(toNumber(args.claimed_amount) > 0)) problems.push('claimed_amount must be the total bill in rupees.');
  for (const adj of args.adjustments ?? []) {
    const value = toNumber(adj.value);
    if (adj.kind === 'proportionate' && !(toNumber(adj.actual) > 0 && value > 0)) {
      problems.push(
        `"${adj.label}": a proportionate deduction needs value = the eligible amount (e.g. room rent limit per day) and actual = what was charged (e.g. actual room rent per day).`,
      );
    }
    if (adj.kind === 'deduct_percent' && !(value > 0 && value <= 100)) problems.push(`"${adj.label}": value must be a percentage between 0 and 100.`);
    if ((adj.kind === 'deduct_fixed' || adj.kind === 'cap') && !(value > 0)) problems.push(`"${adj.label}": value must be a rupee amount.`);
  }
  return problems;
}

function estimatePayout(state: CaseState, args: EstimatePayoutArgs): ToolResult {
  const problems = payoutProblems(args);
  if (problems.length) {
    return {
      state,
      response: { error: 'Nothing was calculated. Fix these and call estimate_payout again.', problems },
      activity: 'Payout estimate needs more detail',
    };
  }

  const payout = calculatePayout(args);
  return {
    state: { ...state, payout, recentlyUpdated: [] },
    response: {
      claimed: formatINR(payout.claimed),
      estimated_payable: formatINR(payout.payable),
      caller_bears: formatINR(payout.callerPays),
      breakdown: payout.steps.map((s) => ({
        step: s.label,
        clause: s.clause_ref,
        change: formatINR(s.change),
        running_total: formatINR(s.running),
      })),
      reminder: 'This is an estimate. The insurer\'s final assessment can differ.',
    },
    activity: `Estimated payable ${formatINR(payout.payable)} of ${formatINR(payout.claimed)}`,
  };
}

function setNextSteps(state: CaseState, args: NextStepsArgs): ToolResult {
  const nextSteps: NextStepsArgs = {
    steps: Array.isArray(args.steps) ? args.steps.map(String) : [],
    documents: Array.isArray(args.documents) ? args.documents.map(String) : [],
    deadline: args.deadline ? String(args.deadline) : undefined,
  };
  return {
    state: { ...state, nextSteps, recentlyUpdated: [] },
    response: { recorded: true },
    activity: `Next steps shared (${nextSteps.steps.length})`,
  };
}

export function runTool(name: string, args: Record<string, unknown> | undefined, state: CaseState): ToolResult {
  const a = args ?? {};
  switch (name) {
    case 'update_claim':
      return updateClaim(state, a);
    case 'cite_clause':
      return citeClause(state, a as unknown as CiteClauseArgs);
    case 'assess_coverage':
      return assessCoverage(state, a as unknown as AssessCoverageArgs);
    case 'estimate_payout':
      return estimatePayout(state, a as unknown as EstimatePayoutArgs);
    case 'set_next_steps':
      return setNextSteps(state, a as unknown as NextStepsArgs);
    default:
      return { state, response: { error: `Unknown tool "${name}"` }, activity: `Ignored unknown tool ${name}` };
  }
}

const LABELS: Record<keyof ClaimFile, string> = {
  claim_type: 'claim type',
  policy_number: 'policy number',
  insurer: 'insurer',
  policy_name: 'policy',
  policyholder: 'policyholder',
  patient_or_driver: 'person affected',
  incident_date: 'date',
  incident_summary: 'what happened',
  location: 'location',
  claim_amount: 'amount',
  claim_route: 'claim route',
  insurer_informed: 'insurer informed',
};

export const labelFor = (key: keyof ClaimFile) => LABELS[key] ?? key;
