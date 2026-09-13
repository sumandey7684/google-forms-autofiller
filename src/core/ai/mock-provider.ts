import { AnswerValueSchema } from '@/core/validation/answer';
import type { AnswerValue } from '@/core/types/answer';
import type {
  AiAnswerProvider,
  AiProviderProposal,
  AiQuestionContext,
} from './types';

export type MockAiScriptedResponse =
  | { status: 'proposed'; value: AnswerValue }
  | { status: 'unsupported'; message?: string }
  | { status: 'error'; message?: string };

export interface MockAiAnswerProviderOptions {
  id?: string;
  /** Deterministic responses keyed by question id. */
  responses?: Readonly<Record<string, MockAiScriptedResponse>>;
  defaultResponse?: MockAiScriptedResponse;
}

/**
 * Deterministic placeholder provider for P9.
 * Does not perform network I/O and never reads API keys.
 */
export class MockAiAnswerProvider implements AiAnswerProvider {
  readonly id: string;
  private readonly responses: Readonly<Record<string, MockAiScriptedResponse>>;
  private readonly defaultResponse: MockAiScriptedResponse;
  private readonly seenContexts: AiQuestionContext[] = [];

  constructor(options: MockAiAnswerProviderOptions = {}) {
    this.id = options.id ?? 'mock-ai';
    this.responses = options.responses ?? {};
    this.defaultResponse = options.defaultResponse ?? {
      status: 'unsupported',
      message: 'Mock provider has no scripted answer for this question.',
    };
  }

  getSeenContexts(): readonly AiQuestionContext[] {
    return this.seenContexts;
  }

  async proposeAnswer(context: AiQuestionContext): Promise<AiProviderProposal> {
    this.seenContexts.push(context);
    const scripted = this.responses[context.questionId] ?? this.defaultResponse;

    if (scripted.status === 'proposed') {
      const parsed = AnswerValueSchema.safeParse(scripted.value);
      if (!parsed.success) {
        return {
          status: 'error',
          message: 'Mock provider produced a non-AnswerValue payload.',
        };
      }
      return { status: 'proposed', value: parsed.data };
    }

    if (scripted.status === 'error') {
      return {
        status: 'error',
        message: scripted.message ?? 'Mock provider error.',
      };
    }

    return {
      status: 'unsupported',
      message: scripted.message ?? 'Mock provider unsupported question.',
    };
  }
}
