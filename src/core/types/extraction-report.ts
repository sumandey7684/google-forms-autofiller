/**
 * Serializable P4 extraction diagnostics (no DOM, no answer values).
 */

import type { Form } from './form';

export type ExtractionWarningCode =
  | 'missing_title'
  | 'missing_provider_id'
  | 'required_unknown'
  | 'missing_options'
  | 'unsupported_omitted'
  | 'non_question_omitted'
  | 'classification_mismatch'
  | 'incomplete_question'
  | 'form_title_missing';

export interface ExtractionWarning {
  code: ExtractionWarningCode;
  discoveryId?: string;
  message: string;
}

export interface ExtractionQuestionDiag {
  discoveryId: string;
  providerId: string | null;
  classificationKind: string;
  /** Classification reason when available (esp. omitted unsupported). */
  classificationReason: string | null;
  /** Classification signals when available. */
  classificationSignals: readonly string[];
  extracted: boolean;
  questionId: string | null;
  missingTitle: boolean;
  missingProviderId: boolean;
  /**
   * true when P2 produced a confident required boolean;
   * false when required state is unknown on the Form (required omitted).
   */
  requiredKnown: boolean;
  optionCount: number | null;
}

export interface ExtractionTotals {
  discovered: number;
  extractedQuestions: number;
  omittedNonQuestion: number;
  omittedUnsupported: number;
  unknownQuestions: number;
  missingTitles: number;
  missingProviderIds: number;
  requiredUnknown: number;
  missingOptions: number;
  sectionCount: number;
  warningCount: number;
}

export interface ExtractionReport {
  url: string;
  formId: string;
  /**
   * Extraction covers only the currently visible respondent DOM
   * (typically one Google Forms section/page). Not a claim of full-form completeness.
   */
  scope: 'current_visible_dom';
  totals: ExtractionTotals;
  questions: readonly ExtractionQuestionDiag[];
  warnings: readonly ExtractionWarning[];
}

export interface ExtractionResult {
  form: Form;
  report: ExtractionReport;
}
