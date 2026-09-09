import type { FillPlan, FillResult } from '@/core/types/fill';
import { ErrorCode, createAppError } from '@/core/types/errors';

/**
 * Autofill DOM writes will be implemented in a later phase.
 * Structural placeholder only — does not mutate the page.
 */
export function applyFillPlan(plan: FillPlan): FillResult {
  void plan;
  throw createAppError(
    ErrorCode.FILL_FAILED,
    'Form filling is not implemented in P1. This module is a structural placeholder.',
  );
}
