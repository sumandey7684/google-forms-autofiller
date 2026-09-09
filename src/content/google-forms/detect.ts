import { isGoogleFormsUrl } from '@/utils';
import { GoogleFormsSelectors } from './selectors';

export interface GoogleFormsPageDetection {
  canHandle: boolean;
  url: string;
  hasQuestionList: boolean;
  hasQuestionContainers: boolean;
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
  const questionList = doc.querySelector(GoogleFormsSelectors.questionList);
  const hasQuestionList = questionList !== null;
  const hasQuestionContainers =
    doc.querySelector(GoogleFormsSelectors.questionContainer) !== null;

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

  const canHandle = urlOk && (hasQuestionList || hasQuestionContainers);

  if (canHandle && reasons.length === 0) {
    reasons.push('URL and question list/listitem structure present');
  } else if (canHandle) {
    reasons.push('URL matched with at least one structural signal');
  }

  return {
    canHandle,
    url,
    hasQuestionList,
    hasQuestionContainers,
    reasons,
  };
}

export function canHandleGoogleFormsPage(doc: Document = document): boolean {
  return detectGoogleFormsPage(doc).canHandle;
}
