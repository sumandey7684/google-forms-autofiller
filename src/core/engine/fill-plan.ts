import { getFormQuestions } from '@/core/types/form';
import type { FillPlan } from '@/core/types/fill';
import { validateAnswerCandidate } from '@/core/answer-validation/index';
import type {
  BuildFillPlanInput,
  BuildFillPlanRejection,
  BuildFillPlanResult,
} from './types';

/**
 * Construct a FillPlan only from user-approved answers that still pass P10.
 * Never invents values and never includes non-fillable results.
 */
export function buildFillPlanFromApproved(
  input: BuildFillPlanInput,
): BuildFillPlanResult {
  const questions = new Map(
    getFormQuestions(input.form).map((question) => [question.id, question]),
  );
  const rejected: BuildFillPlanRejection[] = [];
  const operations: FillPlan['operations'][number][] = [];
  const seen = new Set<string>();

  for (const entry of input.approved) {
    if (seen.has(entry.questionId)) {
      rejected.push({
        questionId: entry.questionId,
        reason: 'Duplicate approved answer for the same question.',
      });
      continue;
    }
    seen.add(entry.questionId);

    const validated = validateAnswerCandidate(questions.get(entry.questionId), {
      questionId: entry.questionId,
      value: entry.value,
      upstreamStatus: 'resolved',
      source: 'manual',
    });

    if (!validated.fillable || validated.value === undefined) {
      rejected.push({
        questionId: entry.questionId,
        reason:
          validated.validationErrors[0]?.message ??
          `Answer is not fillable (status=${validated.status}).`,
      });
      continue;
    }

    operations.push({
      questionId: entry.questionId,
      value: validated.value,
    });
  }

  if (rejected.length > 0) {
    return { status: 'rejected', rejected };
  }

  if (operations.length === 0) {
    return { status: 'empty', rejected: [] };
  }

  const plan: FillPlan = {
    formId: input.form.id,
    operations,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  return { status: 'ok', plan, rejected: [] };
}
