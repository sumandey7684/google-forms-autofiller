import type { AnswerValue } from '@/core/types/answer';
import type { QuestionType } from '@/core/types/form';
import type { ProfileField } from '@/core/matching/types';
import type {
  AnswerResolutionCertainty,
  AnswerResolutionReport,
  AnswerResolutionResult,
  AnswerValidationError,
  ProfileValues,
  ResolutionAmbiguity,
  ResolveAnswersInput,
} from '@/core/resolution/types';

/**
 * Allowlisted profile fields that may appear in AI context.
 * Values are optional and only included when explicitly requested and present.
 */
export const AI_CONTEXT_PROFILE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'linkedInUrl',
  'portfolioUrl',
  'location',
  'notes',
] as const satisfies readonly ProfileField[];

export type AiContextProfileField = (typeof AI_CONTEXT_PROFILE_FIELDS)[number];

export interface AiQuestionOption {
  id: string;
  label: string;
}

/**
 * Minimal, DOM-free question context for an AI provider.
 * Never includes saved answers, passwords, tokens, or whole-form payloads.
 */
export interface AiQuestionContext {
  questionId: string;
  questionText: string;
  description?: string;
  questionType: QuestionType;
  options?: readonly AiQuestionOption[];
  scaleMin?: number;
  scaleMax?: number;
  /** Only allowlisted non-empty profile fields when requested by the caller. */
  profileContext?: Readonly<Partial<Record<AiContextProfileField, string>>>;
}

export type AiProviderProposalStatus =
  | 'proposed'
  | 'unsupported'
  | 'error';

export interface AiProviderProposal {
  status: AiProviderProposalStatus;
  value?: AnswerValue;
  /** Safe diagnostic text; never includes secrets or raw prompt dumps. */
  message?: string;
}

export interface AiAnswerProvider {
  readonly id: string;
  proposeAnswer(context: AiQuestionContext): Promise<AiProviderProposal>;
}

export type OrchestratedAnswerSource = 'profile' | 'saved_answer' | 'ai';

export type OrchestratedAnswerStatus =
  | 'resolved'
  | 'missing'
  | 'invalid'
  | 'ambiguous'
  | 'unsupported'
  | 'blocked'
  | 'provider_error';

/** Discrete certainty including a lower AI fallback strength. */
export type OrchestratedAnswerCertainty = AnswerResolutionCertainty | 0.5;

export interface OrchestratedAnswerResult {
  questionId: string;
  status: OrchestratedAnswerStatus;
  source?: OrchestratedAnswerSource;
  sourceKey?: string;
  value?: AnswerValue;
  certainty: OrchestratedAnswerCertainty;
  validationErrors: readonly AnswerValidationError[];
  ambiguity?: ResolutionAmbiguity;
  providerId?: string;
}

export interface OrchestratedAnswerTotals {
  total: number;
  resolved: number;
  missing: number;
  invalid: number;
  ambiguous: number;
  unsupported: number;
  blocked: number;
  providerError: number;
}

export interface OrchestratedAnswerReport {
  formId: string;
  results: readonly OrchestratedAnswerResult[];
  totals: OrchestratedAnswerTotals;
  /** Present when AI fallback was available during orchestration. */
  aiProviderId?: string;
}

export interface ResolveAnswersWithAiInput {
  form: ResolveAnswersInput['form'];
  matching: ResolveAnswersInput['matching'];
  profile: ProfileValues | null;
  savedAnswers: ResolveAnswersInput['savedAnswers'];
  provider: AiAnswerProvider;
  /**
   * When true, include allowlisted non-empty profile values in AI context.
   * Saved answers are never included.
   */
  includeProfileContext?: boolean;
}

export type { AnswerResolutionReport, AnswerResolutionResult };
