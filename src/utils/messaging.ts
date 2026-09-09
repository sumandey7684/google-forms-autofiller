/**
 * Chrome messaging helpers.
 * Contracts and Zod schemas live in core/validation; this module only talks to chrome.*.
 */

export {
  MessageType,
  isExtensionMessage,
  isErrorResponse,
  type MessageTypeName,
  type ExtensionMessage,
  type ExtensionResponse,
  type PongResponse,
  type ExtensionStatusResponse,
  type ProfileResponse,
  type SaveProfileResponse,
  type DetectFormResponse,
  type GetFormResponse,
  type DiscoverFormResponse,
  type ClassifyFormResponse,
  type ErrorResponse,
} from '@/core/validation/messages';

import type { ExtensionMessage, ExtensionResponse } from '@/core/validation/messages';

export async function sendMessage<TResponse = ExtensionResponse>(
  message: ExtensionMessage,
): Promise<TResponse> {
  return chrome.runtime.sendMessage(message) as Promise<TResponse>;
}

export async function sendTabMessage<TResponse = ExtensionResponse>(
  tabId: number,
  message: ExtensionMessage,
): Promise<TResponse> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<TResponse>;
}
