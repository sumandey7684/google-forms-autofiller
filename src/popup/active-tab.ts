import {
  MessageType,
  sendTabMessage,
  isErrorResponse,
  type DetectFormResponse,
  type ExtractFormResponse,
  type FillFormResponse,
  type ExtensionResponse,
} from '@/utils/messaging';
import type { Form } from '@/core/types/form';
import type { FormDetectionResult } from '@/core/types/detection';
import type { FillPlan, FillResult } from '@/core/types/fill';
import type { ExtractionResult } from '@/core/types/extraction-report';
import { ErrorCode, createAppError, type AppError } from '@/core/types/errors';

export type ActiveTabProblem =
  | { kind: 'no_active_tab'; error: AppError }
  | { kind: 'unsupported_page'; error: AppError; url?: string }
  | { kind: 'content_unreachable'; error: AppError }
  | { kind: 'detection_failed'; error: AppError }
  | { kind: 'not_google_form'; error: AppError; detection: FormDetectionResult }
  | { kind: 'extraction_failed'; error: AppError };

export interface ActiveGoogleFormContext {
  tabId: number;
  url: string;
  detection: FormDetectionResult;
  form: Form;
  extraction: ExtractionResult;
}

async function getActiveTab(): Promise<
  { tabId: number; url: string } | ActiveTabProblem
> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) {
    return {
      kind: 'no_active_tab',
      error: createAppError(
        ErrorCode.FORM_NOT_FOUND,
        'No active browser tab is available for form detection.',
      ),
    };
  }

  const url = tab.url ?? '';
  if (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  ) {
    return {
      kind: 'unsupported_page',
      error: createAppError(
        ErrorCode.UNSUPPORTED_FORM,
        'The active page is not a regular web page the extension can access.',
        { url: url || null },
      ),
      ...(url ? { url } : {}),
    };
  }

  return { tabId: tab.id, url };
}

async function sendToActiveTab<T extends ExtensionResponse>(
  tabId: number,
  message: Parameters<typeof sendTabMessage>[1],
): Promise<T | ActiveTabProblem> {
  try {
    const response = await sendTabMessage<T | { error: AppError }>(
      tabId,
      message,
    );
    if (isErrorResponse(response)) {
      return {
        kind: 'detection_failed',
        error: response.error,
      };
    }
    return response as T;
  } catch (error: unknown) {
    return {
      kind: 'content_unreachable',
      error: createAppError(
        ErrorCode.FORM_NOT_FOUND,
        error instanceof Error
          ? error.message
          : 'Content script is unreachable. Open a Google Form and reload the page.',
      ),
    };
  }
}

/**
 * Detect + extract the Google Form on the active tab.
 * Uses existing DETECT_FORM / EXTRACT_FORM messages only.
 */
export async function loadActiveGoogleForm(): Promise<
  ActiveGoogleFormContext | ActiveTabProblem
> {
  const tab = await getActiveTab();
  if ('kind' in tab) {
    return tab;
  }

  const detectionResponse = await sendToActiveTab<DetectFormResponse>(
    tab.tabId,
    { type: MessageType.DETECT_FORM },
  );
  if ('kind' in detectionResponse) {
    return detectionResponse;
  }

  const detection = detectionResponse.detection;
  if (!detection.isGoogleForm) {
    return {
      kind: 'not_google_form',
      error: createAppError(
        ErrorCode.UNSUPPORTED_FORM,
        'The active tab is not a Google Form page.',
        { url: detection.url },
      ),
      detection,
    };
  }

  const extractResponse = await sendToActiveTab<ExtractFormResponse>(
    tab.tabId,
    { type: MessageType.EXTRACT_FORM },
  );
  if ('kind' in extractResponse) {
    if (extractResponse.kind === 'detection_failed') {
      return {
        kind: 'extraction_failed',
        error: extractResponse.error,
      };
    }
    return extractResponse;
  }

  return {
    tabId: tab.tabId,
    url: tab.url,
    detection,
    form: extractResponse.extraction.form,
    extraction: extractResponse.extraction,
  };
}

export async function fillActiveForm(
  tabId: number,
  plan: FillPlan,
): Promise<FillResult | ActiveTabProblem> {
  const response = await sendToActiveTab<FillFormResponse>(tabId, {
    type: MessageType.FILL_FORM,
    payload: {
      formId: plan.formId,
      createdAt: plan.createdAt,
      operations: plan.operations.map((operation) => ({
        questionId: operation.questionId,
        value: operation.value,
      })),
    },
  });
  if ('kind' in response) {
    if (response.kind === 'detection_failed') {
      return {
        kind: 'detection_failed',
        error: createAppError(
          ErrorCode.FILL_FAILED,
          response.error.message,
          response.error.details,
        ),
      };
    }
    return response;
  }
  return response.fill;
}

export function describeActiveTabProblem(problem: ActiveTabProblem): string {
  return `${problem.error.code}: ${problem.error.message}`;
}
