/**
 * Persisted AI provider selection for the popup workflow.
 * Never stores API keys — Gemini keys live only in the local backend.
 */

export const AI_PROVIDER_PREFERENCE_KEY = 'aiProviderPreference' as const;

export const AiProviderKind = {
  MOCK: 'mock',
  GEMINI: 'gemini',
} as const;

export type AiProviderKind =
  (typeof AiProviderKind)[keyof typeof AiProviderKind];

export const DEFAULT_AI_PROVIDER_KIND = AiProviderKind.MOCK;

export function isAiProviderKind(value: unknown): value is AiProviderKind {
  return value === AiProviderKind.MOCK || value === AiProviderKind.GEMINI;
}

export async function getAiProviderPreference(): Promise<AiProviderKind> {
  const result = await chrome.storage.local.get(AI_PROVIDER_PREFERENCE_KEY);
  const raw = result[AI_PROVIDER_PREFERENCE_KEY];
  return isAiProviderKind(raw) ? raw : DEFAULT_AI_PROVIDER_KIND;
}

export async function saveAiProviderPreference(
  kind: AiProviderKind,
): Promise<AiProviderKind> {
  if (!isAiProviderKind(kind)) {
    throw new Error('Unsupported AI provider preference.');
  }
  await chrome.storage.local.set({ [AI_PROVIDER_PREFERENCE_KEY]: kind });
  return kind;
}
