// Typed message protocol between UI pages (newtab/popup) and the service worker.
//
// One discriminated union in each direction. The worker performs the mutations
// (fetching needs the worker's host access; writes are centralized there). Pages
// read IndexedDB directly for rendering — messages are only for actions and for
// the worker to notify pages that data changed.

import type { SubscribeResult } from '@/lib/feeds/refresh';
import type { ImportOpmlResult } from '@/lib/opml';

/** Messages sent FROM a UI page TO the service worker. */
export type RequestMessage =
  | { type: 'refresh-now'; force?: boolean }
  | { type: 'subscribe'; url: string }
  | { type: 'unsubscribe'; feedId: string }
  | { type: 'import-opml'; xml: string }
  | { type: 'export-opml' };

/** Discriminant strings, for exhaustive handling and testing. */
export type RequestType = RequestMessage['type'];

/** Successful responses, keyed by request type. */
export interface ResponseMap {
  'refresh-now': { changed: boolean };
  subscribe: SubscribeResult;
  unsubscribe: { ok: true };
  'import-opml': ImportOpmlResult;
  'export-opml': { xml: string };
}

/** Uniform response envelope: either `ok` with data, or an error message. */
export type Response<T extends RequestType> =
  | { ok: true; data: ResponseMap[T] }
  | { ok: false; error: string; errorName?: string };

/** The response type for any request — the union across all request types. */
export type AnyResponse = { [T in RequestType]: Response<T> }[RequestType];

/**
 * Broadcast FROM the worker TO all open pages after a refresh writes changes,
 * so newtabs can re-query IndexedDB. Sent via `browser.runtime.sendMessage`.
 */
export interface FeedsUpdatedMessage {
  type: 'feeds-updated';
}

export const FEEDS_UPDATED: FeedsUpdatedMessage = { type: 'feeds-updated' };

/** Type guard for the broadcast message. */
export function isFeedsUpdated(
  message: unknown,
): message is FeedsUpdatedMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'feeds-updated'
  );
}
