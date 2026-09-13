import { z } from 'zod';

/** Mirrors extension AnswerValue without importing Chrome-bound packages. */
export const AnswerValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), value: z.string() }),
  z.object({
    kind: z.literal('multi'),
    values: z.array(z.string()),
  }),
]);

export const AiQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const AiQuestionContextSchema = z.object({
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  description: z.string().optional(),
  questionType: z.enum([
    'text',
    'paragraph',
    'multiple_choice',
    'checkbox',
    'dropdown',
    'linear_scale',
    'date',
    'time',
    'unknown',
  ]),
  options: z.array(AiQuestionOptionSchema).optional(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  profileContext: z
    .object({
      fullName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedInUrl: z.string().optional(),
      portfolioUrl: z.string().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type AiQuestionContext = z.infer<typeof AiQuestionContextSchema>;

export const AiProviderProposalSchema = z.object({
  status: z.enum(['proposed', 'unsupported', 'error']),
  value: AnswerValueSchema.optional(),
  message: z.string().optional(),
});

export type AiProviderProposal = z.infer<typeof AiProviderProposalSchema>;

export const ProposeAnswerRequestSchema = z.object({
  context: AiQuestionContextSchema,
});

/** JSON Schema for Gemini Interactions structured output. */
export const GEMINI_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['proposed', 'unsupported', 'error'],
    },
    message: {
      type: 'string',
      description:
        'Safe diagnostic only. Never include secrets, API keys, or full prompts.',
    },
    value: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'value'],
          properties: {
            kind: { type: 'string', enum: ['single'] },
            value: { type: 'string' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'values'],
          properties: {
            kind: { type: 'string', enum: ['multi'] },
            values: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      ],
    },
  },
} as const;
