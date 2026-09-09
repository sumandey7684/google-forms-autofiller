import type { Form } from '@/core/types/form';
import { ErrorCode, createAppError } from '@/core/types/errors';

/**
 * DOM extraction for Google Forms will be implemented in a later phase.
 * Structural placeholder only — does not parse the page.
 */
export function extractForm(): Form {
  throw createAppError(
    ErrorCode.EXTRACTION_FAILED,
    'Form extraction is not implemented in P1. This module is a structural placeholder.',
  );
}
