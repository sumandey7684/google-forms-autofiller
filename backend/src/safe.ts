/**
 * Sanitize diagnostics so secrets never leave the backend in responses/logs.
 */

const API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{10,}/gu;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/giu;
const ENV_KEY_PATTERN = /GEMINI_API_KEY\s*=\s*\S+/giu;

export function sanitizeDiagnostic(message: string): string {
  return message
    .replace(API_KEY_PATTERN, '[redacted]')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(ENV_KEY_PATTERN, 'GEMINI_API_KEY=[redacted]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

export function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return sanitizeDiagnostic(error.message) || fallback;
  }
  return fallback;
}
