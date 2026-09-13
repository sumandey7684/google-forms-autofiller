import { getFormQuestions } from '@/core/types/form';
import { matchFormQuestions } from '@/core/matching/index';
import { resolveAnswersWithAiFallback } from '@/core/ai/orchestrate';
import type { OrchestratedAnswerResult } from '@/core/ai/types';
import {
  validateAnswersForFill,
  type AnswerCandidate,
} from '@/core/answer-validation/index';
import type { ProfileValues } from '@/core/resolution/types';
import type {
  AutofillPrepareReport,
  AutofillReviewItem,
  PrepareAutofillReviewInput,
} from './types';

function isProfileEmpty(profile: ProfileValues | null): boolean {
  if (profile === null) {
    return true;
  }
  for (const value of Object.values(profile)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return false;
    }
  }
  return true;
}

function toCandidate(result: OrchestratedAnswerResult): AnswerCandidate {
  return {
    questionId: result.questionId,
    ...(result.value !== undefined ? { value: result.value } : {}),
    upstreamStatus: result.status,
    ...(result.source !== undefined ? { source: result.source } : {}),
    ...(result.sourceKey !== undefined ? { sourceKey: result.sourceKey } : {}),
    ...(result.providerId !== undefined
      ? { providerId: result.providerId }
      : {}),
    ...(result.validationErrors.length > 0
      ? { validationErrors: result.validationErrors }
      : {}),
    ...(result.ambiguity !== undefined ? { ambiguity: result.ambiguity } : {}),
  };
}

/**
 * Pure P7→P8→P9→P10 prepare step for the review UI.
 * Does not touch DOM, storage, messaging, or execute fills.
 */
export async function prepareAutofillReview(
  input: PrepareAutofillReviewInput,
): Promise<AutofillPrepareReport> {
  const matching = matchFormQuestions(input.form);
  const orchestration = await resolveAnswersWithAiFallback({
    form: input.form,
    matching,
    profile: input.profile,
    savedAnswers: input.savedAnswers,
    provider: input.provider,
    ...(input.includeProfileContext !== undefined
      ? { includeProfileContext: input.includeProfileContext }
      : {}),
  });

  const validation = validateAnswersForFill({
    form: input.form,
    candidates: orchestration.results.map(toCandidate),
  });

  const questions = new Map(
    getFormQuestions(input.form).map((question) => [question.id, question]),
  );

  const items: AutofillReviewItem[] = validation.results.map((result) => {
    const question = questions.get(result.questionId);
    return {
      questionId: result.questionId,
      questionText: question?.text ?? result.questionId,
      questionType: question?.type ?? 'unknown',
      status: result.status,
      required: result.required,
      validationErrors: result.validationErrors,
      fillable: result.fillable,
      approved: result.fillable,
      editable: result.fillable,
      ...(result.value !== undefined ? { value: result.value } : {}),
      ...(result.source !== undefined ? { source: result.source } : {}),
      ...(result.sourceKey !== undefined
        ? { sourceKey: result.sourceKey }
        : {}),
      ...(result.providerId !== undefined
        ? { providerId: result.providerId }
        : {}),
      ...(result.ambiguity !== undefined
        ? { ambiguity: result.ambiguity }
        : {}),
    };
  });

  return {
    formId: input.form.id,
    formTitle: input.form.title,
    matching,
    orchestration,
    validation,
    items,
    fillableCount: validation.totals.fillable,
    profilePresent: input.profile !== null,
    profileEmpty: isProfileEmpty(input.profile),
  };
}
