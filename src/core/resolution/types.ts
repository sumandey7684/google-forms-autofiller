import type { AnswerSource, AnswerValue } from '@/core/types/answer';
import type { Form, QuestionType } from '@/core/types/form';
import type { MatchingReport, ProfileField } from '@/core/matching/types';

export type AnswerResolutionSource = Extract<
  AnswerSource,
  'profile' | 'saved_answer'
>;

export type AnswerResolutionStatus =
  | 'resolved'
  | 'missing'
  | 'invalid'
  | 'ambiguous'
  | 'unsupported'
  | 'blocked';

/** Discrete deterministic rule strength, not a probability. */
export type AnswerResolutionCertainty = 1 | 0.9 | 0.75 | 0;

export type AnswerValidationStatus =
  | 'valid'
  | 'invalid'
  | 'ambiguous'
  | 'unsupported';

export type AnswerValidationErrorCode =
  | 'answer_kind_mismatch'
  | 'empty_answer'
  | 'option_not_found'
  | 'option_ambiguous'
  | 'duplicate_selection'
  | 'scale_out_of_range'
  | 'invalid_date'
  | 'invalid_time'
  | 'unsupported_question'
  | 'saved_answer_ambiguous'
  | 'profile_match_ambiguous'
  | 'profile_match_invalid'
  | 'profile_value_missing'
  | 'match_result_missing';

export interface AnswerValidationError {
  code: AnswerValidationErrorCode;
  /** Safe diagnostic text; never includes profile or answer values. */
  message: string;
}

export interface ResolutionAmbiguity {
  source: 'saved_answer' | 'profile_match' | 'option';
  /** Deterministic identifiers only; answer values are never included. */
  sourceKeys: readonly string[];
  message: string;
}

export interface AnswerValidationResult {
  status: AnswerValidationStatus;
  value?: AnswerValue;
  validationErrors: readonly AnswerValidationError[];
  ambiguity?: ResolutionAmbiguity;
}

export interface SavedAnswer {
  /** Deterministic key produced from exact-question or normalized-text identity. */
  key: string;
  questionId?: string;
  normalizedQuestionText: string;
  questionType: QuestionType;
  value: AnswerValue;
  label?: string;
  context?: string;
  updatedAt?: string;
}

export interface CreateSavedAnswerInput {
  questionId?: string;
  questionText: string;
  questionType: QuestionType;
  value: AnswerValue;
  label?: string;
  context?: string;
  updatedAt?: string;
}

/**
 * Structurally compatible with the existing UserProfile without importing
 * its Zod/storage layer into the pure resolver.
 */
export type ProfileValues = Readonly<
  Partial<Record<ProfileField, string>>
>;

export interface ResolveAnswersInput {
  form: Form;
  matching: MatchingReport;
  profile: ProfileValues | null;
  savedAnswers: readonly SavedAnswer[];
}

export interface AnswerResolutionResult {
  questionId: string;
  status: AnswerResolutionStatus;
  source?: AnswerResolutionSource;
  sourceKey?: string;
  value?: AnswerValue;
  certainty: AnswerResolutionCertainty;
  validationErrors: readonly AnswerValidationError[];
  ambiguity?: ResolutionAmbiguity;
}

export interface AnswerResolutionTotals {
  total: number;
  resolved: number;
  missing: number;
  invalid: number;
  ambiguous: number;
  unsupported: number;
  blocked: number;
}

export interface AnswerResolutionReport {
  formId: string;
  results: readonly AnswerResolutionResult[];
  totals: AnswerResolutionTotals;
}
