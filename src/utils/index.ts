/**
 * Shared helpers (messaging, URL checks, etc.).
 */

export {
  MessageType,
  sendMessage,
  sendTabMessage,
  isExtensionMessage,
  isErrorResponse,
  type ExtensionMessage,
  type ExtensionResponse,
} from './messaging';

export function isGoogleFormsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isDocsForm =
      parsed.hostname === 'docs.google.com' &&
      parsed.pathname.startsWith('/forms/');
    const isShortLink = parsed.hostname === 'forms.gle';
    return isDocsForm || isShortLink;
  } catch {
    return false;
  }
}
