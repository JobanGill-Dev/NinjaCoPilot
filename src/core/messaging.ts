// Thin promise-based wrappers over the chrome messaging APIs with typing.
import { AppError } from './errors';
import type {
  BackgroundRequest,
  BackgroundResponseMap,
  ContentRequest,
  ContentResponse,
} from '../shared/types/messages';

/** Sends a typed request to the background service worker and awaits its reply. */
export async function sendToBackground<T extends BackgroundRequest['type']>(
  message: Extract<BackgroundRequest, { type: T }>,
): Promise<BackgroundResponseMap[T]> {
  try {
    return (await chrome.runtime.sendMessage(message)) as BackgroundResponseMap[T];
  } catch (cause) {
    throw new AppError('MESSAGING_FAILED', 'Failed to reach the background worker.', cause);
  }
}

/** Sends a typed request to a content script running in a specific tab. */
export async function sendToTab(tabId: number, message: ContentRequest): Promise<ContentResponse> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as ContentResponse;
  } catch (cause) {
    throw new AppError('MESSAGING_FAILED', 'Failed to reach the page content script.', cause);
  }
}
