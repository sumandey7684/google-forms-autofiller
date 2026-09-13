import { z } from 'zod';
import type { AnswerValue } from '@/core/types/answer';

/** Shared runtime schema for the existing AnswerValue domain union. */
export const AnswerValueSchema: z.ZodType<AnswerValue> =
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('single'), value: z.string() }),
    z.object({
      kind: z.literal('multi'),
      values: z.array(z.string()),
    }),
  ]);
