import type { AnswerValue } from '@/core/types/answer';
import type { Form, QuestionType } from '@/core/types/form';
import type { FillPlan } from '@/core/types/fill';
import type { MatchingReport } from '@/core/matching/types';
import type { OrchestratedAnswerReport } from '@/core/ai/types';
import type {
  PrefillValidationReport,
  PrefillValidationStatus,
  PrefillValidationError,
  AnswerCandidate,
} from '@/core/answer-validation/types';
import type {
  ProfileValues,
  ResolutionAmbiguity,
  SavedAnswer,
} from '@/core/resolution/types';
import type { AiAnswerProvider } from '@/core/ai/types';

/**
 * P11 review row: one extracted question after P7→P10.
 * Approval is UI state; only fillable+approved rows become FillPlan ops.
 */
export interface AutofillReviewItem {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  status: PrefillValidationStatus;
  required: boolean | 'unknown';
  value?: AnswerValue;
  source?: AnswerCandidate['source'];
  sourceKey?: string;
  providerId?: string;
  validationErrors: readonly PrefillValidationError[];
  ambiguity?: ResolutionAmbiguity;
  fillable: boolean;
  /** User may approve only when fillable. */
  approved: boolean;
  /** True when the value can be edited in review (fillable rows). */
  editable: boolean;
}

export interface AutofillPrepareReport {
  formId: string;
  formTitle: string;
  matching: MatchingReport;
  orchestration: OrchestratedAnswerReport;
  validation: PrefillValidationReport;
  items: readonly AutofillReviewItem[];
  fillableCount: number;
  /** True when a profile object was supplied (even if fields are empty). */
  profilePresent: boolean;
  /** True when profile is null or has no usable string fields. */
  profileEmpty: boolean;
}

export interface PrepareAutofillReviewInput {
  form: Form;
  profile: ProfileValues | null;
  savedAnswers: readonly SavedAnswer[];
  provider: AiAnswerProvider;
  includeProfileContext?: boolean;
}

export interface ReviewSelectionPatch {
  approved?: boolean;
  /** When set, replaces the candidate value and re-runs P10 validation. */
  editedValue?: AnswerValue;
}

export type ReviewSelectionMap = Readonly<
  Record<string, ReviewSelectionPatch>
>;

export interface ApprovedFillAnswer {
  questionId: string;
  value: AnswerValue;
}

export interface BuildFillPlanInput {
  form: Form;
  approved: readonly ApprovedFillAnswer[];
  createdAt?: string;
}

export interface BuildFillPlanRejection {
  questionId: string;
  reason: string;
}

export interface BuildFillPlanResult {
  status: 'ok' | 'rejected' | 'empty';
  plan?: FillPlan;
  rejected: readonly BuildFillPlanRejection[];
}
