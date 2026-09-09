import { detectGoogleForm } from './detector';
import {
  createGoogleFormsAdapter,
  buildDiscoveryReport,
  logDiscoveryReport,
} from './google-forms';
import {
  MessageType,
  isExtensionMessage,
  type ExtensionMessage,
  type ExtensionResponse,
  type PongResponse,
  type DetectFormResponse,
  type DiscoverFormResponse,
  type ErrorResponse,
} from '@/utils/messaging';
import { ErrorCode, createAppError } from '@/core/types/errors';

/**
 * Content script entry.
 * P2: Google Forms discovery (read-only). No extraction/fill.
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
        discovery: buildDiscoveryReport(),
      };
      sendResponse(response);
      return false;
    }
    case MessageType.GET_FORM: {
      const response: ErrorResponse = {
        error: createAppError(
          ErrorCode.EXTRACTION_FAILED,
          'Form extraction is not implemented in P2. Use DISCOVER_FORM for DOM candidate diagnostics.',
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

const detection = detectGoogleForm();
if (detection.isGoogleForm) {
  console.info(
    '[Google Form AutoFiller] Content script ready on Google Forms page.',
    { adapterCanHandle: adapter.canHandle() },
  );

  if (adapter.canHandle()) {
    logDiscoveryReport(adapter.discover());
  } else {
    console.info(
      '[Google Form AutoFiller] URL matched but adapter canHandle() is false — structural signals missing or page still loading.',
    );
  }
}
