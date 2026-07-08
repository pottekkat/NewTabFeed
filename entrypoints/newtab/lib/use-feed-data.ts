// The new tab's data engine.
//
// Reads items and feeds straight from IndexedDB (the same DB the worker writes),
// so the first paint is instant from local data—no message round-trip. It
// paginates the timeline, tracks per-feed unread counts, applies the unread-only
// and per-feed filters, and reacts to the worker's `feeds-updated` broadcast: it
// re-queries the top page and, if the user has scrolled away, surfaces the new
// items behind an "N new" pill instead of yanking their scroll position.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Feed, FeedItem } from '@/lib/types';
import {
  listFeeds,
  listItems,
  markAllRead as dbMarkAllRead,
  markRead as dbMarkRead,
  unreadCounts,
} from '@/lib/db';
import { isFeedsUpdated } from '@/lib/messages';
import { countNewItems, mergeItems, nextCursor } from './merge-items';

const PAGE_SIZE = 50;
/** Scroll offset (px) under which a refresh merges silently instead of pilling. */
const NEAR_TOP_PX = 200;

export interface FeedData {
  feeds: Feed[];
  unread: Map<string, number>;
  /** Sum of all unread counts—for the "All feeds" filter entry. */
  totalUnread: number;
  items: FeedItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Count of new items waiting behind the pill (0 when none / already shown). */
  newCount: number;

  unreadOnly: boolean;
  setUnreadOnly: (value: boolean) => void;
  /** Selected feed id, or undefined for the all-feeds timeline. */
  feedId: string | undefined;
  setFeedId: (value: string | undefined) => void;

  loadMore: () => void;
  showNewItems: () => void;
  markItemRead: (item: FeedItem) => Promise<void>;
  markAllRead: (feedId?: string) => Promise<void>;
  /** Refresh feeds + unread counts without disturbing the item list. */
  refreshFeeds: () => Promise<void>;
}

export function useFeedData(): FeedData {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [feedId, setFeedId] = useState<string | undefined>(undefined);

  // Refs let the (long-lived) message listener read current values without
  // re-subscribing on every render.
  const itemsRef = useRef<FeedItem[]>(items);
  itemsRef.current = items;
  const freshTopRef = useRef<FeedItem[]>([]);

  const query = useMemo(
    () => ({ feedIds: feedId ? [feedId] : undefined, unreadOnly }),
    [feedId, unreadOnly],
  );

  const refreshFeeds = useCallback(async () => {
    const [f, u] = await Promise.all([listFeeds(), unreadCounts()]);
    setFeeds(f);
    setUnread(u);
  }, []);

  // Full (re)query from the top for the current filters.
  const reload = useCallback(async () => {
    setLoading(true);
    const page = await listItems({ ...query, limit: PAGE_SIZE });
    setItems(page);
    setHasMore(page.length === PAGE_SIZE);
    setNewCount(0);
    freshTopRef.current = [];
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void refreshFeeds();
  }, [refreshFeeds]);

  // Re-query whenever the filters change (and on mount).
  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const before = nextCursor(itemsRef.current);
    if (before === undefined) return;
    setLoadingMore(true);
    try {
      const page = await listItems({ ...query, limit: PAGE_SIZE, before });
      setItems((prev) => mergeItems(prev, page));
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [query, hasMore, loadingMore]);

  const handleFeedsUpdated = useCallback(async () => {
    await refreshFeeds();
    const freshTop = await listItems({ ...query, limit: PAGE_SIZE });
    const added = countNewItems(itemsRef.current, freshTop);

    // No new items, or the user is already near the top: merge silently. Merging
    // also picks up read-state/metadata changes on existing items.
    if (added === 0 || window.scrollY <= NEAR_TOP_PX) {
      setItems((prev) => mergeItems(prev, freshTop));
      setNewCount(0);
      freshTopRef.current = [];
      return;
    }

    // Scrolled away: stash the fresh page and surface a pill instead.
    freshTopRef.current = freshTop;
    setNewCount(added);
  }, [refreshFeeds, query]);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isFeedsUpdated(message)) void handleFeedsUpdated();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [handleFeedsUpdated]);

  const showNewItems = useCallback(() => {
    const fresh = freshTopRef.current;
    if (fresh.length > 0) setItems((prev) => mergeItems(prev, fresh));
    freshTopRef.current = [];
    setNewCount(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const markItemRead = useCallback(async (item: FeedItem) => {
    if (item.read) return;
    await dbMarkRead(item.id);
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, read: true } : it)),
    );
    setUnread((prev) => {
      const next = new Map(prev);
      next.set(item.feedId, Math.max(0, (next.get(item.feedId) ?? 0) - 1));
      return next;
    });
  }, []);

  const markAllRead = useCallback(
    async (feed?: string) => {
      await dbMarkAllRead(feed);
      await refreshFeeds();
      await reload();
    },
    [refreshFeeds, reload],
  );

  const totalUnread = useMemo(() => {
    let sum = 0;
    for (const count of unread.values()) sum += count;
    return sum;
  }, [unread]);

  return {
    feeds,
    unread,
    totalUnread,
    items,
    loading,
    loadingMore,
    hasMore,
    newCount,
    unreadOnly,
    setUnreadOnly,
    feedId,
    setFeedId,
    loadMore,
    showNewItems,
    markItemRead,
    markAllRead,
    refreshFeeds,
  };
}
