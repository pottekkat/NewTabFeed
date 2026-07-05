// Typed message protocol between UI pages (newtab/popup) and the service worker.
//
// One discriminated union in each direction. The worker performs the mutations
// (fetching needs the worker's host access; writes are centralized there). Pages
// read IndexedDB directly for rendering — messages are only for actions and for
// the worker to notify pages that data changed.

import type { SubscribeResult } from '@/lib/feeds/refresh';
import type { ImportOpmlResult } from '@/lib/opml';
import type { DiscoveredFeed } from '@/lib/discovery/types';

/** Messages sent FROM a UI page TO the service worker. */
export type RequestMessage =
  | { type: 'refresh-now'; force?: boolean }
  | { type: 'subscribe'; url: string }
  | { type: 'unsubscribe'; feedId: string }
  | { type: 'import-opml'; xml: string }
  | { type: 'export-opml' }
  // Discovery (popup): read what the content script found for a tab, and probe
  // a site's well-known paths on demand.
  | { type: 'get-discovered'; tabId: number }
  | { type: 'probe-origin'; origin: string };

/** Discriminant strings, for exhaustive handling and testing. */
export type RequestType = RequestMessage['type'];

/** Successful responses, keyed by request type. */
export interface ResponseMap {
  'refresh-now': { changed: boolean };
  subscribe: SubscribeResult;
  unsubscribe: { ok: true };
  'import-opml': ImportOpmlResult;
  'export-opml': { xml: string };
  'get-discovered': { feeds: DiscoveredFeed[] };
  'probe-origin': { feeds: DiscoveredFeed[] };
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

/**
 * Sent FROM the discovery content script TO the worker when it finds (or finds
 * no) feeds on a page. Fire-and-forget: the worker reads `sender.tab.id` to key
 * the result per tab, so this is handled in the background listener (which has
 * `sender`) rather than through the request/response `dispatch`.
 */
export interface FeedsFoundMessage {
  type: 'feeds-found';
  feeds: DiscoveredFeed[];
  pageUrl?: string;
}

/** Type guard for the content-script discovery message. */
export function isFeedsFound(message: unknown): message is FeedsFoundMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'feeds-found'
  );
}
