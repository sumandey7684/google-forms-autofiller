/**
 * Domain answers — distinct from DOM control values.
 */

export type AnswerSource =
  | 'profile'
  | 'saved_answer'
  | 'rule'
  | 'ai'
  | 'manual';

export type AnswerStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'filled'
  | 'failed';

/**
 * Discriminated answer payload.
 * - single: text, paragraph, multiple_choice, dropdown, linear_scale, date, time
 * - multi: checkbox (typically option ids)
 */
export type AnswerValue =
  | { kind: 'single'; value: string }
  | { kind: 'multi'; values: readonly string[] };

export interface FormAnswer {
  questionId: string;
  value: AnswerValue;
  source: AnswerSource;
  /** Optional 0–1 confidence once ranking/AI exist. */
  confidence?: number;
  status: AnswerStatus;
}

export function singleValue(value: string): AnswerValue {
  return { kind: 'single', value };
}

export function multiValue(values: readonly string[]): AnswerValue {
  return { kind: 'multi', values };
}
