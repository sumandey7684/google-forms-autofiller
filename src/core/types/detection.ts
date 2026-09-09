/**
 * Lightweight page detection result (URL / host heuristics).
 * Not a substitute for Form extraction.
 */
export interface FormDetectionResult {
  isGoogleForm: boolean;
  url: string;
}
