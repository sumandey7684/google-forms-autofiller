import type { FormDetectionResult } from '@/core/types/detection';
import { isGoogleFormsUrl } from '@/utils';

/**
 * Lightweight URL/host detection used by DETECT_FORM messaging.
 * Adapter-boundary detection with DOM signals lives in google-forms/detect.ts.
 */
export function detectGoogleForm(url: string = location.href): FormDetectionResult {
  return {
    isGoogleForm: isGoogleFormsUrl(url),
    url,
  };
}
