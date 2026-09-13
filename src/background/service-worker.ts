import {
  getProfile,
  saveProfile,
  type UserProfile,
} from '@/storage/profile';
import {
  MessageType,
  isExtensionMessage,
  type ExtensionMessage,
  type ExtensionResponse,
  type ExtensionStatusResponse,
  type PongResponse,
  type ProfileResponse,
  type SaveProfileResponse,
  type ErrorResponse,
} from '@/utils/messaging';
import { ErrorCode, createAppError } from '@/core/types/errors';

/**
 * MV3 service worker: routes typed messages and owns profile storage I/O.
 */

const EXTENSION_VERSION = '0.1.0';

async function handleMessage(
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  switch (message.type) {
    case MessageType.PING: {
      const response: PongResponse = {
        type: MessageType.PONG,
        source: 'background',
      };
      return response;
    }
    case MessageType.GET_EXTENSION_STATUS: {
      const response: ExtensionStatusResponse = {
        version: EXTENSION_VERSION,
        ready: true,
        scope: 'p12b-ai-provider-selection',
      };
      return response;
    }
    case MessageType.GET_PROFILE: {
      const profile = await getProfile();
      const response: ProfileResponse = { profile };
      return response;
    }
    case MessageType.SAVE_PROFILE: {
      const profile: UserProfile = await saveProfile(message.payload);
      const response: SaveProfileResponse = { profile };
      return response;
    }
    case MessageType.DETECT_FORM:
    case MessageType.GET_FORM:
    case MessageType.DISCOVER_FORM:
    case MessageType.CLASSIFY_FORM:
    case MessageType.EXTRACT_FORM:
    case MessageType.FILL_FORM:
    case MessageType.INSPECT_NAVIGATION:
    case MessageType.NAVIGATE_FORM: {
      const response: ErrorResponse = {
        error: createAppError(
          ErrorCode.INVALID_REQUEST,
          `${message.type} must be sent to the content script on a Google Forms tab.`,
        ),
      };
      return response;
    }
    default: {
      const exhaustive: never = message;
      void exhaustive;
      const response: ErrorResponse = {
        error: createAppError(
          ErrorCode.INVALID_REQUEST,
          'Background received an unhandled message type.',
        ),
      };
      return response;
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageText =
        error instanceof Error ? error.message : 'Unexpected background error';
      const response: ErrorResponse = {
        error: createAppError(ErrorCode.INVALID_REQUEST, messageText),
      };
      sendResponse(response);
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info(
    '[Google Form AutoFiller] Service worker installed (P12B AI provider selection).',
  );
});
