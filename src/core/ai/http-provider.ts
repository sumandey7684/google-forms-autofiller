import { AnswerValueSchema } from '@/core/validation/answer';
import type {
  AiAnswerProvider,
  AiProviderProposal,
  AiQuestionContext,
} from './types';

export interface HttpAiAnswerProviderOptions {
  /** Base URL of the local Gemini proxy, e.g. http://127.0.0.1:8787 */
  baseUrl: string;
  /** Fetch timeout in milliseconds. */
  timeoutMs?: number;
  id?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Extension-side provider that calls the local backend.
 * Never holds or transmits the Gemini API key.
 */
export class HttpAiAnswerProvider implements AiAnswerProvider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpAiAnswerProviderOptions) {
    this.id = options.id ?? 'http-gemini-proxy';
    this.baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async proposeAnswer(context: AiQuestionContext): Promise<AiProviderProposal> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/v1/propose-answer`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ context }),
          signal: controller.signal,
        },
      );

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return {
          status: 'error',
          message: 'Local AI backend returned non-JSON.',
        };
      }

      if (!response.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'message' in payload &&
          typeof (payload as { message: unknown }).message === 'string'
            ? (payload as { message: string }).message
            : `Local AI backend HTTP ${response.status}.`;
        return {
          status: 'error',
          message: message.slice(0, 240),
        };
      }

      return normalizeProposal(payload);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: 'error',
          message: 'Local AI backend request timed out.',
        };
      }
      return {
        status: 'error',
        message: 'Local AI backend is unreachable.',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeProposal(payload: unknown): AiProviderProposal {
  if (typeof payload !== 'object' || payload === null) {
    return {
      status: 'error',
      message: 'Local AI backend returned an invalid proposal.',
    };
  }

  const record = payload as Record<string, unknown>;
  const status = record['status'];
  if (
    status !== 'proposed' &&
    status !== 'unsupported' &&
    status !== 'error'
  ) {
    return {
      status: 'error',
      message: 'Local AI backend returned an unknown status.',
    };
  }

  const message =
    typeof record['message'] === 'string'
      ? record['message'].slice(0, 240)
      : undefined;

  if (status !== 'proposed') {
    return message !== undefined ? { status, message } : { status };
  }

  const parsed = AnswerValueSchema.safeParse(record['value']);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Local AI backend proposed an invalid AnswerValue.',
    };
  }

  return message !== undefined
    ? { status: 'proposed', value: parsed.data, message }
    : { status: 'proposed', value: parsed.data };
}
