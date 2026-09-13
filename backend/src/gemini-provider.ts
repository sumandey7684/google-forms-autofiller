import { GoogleGenAI } from '@google/genai';
import {
  AiProviderProposalSchema,
  GEMINI_PROPOSAL_JSON_SCHEMA,
  type AiProviderProposal,
  type AiQuestionContext,
} from './schemas.js';
import { safeErrorMessage, sanitizeDiagnostic } from './safe.js';
import type { BackendConfig } from './config.js';

export interface GeminiInteractionResult {
  status?: string;
  output_text?: string | null;
  errors?: ReadonlyArray<{ message?: string }> | null;
}

export interface GeminiInteractionsClient {
  create(input: {
    model: string;
    systemInstruction: string;
    userInput: string;
    timeoutMs: number;
  }): Promise<GeminiInteractionResult>;
}

const SYSTEM_INSTRUCTION = [
  'You propose answers for a single Google Form question.',
  'Return only JSON matching the provided schema.',
  'Use status "proposed" with an AnswerValue when confident.',
  'Use status "unsupported" when the question cannot be answered safely.',
  'Use status "error" only for unrecoverable generation issues.',
  'For text/paragraph/date/time/dropdown/multiple_choice/linear_scale use kind "single".',
  'For checkbox questions use kind "multi" with option ids or labels.',
  'Never invent secrets. Never echo API keys, passwords, or full prompts.',
  'Prefer option ids when options are provided.',
].join(' ');

function buildUserInput(context: AiQuestionContext): string {
  // Structured context only — no whole-form dump.
  return JSON.stringify({
    questionId: context.questionId,
    questionText: context.questionText,
    ...(context.description !== undefined
      ? { description: context.description }
      : {}),
    questionType: context.questionType,
    ...(context.options !== undefined ? { options: context.options } : {}),
    ...(context.scaleMin !== undefined ? { scaleMin: context.scaleMin } : {}),
    ...(context.scaleMax !== undefined ? { scaleMax: context.scaleMax } : {}),
    ...(context.profileContext !== undefined
      ? { profileContext: context.profileContext }
      : {}),
  });
}

function parseProposalText(raw: string): AiProviderProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      status: 'error',
      message: 'Gemini returned non-JSON output.',
    };
  }

  const result = AiProviderProposalSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'error',
      message: 'Gemini JSON did not match the answer proposal contract.',
    };
  }

  const proposal = result.data;
  if (proposal.status === 'proposed' && proposal.value === undefined) {
    return {
      status: 'error',
      message: 'Gemini proposed status without an answer value.',
    };
  }

  if (proposal.message !== undefined) {
    return {
      ...proposal,
      message: sanitizeDiagnostic(proposal.message),
    };
  }
  return proposal;
}

/**
 * Real Gemini provider via Interactions API.
 * Lives only in the local backend — never in the extension bundle.
 */
export class GeminiAnswerProvider {
  readonly id = 'gemini-interactions';

  constructor(
    private readonly config: Pick<
      BackendConfig,
      'geminiApiKey' | 'geminiModel' | 'geminiTimeoutMs'
    >,
    private readonly client: GeminiInteractionsClient = createDefaultGeminiClient(
      config.geminiApiKey,
      config.geminiTimeoutMs,
    ),
  ) {}

  async proposeAnswer(context: AiQuestionContext): Promise<AiProviderProposal> {
    if (context.questionType === 'unknown') {
      return {
        status: 'unsupported',
        message: 'Unknown question type is unsupported for Gemini fallback.',
      };
    }

    let interaction: GeminiInteractionResult;
    try {
      interaction = await this.client.create({
        model: this.config.geminiModel,
        systemInstruction: SYSTEM_INSTRUCTION,
        userInput: buildUserInput(context),
        timeoutMs: this.config.geminiTimeoutMs,
      });
    } catch (error: unknown) {
      return {
        status: 'error',
        message: safeErrorMessage(error, 'Gemini request failed.'),
      };
    }

    if (interaction.status === 'failed' || interaction.status === 'cancelled') {
      const detail = interaction.errors?.[0]?.message;
      return {
        status: 'error',
        message: detail
          ? sanitizeDiagnostic(detail)
          : `Gemini interaction ${interaction.status}.`,
      };
    }

    const text = interaction.output_text?.trim();
    if (!text) {
      return {
        status: 'error',
        message: 'Gemini interaction returned empty output.',
      };
    }

    return parseProposalText(text);
  }
}

export function createDefaultGeminiClient(
  apiKey: string,
  defaultTimeoutMs: number,
): GeminiInteractionsClient {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: defaultTimeoutMs,
    },
  });

  return {
    async create(input) {
      const interaction = await ai.interactions.create(
        {
          model: input.model,
          input: input.userInput,
          system_instruction: input.systemInstruction,
          store: false,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: GEMINI_PROPOSAL_JSON_SCHEMA,
          },
        },
        {
          timeout: input.timeoutMs,
        },
      );

      const result: GeminiInteractionResult = {};
      if (interaction.status !== undefined) {
        result.status = interaction.status;
      }
      if (interaction.output_text !== undefined) {
        result.output_text = interaction.output_text;
      }
      if (interaction.errors !== undefined) {
        result.errors = interaction.errors.map((item) => {
          const entry: { message?: string } = {};
          if (item.message !== undefined) {
            entry.message = item.message;
          }
          return entry;
        });
      }
      return result;
    },
  };
}

/** Exported for focused unit tests without network access. */
export { parseProposalText as parseGeminiProposalTextForTests };
export { buildUserInput as buildGeminiUserInputForTests };
