// Typed wrappers around the UI → service-worker message protocol, plus the
// host-permission dance the "add a feed" flows need.
//
// Writes (subscribe/unsubscribe/import/export) and refresh all go through the
// worker; the page reads IndexedDB directly for rendering. Feed fetching needs
// `<all_urls>` host access, which is an OPTIONAL permission requested at runtime
// from a user gesture—never at install. `requestHostAccess()` MUST be called
// synchronously within a click handler, so callers invoke `ensureHostAccess()`
// as the first await of the handler before sending a subscribe/import message.

import { browser } from 'wxt/browser';
import type { RequestMessage, RequestType, Response } from '@/lib/messages';
import { hasHostAccess, requestHostAccess } from '@/lib/permissions';

/** Send a typed request to the worker and get back its typed response envelope. */
export async function send<M extends RequestMessage>(
  message: M,
): Promise<Response<M['type']>> {
  return (await browser.runtime.sendMessage(message)) as Response<M['type']>;
}

/** Fire-and-forget refresh; ignores the response and any "no receiver" errors. */
export function refreshNow(force = false): void {
  void browser.runtime
    .sendMessage({ type: 'refresh-now', force } satisfies RequestMessage)
    .catch(() => {
      // Worker may be asleep or busy; the alarm-driven refresh still covers us.
    });
}

/**
 * Ensure `<all_urls>` host access, prompting once if needed. MUST be awaited as
 * the FIRST await inside a click handler so the permission request still counts
 * as user-initiated. Resolves to whether access is granted.
 */
export async function ensureHostAccess(): Promise<boolean> {
  if (await hasHostAccess()) return true;
  return requestHostAccess();
}

/** True when a failed response is specifically a missing-host-permission error. */
export function isPermissionError<T extends RequestType>(
  response: Response<T>,
): boolean {
  return !response.ok && response.errorName === 'NoHostPermissionError';
}
