import type { AnswerValue } from './answer';
import type { ErrorCode } from './errors';

/**
 * Fill intent and outcomes — independent of Google's DOM.
 */

export interface FillOperation {
  questionId: string;
  value: AnswerValue;
}

export interface FillPlan {
  formId: string;
  operations: readonly FillOperation[];
  createdAt: string;
}

export type FillOutcomeStatus =
  | 'success'
  | 'failed'
  | 'skipped'
  | 'unsupported';

export interface FillOperationResult {
  questionId: string;
  status: FillOutcomeStatus;
  /** Present when status is failed or unsupported. */
  errorCode?: ErrorCode;
  message?: string;
}

export interface FillTotals {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  unsupported: number;
}

export interface FillResult {
  formId: string;
  results: readonly FillOperationResult[];
  totals: FillTotals;
}

export function summarizeFillResults(
  results: readonly FillOperationResult[],
): FillTotals {
  let successful = 0;
  let failed = 0;
  let skipped = 0;
  let unsupported = 0;

  for (const result of results) {
    switch (result.status) {
      case 'success':
        successful += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'unsupported':
        unsupported += 1;
        break;
    }
  }

  return {
    total: results.length,
    successful,
    failed,
    skipped,
    unsupported,
  };
}

export function createFillResult(
  formId: string,
  results: readonly FillOperationResult[],
): FillResult {
  return {
    formId,
    results,
    totals: summarizeFillResults(results),
  };
}
