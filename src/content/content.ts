import { detectGoogleForm } from './detector';
import {
  createGoogleFormsAdapter,
  logDiscoverySummary,
  logClassificationSummary,
  summarizeDiscoveredQuestions,
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
  type ErrorResponse,
} from '@/utils/messaging';
import { ErrorCode, createAppError } from '@/core/types/errors';

/**
 * Content script entry.
 * P2: discovery. P3: classification of discovery output.
 * No Form extraction / fill.
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
      // Single discovery pass → classify (no duplicate scan beyond classifyReport).
      const response: ClassifyFormResponse = {
        classification: adapter.classifyReport(),
      };
      sendResponse(response);
      return false;
    }
    case MessageType.GET_FORM: {
      const response: ErrorResponse = {
        error: createAppError(
          ErrorCode.EXTRACTION_FAILED,
          'Form extraction is not implemented in P3. Use DISCOVER_FORM / CLASSIFY_FORM.',
        ),
      };
      sendResponse(response);
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

function runDiscoveryAndClassificationLogs(): void {
  if (!adapter.canHandle()) {
    console.info(
      '[Google Form AutoFiller] URL matched but adapter canHandle() is false — structural signals missing or page still loading.',
    );
    return;
  }

  // One discovery pass; classification consumes that output.
  const discovered = adapter.discoverQuestions();
  const discovery = summarizeDiscoveredQuestions(discovered, {
    url: location.href,
    canHandle: true,
  });
  logDiscoverySummary(discovery);
  logClassificationSummary(
    adapter.classifyFromDiscovered(discovered, location.href),
  );
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
    logClassificationSummary(
      adapter.classifyFromDiscovered(discovered, location.href),
    );

    if (firstReport.containerCount === 0) {
      window.setTimeout(() => {
        runDiscoveryAndClassificationLogs();
      }, 1500);
    }
  } else {
    window.setTimeout(() => {
      runDiscoveryAndClassificationLogs();
    }, 1500);
  }
}
