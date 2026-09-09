import { isGoogleFormsUrl } from '@/utils';
import { GoogleFormsSelectors } from './selectors';

export interface GoogleFormsPageDetection {
  canHandle: boolean;
  url: string;
  hasQuestionList: boolean;
  hasQuestionContainers: boolean;
  hasProviderFallbackContainers: boolean;
  reasons: readonly string[];
}

/**
 * Adapter-boundary page detection: URL heuristic + structural DOM signals.
 * Read-only. Does not classify or extract questions.
 */
export function detectGoogleFormsPage(
  doc: Document = document,
): GoogleFormsPageDetection {
  const url = doc.location.href;
  const urlOk = isGoogleFormsUrl(url);
  const hasQuestionList =
    doc.querySelector(GoogleFormsSelectors.questionList) !== null;
  const hasQuestionContainers =
    doc.querySelector(GoogleFormsSelectors.questionContainer) !== null;
  const hasProviderFallbackContainers =
    doc.querySelector(GoogleFormsSelectors.questionContainerFallback) !== null;

  const reasons: string[] = [];
  if (!urlOk) {
    reasons.push('URL is not a Google Forms respondent/host pattern');
  }
  if (!hasQuestionList) {
    reasons.push(`No element matching ${GoogleFormsSelectors.questionList}`);
  }
  if (!hasQuestionContainers) {
    reasons.push(`No element matching ${GoogleFormsSelectors.questionContainer}`);
  }
  if (!hasProviderFallbackContainers) {
    reasons.push(
      `No fallback element matching ${GoogleFormsSelectors.questionContainerFallback}`,
    );
  }

  const canHandle =
    urlOk &&
    (hasQuestionList ||
      hasQuestionContainers ||
      hasProviderFallbackContainers);

  if (canHandle) {
    reasons.length = 0;
    reasons.push('URL matched with at least one structural discovery signal');
  }

  return {
    canHandle,
    url,
    hasQuestionList,
    hasQuestionContainers,
    hasProviderFallbackContainers,
    reasons,
  };
}

export function canHandleGoogleFormsPage(doc: Document = document): boolean {
  return detectGoogleFormsPage(doc).canHandle;
}
