import { detectGoogleForm } from './detector';
import {
  createGoogleFormsAdapter,
  logDiscoverySummary,
  logClassificationSummary,
  logExtractionSummary,
  summarizeDiscoveredQuestions,
  summarizeClassification,
} from './google-forms';
import {
  MessageType,
  isExtensionMessage,
  type ExtensionMessage,
  type ExtensionResponse,
  type PongResponse,
  type DetectFormResponse,
  type DiscoverFormResponse,
  type ClassifyFormResponse,
  type GetFormResponse,
  type ExtractFormResponse,
  type ErrorResponse,
} from '@/utils/messaging';
import { ErrorCode, createAppError, isAppError } from '@/core/types/errors';

/**
 * Content script entry.
 * P2 discovery → P3 classification → P4 Form extraction.
 * No fill / navigation.
 */

const adapter = createGoogleFormsAdapter();

function handleMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ExtensionResponse) => void,
): boolean {
  if (!isExtensionMessage(message)) {
    const response: ErrorResponse = {
      error: createAppError(
        ErrorCode.INVALID_REQUEST,
        'Unknown message shape',
      ),
    };
    sendResponse(response);
    return false;
  }

  const typed: ExtensionMessage = message;

  switch (typed.type) {
    case MessageType.PING: {
      const response: PongResponse = {
        type: MessageType.PONG,
        source: 'content',
      };
      sendResponse(response);
      return false;
    }
    case MessageType.DETECT_FORM: {
      const response: DetectFormResponse = {
        detection: detectGoogleForm(),
      };
      sendResponse(response);
      return false;
    }
    case MessageType.DISCOVER_FORM: {
      const response: DiscoverFormResponse = {
        discovery: adapter.discoverReport(),
      };
      sendResponse(response);
      return false;
    }
    case MessageType.CLASSIFY_FORM: {
      const response: ClassifyFormResponse = {
        classification: adapter.classifyReport(),
      };
      sendResponse(response);
      return false;
    }
    case MessageType.GET_FORM: {
      void adapter
        .extract()
        .then((form) => {
          const response: GetFormResponse = { form };
          sendResponse(response);
        })
        .catch((error: unknown) => {
          const response: ErrorResponse = {
            error: isAppError(error)
              ? error
              : createAppError(
                  ErrorCode.EXTRACTION_FAILED,
                  error instanceof Error
                    ? error.message
                    : 'Form extraction failed',
                ),
          };
          sendResponse(response);
        });
      return true;
    }
    case MessageType.EXTRACT_FORM: {
      try {
        const response: ExtractFormResponse = {
          extraction: adapter.extractResult(),
        };
        sendResponse(response);
      } catch (error: unknown) {
        const response: ErrorResponse = {
          error: isAppError(error)
            ? error
            : createAppError(
                ErrorCode.EXTRACTION_FAILED,
                error instanceof Error
                  ? error.message
                  : 'Form extraction failed',
              ),
        };
        sendResponse(response);
      }
      return false;
    }
    default: {
      const response: ErrorResponse = {
        error: createAppError(
          ErrorCode.INVALID_REQUEST,
          `Content script does not handle ${typed.type}`,
        ),
      };
      sendResponse(response);
      return false;
    }
  }
}

chrome.runtime.onMessage.addListener(handleMessage);

function runPipelineLogs(): void {
  if (!adapter.canHandle()) {
    console.info(
      '[Google Form AutoFiller] URL matched but adapter canHandle() is false — structural signals missing or page still loading.',
    );
    return;
  }

  // One discovery pass → classify → extract.
  const discovered = adapter.discoverQuestions();
  const discovery = summarizeDiscoveredQuestions(discovered, {
    url: location.href,
    canHandle: true,
  });
  logDiscoverySummary(discovery);

  const classified = adapter.classifyDiscovered(discovered);
  logClassificationSummary(
    summarizeClassification(classified, location.href),
  );

  const extraction = adapter.extractFromDiscovered(discovered, classified, {
    url: location.href,
  });
  logExtractionSummary(extraction.report);
}

const detection = detectGoogleForm();
if (detection.isGoogleForm) {
  console.info(
    '[Google Form AutoFiller] Content script ready on Google Forms page.',
    { adapterCanHandle: adapter.canHandle() },
  );

  if (adapter.canHandle()) {
    const discovered = adapter.discoverQuestions();
    const firstReport = summarizeDiscoveredQuestions(discovered, {
      url: location.href,
      canHandle: true,
    });
    logDiscoverySummary(firstReport);

    const classified = adapter.classifyDiscovered(discovered);
    logClassificationSummary(
      summarizeClassification(classified, location.href),
    );
    logExtractionSummary(
      adapter.extractFromDiscovered(discovered, classified, {
        url: location.href,
      }).report,
    );

    if (firstReport.containerCount === 0) {
      window.setTimeout(() => {
        runPipelineLogs();
      }, 1500);
    }
  } else {
    window.setTimeout(() => {
      runPipelineLogs();
    }, 1500);
  }
}
