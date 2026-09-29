// Types shared by the browser app and the /api functions.
// Tool argument shapes must stay in sync with the declarations in api/_lib/live-config.ts.

export type ClaimType = 'health' | 'motor' | 'home' | 'travel' | 'life' | 'other';
export type ClaimRoute = 'cashless' | 'reimbursement' | 'unknown';

export interface ClaimFile {
  claim_type?: ClaimType;
  policy_number?: string;
  insurer?: string;
  policy_name?: string;
  policyholder?: string;
  patient_or_driver?: string;
  incident_date?: string;
  incident_summary?: string;
  location?: string;
  claim_amount?: number;
  claim_route?: ClaimRoute;
  insurer_informed?: boolean;
}

export type ClauseEffect = 'supports' | 'limits' | 'excludes' | 'procedure' | 'neutral';

export interface CiteClauseArgs {
  /** Id of the clause in the app's copy of the policy, e.g. "C12". */
  clause_id?: string;
  clause_ref: string;
  title?: string;
  quote: string;
  meaning: string;
  effect?: ClauseEffect;
}

export type CoverageVerdict = 'likely_covered' | 'partly_covered' | 'likely_not_covered' | 'need_more_info';

export interface AssessCoverageArgs {
  verdict: CoverageVerdict;
  summary: string;
  reasons?: string[];
  clause_refs?: string[];
  confidence?: 'low' | 'medium' | 'high';
}

export type AdjustmentKind = 'deduct_fixed' | 'deduct_percent' | 'proportionate' | 'cap';

export interface PayoutAdjustment {
  label: string;
  kind: AdjustmentKind;
  /** Rupees for deduct_fixed and cap, a percentage for deduct_percent, the eligible amount for proportionate. */
  value: number;
  /** Only for proportionate: what was actually charged (e.g. actual room rent per day). */
  actual?: number;
  /** The part of the bill this adjustment applies to (proportionate, percent, cap). Defaults to the running amount. */
  applies_to?: number;
  clause_ref?: string;
}

export interface EstimatePayoutArgs {
  claimed_amount: number;
  adjustments?: PayoutAdjustment[];
  note?: string;
}

export interface PayoutStep {
  label: string;
  clause_ref?: string;
  change: number;
  running: number;
}

export interface PayoutEstimate {
  claimed: number;
  payable: number;
  callerPays: number;
  steps: PayoutStep[];
  note?: string;
}

export interface NextStepsArgs {
  steps: string[];
  documents?: string[];
  deadline?: string;
}

// ---- Policy at a glance (/api/digest) ----

export interface DigestFact {
  label: string;
  value: string;
  /** Id of the clause that states it, e.g. "C12". */
  clause_id: string;
}

export interface DigestWatchOut {
  title: string;
  detail: string;
  clause_id: string;
}

export interface PolicyDigest {
  product: string;
  kind: ClaimType;
  one_liner: string;
  key_facts: DigestFact[];
  watch_outs: DigestWatchOut[];
}

// ---- Post-call report (/api/report) ----

export interface TranscriptLine {
  speaker: 'caller' | 'assistant';
  text: string;
}

export interface ReportRequest {
  transcript: TranscriptLine[];
  claim: ClaimFile;
  citations: CiteClauseArgs[];
  coverage?: AssessCoverageArgs;
  payout?: PayoutEstimate;
  nextSteps?: NextStepsArgs;
  durationSeconds: number;
  /** Languages the caller spoke, e.g. ["Hindi", "English"]. */
  languages?: string[];
  policyName?: string;
}

export interface CallReport {
  title: string;
  intent: 'new_claim' | 'policy_question' | 'claim_follow_up' | 'other';
  summary: string;
  caller_sentiment: 'calm' | 'worried' | 'frustrated' | 'confused' | 'unknown';
  coverage_explanation: string;
  clause_notes: { ref: string; why_it_matters: string }[];
  open_questions: string[];
  next_steps: string[];
  documents: string[];
  flags: string[];
}
