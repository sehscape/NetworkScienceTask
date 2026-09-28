import type { EstimatePayoutArgs, PayoutEstimate, PayoutStep } from '../../shared/types';
import { toNumber } from '../lib/format';

const round = (n: number) => Math.round(n);

/**
 * The model decides WHICH policy rules apply (and cites them); this function
 * does the arithmetic. Language models are unreliable at multi-step money
 * maths, and "the assistant said ₹1.4 lakh" is not something you want to be
 * wrong about on an insurance call.
 */
export function calculatePayout(args: EstimatePayoutArgs): PayoutEstimate {
  const claimed = round(Math.max(0, toNumber(args.claimed_amount)));
  let running = claimed;
  const steps: PayoutStep[] = [];

  for (const adj of args.adjustments ?? []) {
    const value = Math.max(0, toNumber(adj.value));
    const base = adj.applies_to !== undefined ? Math.min(Math.max(0, toNumber(adj.applies_to)), running) : running;
    let change = 0;

    switch (adj.kind) {
      case 'deduct_fixed':
        change = -Math.min(running, value);
        break;
      case 'deduct_percent':
        change = -(base * Math.min(value, 100)) / 100;
        break;
      case 'proportionate': {
        // Pay eligible/actual of the affected amount, e.g. room rent limit ₹5,000 vs ₹8,000 charged.
        const actual = toNumber(adj.actual);
        if (actual > 0 && value < actual) change = -base * (1 - value / actual);
        break;
      }
      case 'cap':
        change = running > value ? value - running : 0;
        break;
      default:
        continue;
    }

    change = round(change);
    running = Math.max(0, running + change);
    steps.push({ label: String(adj.label || 'Adjustment'), clause_ref: adj.clause_ref, change, running });
  }

  return { claimed, payable: running, callerPays: claimed - running, steps, note: args.note };
}
