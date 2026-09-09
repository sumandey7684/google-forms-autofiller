import type { QuestionType } from './form';

/**
 * Serializable classification DTOs (no DOM).
 * `non_question` / `unsupported` are classifier-layer kinds, not core Question types.
 */

export type ClassifierKind =
  | QuestionType
  | 'non_question'
  | 'unsupported';

/** Discrete confidence — not a calibrated probability. */
export type ClassificationConfidence = 1 | 0.8 | 0.4 | 0.2;

export interface ClassifiedQuestion {
  discoveryId: string;
  providerId?: string;
  index: number;
  kind: ClassifierKind;
  confidence: ClassificationConfidence;
  signals: readonly string[];
  reason: string;
}

export interface ClassificationTotals {
  total: number;
  fillable: number;
  unknown: number;
  nonQuestion: number;
  unsupported: number;
  byKind: Readonly<Record<ClassifierKind, number>>;
}

export interface ClassificationReport {
  url: string;
  questions: readonly ClassifiedQuestion[];
  totals: ClassificationTotals;
}

export function emptyKindCounts(): Record<ClassifierKind, number> {
  return {
    text: 0,
    paragraph: 0,
    multiple_choice: 0,
    checkbox: 0,
    dropdown: 0,
    linear_scale: 0,
    date: 0,
    time: 0,
    unknown: 0,
    non_question: 0,
    unsupported: 0,
  };
}
