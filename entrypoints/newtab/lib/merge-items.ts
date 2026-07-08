// Pure list helpers for the timeline: pagination cursors and merging a freshly
// re-queried "top page" into the items already on screen after a background
// refresh. Kept framework-free so they're trivially unit-testable in the node
// project (no DOM, no IndexedDB).

import type { FeedItem } from '@/lib/types';

/**
 * The pagination cursor for the next page: the `publishedAt` of the last
 * (oldest) loaded item. `listItems({ before })` returns items strictly older
 * than this. Undefined when there are no items yet.
 */
export function nextCursor(items: FeedItem[]): number | undefined {
  if (items.length === 0) return undefined;
  return items[items.length - 1].publishedAt;
}

/**
 * Count how many of `incoming` are genuinely new relative to `existing`
 * (by item id). Used to size the "N new items" pill after a refresh.
 */
export function countNewItems(
  existing: FeedItem[],
  incoming: FeedItem[],
): number {
  const known = new Set(existing.map((i) => i.id));
  let count = 0;
  for (const item of incoming) {
    if (!known.has(item.id)) count++;
  }
  return count;
}

/**
 * Merge a freshly-queried page into the existing list: new items are added,
 * items already present are replaced with their latest version (read-state can
 * change), and the result is sorted newest-first with ids unique. The existing
 * list's tail (older pages the fresh query didn't cover) is preserved.
 */
export function mergeItems(
  existing: FeedItem[],
  incoming: FeedItem[],
): FeedItem[] {
  const byId = new Map<string, FeedItem>();
  for (const item of existing) byId.set(item.id, item);
  // Incoming wins on conflict—it's the fresher copy.
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}
