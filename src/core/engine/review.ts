import { getFormQuestions } from '@/core/types/form';
import { validateAnswerCandidate } from '@/core/answer-validation/index';
import type {
  AutofillReviewItem,
  ReviewSelectionMap,
} from './types';

/**
 * Apply user approval / edit patches.
 * Only fillable (or re-validated fillable) answers may be approved.
 * Edits are re-checked with P10 before becoming fillable again.
 */
export function applyReviewSelection(
  items: readonly AutofillReviewItem[],
  selection: ReviewSelectionMap,
  form: Parameters<typeof getFormQuestions>[0],
): AutofillReviewItem[] {
  const questions = new Map(
    getFormQuestions(form).map((question) => [question.id, question]),
  );

  return items.map((item) => {
    const patch = selection[item.questionId];
    if (!patch) {
      return item;
    }

    if (patch.editedValue !== undefined) {
      const validated = validateAnswerCandidate(questions.get(item.questionId), {
        questionId: item.questionId,
        value: patch.editedValue,
        upstreamStatus: 'resolved',
        source: 'manual',
        sourceKey: 'manual:review',
      });

      const fillable = validated.fillable;
      const approved =
        fillable && patch.approved !== undefined
          ? patch.approved
          : fillable;

      return {
        questionId: item.questionId,
        questionText: item.questionText,
        questionType: item.questionType,
        status: validated.status,
        required: validated.required,
        validationErrors: validated.validationErrors,
        fillable,
        approved: fillable ? approved : false,
        editable: true,
        source: 'manual',
        sourceKey: 'manual:review',
        ...(validated.value !== undefined ? { value: validated.value } : {}),
        ...(validated.ambiguity !== undefined
          ? { ambiguity: validated.ambiguity }
          : {}),
      };
    }

    if (patch.approved !== undefined) {
      return {
        ...item,
        approved: item.fillable ? patch.approved : false,
      };
    }

    return item;
  });
}

/** Collect user-approved, fillable answers for FillPlan construction. */
export function collectApprovedAnswers(
  items: readonly AutofillReviewItem[],
): { questionId: string; value: NonNullable<AutofillReviewItem['value']> }[] {
  const approved: {
    questionId: string;
    value: NonNullable<AutofillReviewItem['value']>;
  }[] = [];
  for (const item of items) {
    if (!item.approved || !item.fillable || item.value === undefined) {
      continue;
    }
    approved.push({ questionId: item.questionId, value: item.value });
  }
  return approved;
}
