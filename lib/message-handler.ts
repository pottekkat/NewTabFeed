// Service-worker message handling: turns a typed RequestMessage into a typed
// response, and broadcasts `feeds-updated` when a mutation changes stored data.
//
// Kept out of the background entrypoint so it's unit-testable without the SW
// runtime. background.ts just registers the listener and calls `dispatch`.

import { browser } from 'wxt/browser';
import type { AnyResponse, RequestMessage, Response } from '@/lib/messages';
import { FEEDS_UPDATED } from '@/lib/messages';
import { listFeeds } from '@/lib/db';
import { refreshAllFeeds, subscribe, unsubscribe } from '@/lib/feeds';
import { exportOpml, importOpml } from '@/lib/opml';
import { refreshIntervalMinutes } from '@/lib/settings';

/** Notify all open pages that stored feeds/items changed. Best-effort. */
export async function broadcastFeedsUpdated(): Promise<void> {
  try {
    await browser.runtime.sendMessage(FEEDS_UPDATED);
  } catch {
    // No receivers (no open newtab) → sendMessage rejects. That's fine.
  }
}

/** Handle a request, throwing on failure (see `dispatch` for the safe wrapper). */
async function handleRequest(message: RequestMessage): Promise<AnyResponse> {
  switch (message.type) {
    case 'refresh-now': {
      const intervalMs = (await refreshIntervalMinutes.getValue()) * 60_000;
      const result = await refreshAllFeeds({
        force: message.force ?? false,
        intervalMs,
      });
      if (result.changed) {
        await broadcastFeedsUpdated();
      }
      return { ok: true, data: { changed: result.changed } };
    }
    case 'subscribe': {
      const data = await subscribe(message.url);
      await broadcastFeedsUpdated();
      return { ok: true, data };
    }
    case 'unsubscribe': {
      await unsubscribe(message.feedId);
      await broadcastFeedsUpdated();
      return { ok: true, data: { ok: true } };
    }
    case 'import-opml': {
      const data = await importOpml(message.xml);
      if (data.added.length > 0) {
        await broadcastFeedsUpdated();
      }
      return { ok: true, data };
    }
    case 'export-opml': {
      const feeds = await listFeeds();
      return { ok: true, data: { xml: exportOpml(feeds) } };
    }
  }
}

/**
 * Safe entry point for the onMessage listener: never rejects, always resolves to
 * a Response envelope so the UI gets a structured error instead of a dropped
 * promise. `errorName` lets the UI branch (e.g. NoHostPermissionError → prompt).
 */
export async function dispatch<M extends RequestMessage>(
  message: M,
): Promise<Response<M['type']>> {
  try {
    return (await handleRequest(message)) as Response<M['type']>;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined,
    };
  }
}
