import type { AnswerValue } from '@/core/types/answer';
import type { Form } from '@/core/types/form';
import type {
  AnswerValidationError,
  AnswerValidationErrorCode,
  ResolutionAmbiguity,
} from '@/core/resolution/types';

/**
 * Pre-fill gate statuses. Includes provider_error so P9 failures remain
 * explicit and are never coerced into a fillable answer.
 */
export type PrefillValidationStatus =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'ambiguous'
  | 'unsupported'
  | 'provider_error';

export type PrefillValidationErrorCode =
  | AnswerValidationErrorCode
  | 'required_unanswered'
  | 'question_not_found'
  | 'value_missing';

export interface PrefillValidationError {
  code: PrefillValidationErrorCode;
  /** Safe diagnostic text; never includes answer or profile values. */
  message: string;
}

/**
 * Candidate answer entering the pre-fill gate.
 * Typically produced by P8 resolution or P9 orchestration.
 */
export interface AnswerCandidate {
  questionId: string;
  value?: AnswerValue;
  /**
   * Upstream pipeline status when available.
   * Non-ready statuses are preserved unless a value is present and can be
   * re-checked against the question.
   */
  upstreamStatus?:
    | 'resolved'
    | 'missing'
    | 'invalid'
    | 'ambiguous'
    | 'unsupported'
    | 'blocked'
    | 'provider_error';
  source?: 'profile' | 'saved_answer' | 'ai' | 'manual' | 'rule';
  sourceKey?: string;
  validationErrors?: readonly AnswerValidationError[];
  ambiguity?: ResolutionAmbiguity;
  providerId?: string;
}

export interface PrefillValidationResult {
  questionId: string;
  status: PrefillValidationStatus;
  /** Present only when status is valid. */
  value?: AnswerValue;
  required: boolean | 'unknown';
  source?: AnswerCandidate['source'];
  sourceKey?: string;
  providerId?: string;
  validationErrors: readonly PrefillValidationError[];
  ambiguity?: ResolutionAmbiguity;
  /** True when this result is fill-ready for a later FillPlan builder. */
  fillable: boolean;
}

export interface PrefillValidationTotals {
  total: number;
  valid: number;
  missing: number;
  invalid: number;
  ambiguous: number;
  unsupported: number;
  providerError: number;
  requiredMissing: number;
  fillable: number;
}

export interface PrefillValidationReport {
  formId: string;
  results: readonly PrefillValidationResult[];
  totals: PrefillValidationTotals;
  /** True only when every required question is fillable/valid or known-optional/unknown-required with a valid answer. */
  readyForFillPlan: boolean;
}

export interface ValidateAnswersForFillInput {
  form: Form;
  candidates: readonly AnswerCandidate[];
}
