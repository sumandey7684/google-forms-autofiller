/**
 * Type-level / compile-time examples for the P1 domain model.
 * No test runner — inclusion in `tsc` is the verification.
 */

import type {
  Form,
  Question,
  FormAnswer,
  FillPlan,
  FillResult,
  FormAdapter,
} from '@/core/types';
import {
  createFillResult,
  ErrorCode,
  multiValue,
  singleValue,
  summarizeFillResults,
} from '@/core/types';

const sampleQuestions: readonly Question[] = [
  {
    id: 'q_name',
    type: 'text',
    text: 'Full name',
    required: true,
    sectionId: 'sec_default',
  },
  {
    id: 'q_skills',
    type: 'checkbox',
    text: 'Skills',
    required: false,
    sectionId: 'sec_default',
    options: [
      { id: 'opt_ts', label: 'TypeScript' },
      { id: 'opt_react', label: 'React' },
    ],
  },
  {
    id: 'q_scale',
    type: 'linear_scale',
    text: 'Interest level',
    required: true,
    sectionId: 'sec_default',
    min: 1,
    max: 5,
    minLabel: 'Low',
    maxLabel: 'High',
  },
];

export const sampleForm: Form = {
  id: 'form_sample',
  title: 'Sample application',
  description: 'Compile-time domain example',
  url: 'https://docs.google.com/forms/d/e/example/viewform',
  extractedAt: '2026-01-01T00:00:00.000Z',
  sections: [
    {
      id: 'sec_default',
      title: 'Default',
      questions: sampleQuestions,
    },
  ],
};

export const sampleAnswers: readonly FormAnswer[] = [
  {
    questionId: 'q_name',
    value: singleValue('Ada Lovelace'),
    source: 'profile',
    status: 'proposed',
    confidence: 1,
  },
  {
    questionId: 'q_skills',
    value: multiValue(['opt_ts', 'opt_react']),
    source: 'manual',
    status: 'approved',
  },
];

export const sampleFillPlan: FillPlan = {
  formId: sampleForm.id,
  createdAt: '2026-01-01T00:00:00.000Z',
  operations: sampleAnswers.map((answer) => ({
    questionId: answer.questionId,
    value: answer.value,
  })),
};

export const sampleFillResult: FillResult = createFillResult(sampleForm.id, [
  { questionId: 'q_name', status: 'success' },
  { questionId: 'q_skills', status: 'skipped', message: 'Left for review' },
  {
    questionId: 'q_scale',
    status: 'unsupported',
    errorCode: ErrorCode.UNSUPPORTED_QUESTION,
  },
]);

const _totalsCheck = summarizeFillResults(sampleFillResult.results);
void _totalsCheck;

/** Ensures FormAdapter remains a structural contract without a runtime impl. */
export type SampleAdapter = FormAdapter;
