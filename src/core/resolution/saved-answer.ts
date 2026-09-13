import { normalizeQuestionText } from '@/core/matching/normalize';
import type { CreateSavedAnswerInput, SavedAnswer } from './types';

function encoded(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Deterministic identity:
 * - exact discovery/question id when present;
 * - otherwise normalized text + question type + optional normalized context.
 */
export function createSavedAnswerKey(
  input: Pick<
    CreateSavedAnswerInput,
    'questionId' | 'questionText' | 'questionType' | 'context'
  >,
): string {
  const questionId = input.questionId?.trim();
  if (questionId) {
    return `question:${encoded(questionId)}`;
  }

  const normalizedText = normalizeQuestionText(input.questionText);
  const normalizedContext = input.context
    ? normalizeQuestionText(input.context)
    : '';
  return [
    'text',
    input.questionType,
    encoded(normalizedText),
    normalizedContext ? encoded(normalizedContext) : 'default',
  ].join(':');
}

export function createSavedAnswer(
  input: CreateSavedAnswerInput,
): SavedAnswer {
  const questionId = input.questionId?.trim();
  const label = input.label?.trim();
  const context = input.context?.trim();
  return {
    key: createSavedAnswerKey(input),
    normalizedQuestionText: normalizeQuestionText(input.questionText),
    questionType: input.questionType,
    value: input.value,
    ...(questionId ? { questionId } : {}),
    ...(label ? { label } : {}),
    ...(context ? { context } : {}),
    ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
  };
}
