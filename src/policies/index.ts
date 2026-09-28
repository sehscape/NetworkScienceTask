import { healthPolicy } from './health';
import { motorPolicy } from './motor';
import type { PolicyDoc } from './types';

export const policies: Record<PolicyDoc['id'], PolicyDoc> = {
  health: healthPolicy,
  motor: motorPolicy,
};

export type { PolicyDoc };
