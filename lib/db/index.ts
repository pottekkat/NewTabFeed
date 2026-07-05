// IndexedDB persistence layer, via `idb`.
//
// Why IndexedDB (not chrome.storage): the item archive needs indexes (by feed,
// by date, by read state) and can exceed chrome.storage.local's 10 MB cap. The
// manifest declares `unlimitedStorage`.
//
// Context note: IndexedDB is available in BOTH the MV3 service worker AND
// extension pages (newtab/popup), and both open the SAME named database. So the
// newtab page reads items directly from here — no message-passing round-trip to
// the worker just to render. The worker writes on refresh; the page reads and
// re-queries when it receives a `feeds-updated` broadcast.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Feed, FeedItem } from '@/lib/types';

const DB_NAME = 'newtabfeed';
const DB_VERSION = 1;

/** Newest items kept per feed by `pruneFeed`. Unread items are never pruned. */
export const KEEP_ITEMS_PER_FEED = 200;

interface NtfDB extends DBSchema {
  feeds: {
    key: string;
    value: Feed;
  };
  items: {
    key: string;
    value: FeedItem;
    indexes: {
      /** All items for a feed. */
      'by-feed': string;
      /** Global newest-first ordering (cross-feed timeline). */
      'by-published': number;
      /** Per-feed newest-first ordering + prune candidate scan. */
      'by-feed-published': [string, number];
    };
  };
}

let dbPromise: Promise<IDBPDatabase<NtfDB>> | undefined;

/**
 * Open (or reuse) the database connection.
 *
 * The promise is memoized per JS context. In the ephemeral service worker this
 * cache dies with the worker, which is fine — the next event reopens it. No
 * durable state lives in this module beyond the connection handle.
 */
export function getDB(): Promise<IDBPDatabase<NtfDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NtfDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // v1 schema. Future migrations branch on `oldVersion` here.
        db.createObjectStore('feeds', { keyPath: 'id' });
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('by-feed', 'feedId');
        items.createIndex('by-published', 'publishedAt');
        items.createIndex('by-feed-published', ['feedId', 'publishedAt']);
      },
    });
  }
  return dbPromise;
}

/** Reset the memoized connection. Test-only; production never closes the DB. */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = undefined;
  }
}

// ── Feeds ──────────────────────────────────────────────────────────────────

export async function upsertFeed(feed: Feed): Promise<void> {
  const db = await getDB();
  await db.put('feeds', feed);
}

export async function getFeed(id: string): Promise<Feed | undefined> {
  const db = await getDB();
  return db.get('feeds', id);
}

export async function listFeeds(): Promise<Feed[]> {
  const db = await getDB();
  const feeds = await db.getAll('feeds');
  // Stable, human-friendly order: oldest subscription first.
  return feeds.sort((a, b) => a.addedAt - b.addedAt);
}

/** Delete a feed and cascade-delete all of its items in one transaction. */
export async function deleteFeed(feedId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['feeds', 'items'], 'readwrite');
  await tx.objectStore('feeds').delete(feedId);
  const index = tx.objectStore('items').index('by-feed');
  let cursor = await index.openCursor(IDBKeyRange.only(feedId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── Items ──────────────────────────────────────────────────────────────────

/**
 * Insert or update items, deduping by `id`. Crucially, when an item already
 * exists (a re-fetch of the same entry), the stored `read` flag and original
 * `fetchedAt` are PRESERVED — re-fetching never marks a read item unread.
 * Returns the number of genuinely new items written.
 */
export async function upsertItems(items: FeedItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  const store = tx.objectStore('items');
  let added = 0;
  for (const item of items) {
    const existing = await store.get(item.id);
    if (existing) {
      await store.put({
        ...item,
        read: existing.read,
        fetchedAt: existing.fetchedAt,
      });
    } else {
      await store.put(item);
      added++;
    }
  }
  await tx.done;
  return added;
}

export interface ListItemsQuery {
  /** Restrict to these feeds. Omit for the all-feeds timeline. */
  feedIds?: string[];
  /** Only return unread items. */
  unreadOnly?: boolean;
  /** Page size. Default 50. */
  limit?: number;
  /**
   * Pagination cursor: return only items strictly older than this epoch-ms
   * publish time. Pass the `publishedAt` of the last item from the previous
   * page. (Items sharing an exact timestamp at the page boundary are a rare
   * edge; acceptable for a local reader.)
   */
  before?: number;
}

/**
 * List items newest-first with pagination. Walks the global `by-published`
 * index in descending order and filters in memory by feed set / read state.
 */
export async function listItems(
  query: ListItemsQuery = {},
): Promise<FeedItem[]> {
  const { feedIds, unreadOnly = false, limit = 50, before } = query;
  const feedSet = feedIds && feedIds.length > 0 ? new Set(feedIds) : undefined;
  const db = await getDB();
  const index = db
    .transaction('items')
    .objectStore('items')
    .index('by-published');
  const range =
    before !== undefined ? IDBKeyRange.upperBound(before, true) : undefined;

  const out: FeedItem[] = [];
  let cursor = await index.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    const item = cursor.value;
    if ((!feedSet || feedSet.has(item.feedId)) && (!unreadOnly || !item.read)) {
      out.push(item);
    }
    cursor = await cursor.continue();
  }
  return out;
}

async function setRead(itemId: string, read: boolean): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  const store = tx.objectStore('items');
  const item = await store.get(itemId);
  if (item && item.read !== read) {
    await store.put({ ...item, read });
  }
  await tx.done;
}

export function markRead(itemId: string): Promise<void> {
  return setRead(itemId, true);
}

export function markUnread(itemId: string): Promise<void> {
  return setRead(itemId, false);
}

/** Mark every item read, or every item of a single feed when `feedId` is given. */
export async function markAllRead(feedId?: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  const store = tx.objectStore('items');
  const source = feedId
    ? store.index('by-feed').iterate(IDBKeyRange.only(feedId))
    : store.iterate();
  for await (const cursor of source) {
    if (!cursor.value.read) {
      await cursor.update({ ...cursor.value, read: true });
    }
  }
  await tx.done;
}

/**
 * Unread counts per feed, as a Map keyed by feedId (feeds with zero unread are
 * present with value 0). One cursor pass over the item store.
 *
 * We deliberately do NOT maintain a boolean read index: IndexedDB cannot use
 * booleans as keys, and at local-reader scale (feeds pruned to a few hundred
 * items) a single scan is cheap and simpler than mirroring a numeric flag.
 */
export async function unreadCounts(): Promise<Map<string, number>> {
  const db = await getDB();
  const counts = new Map<string, number>();
  for (const feed of await db.getAllKeys('feeds')) {
    counts.set(feed, 0);
  }
  const tx = db.transaction('items');
  for await (const cursor of tx.objectStore('items').iterate()) {
    const { feedId, read } = cursor.value;
    if (!read) {
      counts.set(feedId, (counts.get(feedId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Total number of stored items (test/diagnostic helper). */
export async function countItems(): Promise<number> {
  const db = await getDB();
  return db.count('items');
}

/**
 * Prune a feed's items down to the newest `KEEP_ITEMS_PER_FEED`, deleting only
 * READ items beyond that window. Unread items are always kept, even past the
 * cap, so nothing the user hasn't seen disappears. Returns items deleted.
 */
export async function pruneFeed(
  feedId: string,
  keep = KEEP_ITEMS_PER_FEED,
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('items', 'readwrite');
  const index = tx.objectStore('items').index('by-feed-published');
  // Descending over [feedId, publishedAt]: newest items first.
  const range = IDBKeyRange.bound([feedId, -Infinity], [feedId, Infinity]);
  let seen = 0;
  let deleted = 0;
  let cursor = await index.openCursor(range, 'prev');
  while (cursor) {
    seen++;
    if (seen > keep && cursor.value.read) {
      await cursor.delete();
      deleted++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}
