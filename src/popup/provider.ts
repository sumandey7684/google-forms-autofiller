import type { AiAnswerProvider } from '@/core/ai/types';
import { MockAiAnswerProvider } from '@/core/ai/mock-provider';
import { HttpAiAnswerProvider } from '@/core/ai/http-provider';
import {
  AiProviderKind,
  DEFAULT_AI_PROVIDER_KIND,
  type AiProviderKind as ProviderKind,
} from '@/storage/ai-provider-preference';

/** Default local Gemini proxy URL — no secrets, loopback only. */
export const DEFAULT_GEMINI_BACKEND_URL = 'http://127.0.0.1:8787';

export type ProviderRuntimeStatus =
  | 'mock_active'
  | 'gemini_configured'
  | 'gemini_unavailable';

export interface ResolvedAiProvider {
  kind: ProviderKind;
  provider: AiAnswerProvider;
  status: ProviderRuntimeStatus;
  statusLabel: string;
  backendUrl: string | null;
}

export function providerStatusLabel(status: ProviderRuntimeStatus): string {
  switch (status) {
    case 'mock_active':
      return 'Mock provider active';
    case 'gemini_configured':
      return 'Gemini backend configured';
    case 'gemini_unavailable':
      return 'Gemini backend unavailable';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * Probe the local backend health endpoint without sending question/profile data.
 */
export async function checkGeminiBackendHealth(
  baseUrl: string = DEFAULT_GEMINI_BACKEND_URL,
  fetchImpl: typeof fetch = fetch.bind(globalThis),
  timeoutMs = 2500,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/u, '')}/healthz`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const payload: unknown = await response.json();
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'ok' in payload &&
      (payload as { ok: unknown }).ok === true
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the AI provider for the popup workflow.
 * Defaults to mock. Gemini uses HttpAiAnswerProvider only (no API key).
 */
export async function resolveWorkflowAiProvider(options: {
  kind?: ProviderKind;
  backendUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injected for tests; when set, skips the live health probe. */
  geminiHealthy?: boolean;
}): Promise<ResolvedAiProvider> {
  const kind = options.kind ?? DEFAULT_AI_PROVIDER_KIND;
  const backendUrl = options.backendUrl ?? DEFAULT_GEMINI_BACKEND_URL;
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);

  if (kind === AiProviderKind.MOCK) {
    return {
      kind: AiProviderKind.MOCK,
      provider: new MockAiAnswerProvider(),
      status: 'mock_active',
      statusLabel: providerStatusLabel('mock_active'),
      backendUrl: null,
    };
  }

  const healthy =
    options.geminiHealthy !== undefined
      ? options.geminiHealthy
      : await checkGeminiBackendHealth(backendUrl, fetchImpl);

  const provider = new HttpAiAnswerProvider({
    baseUrl: backendUrl,
    fetchImpl,
    id: 'http-gemini-proxy',
  });

  const status: ProviderRuntimeStatus = healthy
    ? 'gemini_configured'
    : 'gemini_unavailable';

  return {
    kind: AiProviderKind.GEMINI,
    provider,
    status,
    statusLabel: providerStatusLabel(status),
    backendUrl,
  };
}
