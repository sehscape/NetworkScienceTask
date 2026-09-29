import type {
  AssessCoverageArgs,
  CiteClauseArgs,
  ClaimFile,
  ClaimType,
  EstimatePayoutArgs,
  NextStepsArgs,
  PayoutEstimate,
} from '../../shared/types';
import { verifyQuote, type PolicyIndex, type QuoteCheck } from '../docs/search';
import type { ClauseHit, PolicyChunk } from '../docs/types';
import { formatINR, toNumber } from '../lib/format';
import { redact } from '../lib/redact';
import { calculatePayout } from './payout';

export interface Citation extends CiteClauseArgs {
  id: string;
  at: number;
  /** Where the clause is in the loaded document, when the app found it. */
  location?: ClauseHit;
  /** Whether the quote was found word for word in that clause. */
  check?: QuoteCheck['status'];
}

export interface Declined {
  topic: string;
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
  /** Requests the assistant turned down as outside the policy. */
  declined: Declined[];
}

export const emptyCase = (): CaseState => ({ claim: {}, recentlyUpdated: [], citations: [], declined: [] });

export interface ToolResult {
  state: CaseState;
  /** Sent back to the model as the function response. */
  response: Record<string, unknown>;
  /** Short label shown under the assistant's message, e.g. "Clause 3.6 highlighted". */
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
    activity: updated.length ? 'Claim file updated' : 'Claim file checked',
  };
}

const SEARCH_RESULTS = 4;

function searchPolicy(state: CaseState, args: Record<string, unknown>, index?: PolicyIndex): ToolResult {
  if (!index) {
    return {
      state,
      response: {
        error:
          'No policy document is loaded in the app. If the caller is sharing their screen, read it there; otherwise ask them to upload their policy.',
      },
      activity: 'No policy to search',
    };
  }

  const query = String(args.query ?? '').trim();
  const ids = Array.isArray(args.clause_ids) ? args.clause_ids.map(String).slice(0, 6) : [];
  const found = [
    ...ids.map((id) => index.byId(id)),
    ...(query ? index.search(query, SEARCH_RESULTS).map((hit) => hit.chunk) : []),
  ].filter((c): c is PolicyChunk => !!c);
  const results = [...new Map(found.map((c) => [c.id, c])).values()].slice(0, 6);

  // The live model follows instructions best when they arrive with the data,
  // so the results lead with a one-line reminder of what to do next.
  return {
    state,
    response: results.length
      ? {
          next:
            'First call cite_clause for the clause you will rely on (its clause_id and exact words from its text), then answer the caller briefly from it. Take their plan, members, sum insured and dates from the schedule at the top of the policy; do not ask for them.',
          results: results.map((c) => ({
            clause_id: c.id,
            clause_ref: c.ref,
            heading: c.heading,
            section: c.section,
            page: c.location.page,
            text: c.text,
          })),
        }
      : {
          next: 'Nothing matches. Try different keywords once; if there is still nothing, tell the caller their policy does not mention it.',
          results: [],
        },
    activity: query ? `Searched the policy for “${query}”` : `Read ${ids.join(', ')}`,
  };
}

function citeClause(state: CaseState, args: CiteClauseArgs, index?: PolicyIndex): ToolResult {
  const quote = String(args.quote ?? '').trim();
  const chunk = index?.resolve({ id: args.clause_id, ref: args.clause_ref, quote });
  const check = chunk ? verifyQuote(chunk, quote) : undefined;
  const ref = String(args.clause_ref || chunk?.ref || chunk?.heading.slice(0, 40) || 'unnumbered').trim();

  const citation: Citation = {
    id: nextId(),
    at: Date.now(),
    clause_id: chunk?.id ?? args.clause_id,
    clause_ref: ref,
    title: args.title,
    // A paraphrase is swapped for the policy's real sentence, so the screen
    // only ever shows words that are actually in the document.
    quote: check?.status === 'closest' ? check.text : quote,
    meaning: String(args.meaning ?? '').trim(),
    effect: args.effect,
    location: chunk?.location,
    check: check?.status,
  };

  // Re-citing the same clause refreshes it and moves it to the top instead of duplicating.
  const key = (c: Citation) => c.clause_id ?? c.clause_ref.toLowerCase();
  const others = state.citations.filter((c) => key(c) !== key(citation));
  const citations = [citation, ...others];

  const response: Record<string, unknown> = { pinned: true, clause_ref: ref, clauses_pinned: citations.length };
  if (chunk) response.page = chunk.location.page;
  if (check?.status === 'closest') {
    response.quote_check = 'Your quote was not word for word. The caller sees this sentence from the clause instead.';
    response.shown_quote = check.text;
  } else if (check?.status === 'none') {
    response.quote_check = 'Your quote is not in this clause. Re-read it before you rely on it, and correct yourself if needed.';
    response.clause_text = chunk!.text.slice(0, 1200);
  } else if (index && !chunk) {
    response.pinned = false;
    response.quote_check = 'No clause like that exists in the loaded policy. Use search_policy to find the right one.';
  }

  return {
    state: { ...state, citations, recentlyUpdated: [] },
    response,
    activity: chunk || !index ? `Clause ${ref} highlighted` : `Clause ${ref} not found`,
  };
}

function flagOutOfScope(state: CaseState, args: Record<string, unknown>): ToolResult {
  const topic = String(args.topic ?? 'off-topic request').trim().slice(0, 60);
  return {
    state: { ...state, declined: [...state.declined, { topic, at: Date.now() }], recentlyUpdated: [] },
    response: { recorded: true },
    activity: 'Kept to your policy',
  };
}

function assessCoverage(state: CaseState, args: AssessCoverageArgs, index?: PolicyIndex): ToolResult {
  // The model sometimes lists clause ids ("C71"); show the printed number instead.
  const printed = (ref: string) => {
    const chunk = index?.byId(ref);
    return chunk ? (chunk.ref ?? `page ${chunk.location.page}`) : ref;
  };
  const coverage: AssessCoverageArgs = {
    verdict: args.verdict ?? 'need_more_info',
    summary: String(args.summary ?? ''),
    reasons: Array.isArray(args.reasons) ? args.reasons.map(String) : [],
    clause_refs: Array.isArray(args.clause_refs) ? args.clause_refs.map((r) => printed(String(r))) : [],
    confidence: args.confidence,
  };
  return {
    state: { ...state, coverage, recentlyUpdated: [] },
    response: { recorded: true },
    activity: `Coverage: ${coverage.verdict.replace(/_/g, ' ')}`,
  };
}

/** Adjustments the calculator can't apply as given. Better to send the model back than to show a wrong number. */
function payoutProblems(args: EstimatePayoutArgs, claim: ClaimFile) {
  const problems: string[] = [];
  const claimed = toNumber(args.claimed_amount);
  if (!(claimed > 0)) problems.push('claimed_amount must be the total bill in rupees.');
  if (claim.claim_amount && claimed < claim.claim_amount * 0.5) {
    problems.push(
      `claimed_amount (${formatINR(claimed)}) is far below the bill in the claim file (${formatINR(claim.claim_amount)}). Use the total bill.`,
    );
  }
  for (const adj of args.adjustments ?? []) {
    const value = toNumber(adj.value);
    if (adj.kind === 'proportionate' && !(toNumber(adj.actual) > 0 && value > 0)) {
      problems.push(
        `"${adj.label}": a proportionate deduction needs value = the eligible amount (e.g. room rent limit per day) and actual = what was charged (e.g. actual room rent per day).`,
      );
    }
    if (adj.kind === 'deduct_percent' && !(value > 0 && value <= 100)) problems.push(`"${adj.label}": value must be a percentage between 0 and 100.`);
    if ((adj.kind === 'deduct_fixed' || adj.kind === 'cap') && !(value > 0)) problems.push(`"${adj.label}": value must be a rupee amount.`);
    if (adj.kind === 'cap' && adj.applies_to === undefined && value > 0 && value < claimed * 0.25) {
      problems.push(
        `"${adj.label}": a cap of ${formatINR(value)} would limit the whole claim to that amount. A cap without applies_to is for the sum insured. For a per-day room-rent limit use kind "proportionate"; for a sub-limit on one item, pass that item's cost as applies_to.`,
      );
    }
  }
  return problems;
}

function estimatePayout(state: CaseState, args: EstimatePayoutArgs): ToolResult {
  const problems = payoutProblems(args, state.claim);
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
    activity: `Payout ${formatINR(payout.payable)}`,
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
    activity: 'Next steps added',
  };
}

export function runTool(
  name: string,
  args: Record<string, unknown> | undefined,
  state: CaseState,
  index?: PolicyIndex,
): ToolResult {
  const a = args ?? {};
  switch (name) {
    case 'search_policy':
      return searchPolicy(state, a, index);
    case 'update_claim':
      return updateClaim(state, a);
    case 'cite_clause':
      return citeClause(state, a as unknown as CiteClauseArgs, index);
    case 'flag_out_of_scope':
      return flagOutOfScope(state, a);
    case 'assess_coverage':
      return assessCoverage(state, a as unknown as AssessCoverageArgs, index);
    case 'estimate_payout':
      return estimatePayout(state, a as unknown as EstimatePayoutArgs);
    case 'set_next_steps':
      return setNextSteps(state, a as unknown as NextStepsArgs);
    default:
      return { state, response: { error: `Unknown tool "${name}"` }, activity: `Unknown tool ${name}` };
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
