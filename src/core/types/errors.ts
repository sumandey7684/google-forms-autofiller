/**
 * Small typed error model for extension boundaries and future adapters.
 */

export const ErrorCode = {
  FORM_NOT_FOUND: 'FORM_NOT_FOUND',
  UNSUPPORTED_FORM: 'UNSUPPORTED_FORM',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  UNSUPPORTED_QUESTION: 'UNSUPPORTED_QUESTION',
  FILL_FAILED: 'FILL_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export function createAppError(
  code: ErrorCode,
  message: string,
  details?: AppError['details'],
): AppError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['code'] === 'string' &&
    typeof record['message'] === 'string' &&
    Object.prototype.hasOwnProperty.call(ErrorCode, record['code'])
  );
}
