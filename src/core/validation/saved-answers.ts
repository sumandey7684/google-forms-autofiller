import { z } from 'zod';
import { normalizeQuestionText } from '@/core/matching/normalize';
import { createSavedAnswerKey } from '@/core/resolution/saved-answer';
import type { SavedAnswer } from '@/core/resolution/types';
import { AnswerValueSchema } from './answer';

const QuestionTypeSchema = z.enum([
  'text',
  'paragraph',
  'multiple_choice',
  'checkbox',
  'dropdown',
  'linear_scale',
  'date',
  'time',
  'unknown',
]);

const SavedAnswerObjectSchema = z
  .object({
    key: z.string().trim().min(1),
    questionId: z.string().trim().min(1).optional(),
    normalizedQuestionText: z.string().trim().min(1),
    questionType: QuestionTypeSchema,
    value: AnswerValueSchema,
    label: z.string().trim().min(1).optional(),
    context: z.string().trim().min(1).optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export const SavedAnswerSchema = SavedAnswerObjectSchema
  .superRefine((answer, context) => {
    if (
      answer.normalizedQuestionText !==
      normalizeQuestionText(answer.normalizedQuestionText)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['normalizedQuestionText'],
        message: 'Saved answer question text must already be normalized.',
      });
    }

    const expectedKey = createSavedAnswerKey({
      questionText: answer.normalizedQuestionText,
      questionType: answer.questionType,
      ...(answer.questionId !== undefined
        ? { questionId: answer.questionId }
        : {}),
      ...(answer.context !== undefined ? { context: answer.context } : {}),
    });
    if (answer.key !== expectedKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'Saved answer key does not match its deterministic identity.',
      });
    }
  })
  .transform(
    (answer): SavedAnswer => ({
      key: answer.key,
      normalizedQuestionText: answer.normalizedQuestionText,
      questionType: answer.questionType,
      value: answer.value,
      ...(answer.questionId !== undefined
        ? { questionId: answer.questionId }
        : {}),
      ...(answer.label !== undefined ? { label: answer.label } : {}),
      ...(answer.context !== undefined ? { context: answer.context } : {}),
      ...(answer.updatedAt !== undefined
        ? { updatedAt: answer.updatedAt }
        : {}),
    }),
  );

export const SavedAnswersSchema = z
  .array(SavedAnswerSchema)
  .superRefine((answers, context) => {
    const keys = new Set<string>();
    answers.forEach((answer, index) => {
      if (keys.has(answer.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'key'],
          message: 'Saved answer keys must be unique.',
        });
      }
      keys.add(answer.key);
    });
  });
