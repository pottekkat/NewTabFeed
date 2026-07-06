// Feed lifecycle orchestration: subscribe, unsubscribe, and refresh.
//
// This ties together fetch (network) + parse (feedsmith) + db (IndexedDB). It
// owns the policy decisions: staleness, per-feed error isolation, exponential
// backoff, and pruning. All of it runs in the service worker.

import type { Feed, FeedItem, NormalizedItem } from '@/lib/types';
import { canonicalizeUrl, resolveUrl } from '@/lib/url';
import { itemId } from '@/lib/hash';
import { parseFeed } from '@/lib/feeds/parse';
import { fetchFeed, FeedFetchError } from '@/lib/feeds/fetch';
import { resolveAndCacheIcon } from '@/lib/feeds/favicon';
import { NoHostPermissionError } from '@/lib/permissions';
import {
  deleteFeed,
  getFeed,
  listFeeds,
  pruneFeed,
  upsertFeed,
  upsertItems,
} from '@/lib/db';

/** Failing feeds (failCount > this) enter exponential backoff. */
const BACKOFF_FAILCOUNT_THRESHOLD = 3;
/** First backoff step once past the threshold. */
const BACKOFF_BASE_MS = 15 * 60_000; // 15 minutes
/** Backoff never waits longer than this. */
const BACKOFF_MAX_MS = 6 * 60 * 60_000; // 6 hours
/** Default concurrency for refreshing many feeds at once. */
const DEFAULT_CONCURRENCY = 6;
/**
 * On first subscribe, only keep the newest N items. Later refreshes merge in
 * new items on top, so nothing is lost — this just avoids flooding a brand-new
 * subscription with a feed's entire back-catalogue.
 */
const MAX_ITEMS_ON_SUBSCRIBE = 10;

export class AlreadySubscribedError extends Error {
  constructor(public readonly url: string) {
    super(`Already subscribed to ${url}`);
    this.name = 'AlreadySubscribedError';
  }
}

export class InvalidFeedError extends Error {
  constructor(url: string, reason: string) {
    super(`Not a valid feed (${url}): ${reason}`);
    this.name = 'InvalidFeedError';
  }
}

/** Outcome of refreshing a single feed. */
export type RefreshOutcome =
  | { feedId: string; status: 'updated'; addedItems: number }
  | { feedId: string; status: 'not-modified' }
  | { feedId: string; status: 'error'; message: string };

// ── Normalized → stored item ─────────────────────────────────────────────────

function toFeedItem(
  feedId: string,
  item: NormalizedItem,
  fetchedAt: number,
): FeedItem {
  return {
    id: itemId(feedId, item.guid),
    feedId,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt ?? fetchedAt,
    author: item.author,
    summaryHtml: item.summaryHtml,
    thumbnailUrl: item.thumbnailUrl,
    read: false,
    fetchedAt,
  };
}

// ── Subscribe / unsubscribe ──────────────────────────────────────────────────

export interface SubscribeResult {
  feed: Feed;
  addedItems: number;
}

/**
 * Subscribe to a feed by URL: canonicalize, fetch, parse, validate, then store
 * the feed and its items. Throws `AlreadySubscribedError` if the (canonical)
 * feed already exists, `InvalidFeedError` if the document isn't a usable feed,
 * and propagates `NoHostPermissionError` / `FeedFetchError` from the network.
 */
export async function subscribe(rawUrl: string): Promise<SubscribeResult> {
  const url = canonicalizeUrl(rawUrl);
  if (await getFeed(url)) {
    throw new AlreadySubscribedError(url);
  }

  const result = await fetchFeed(url);
  if (result.status === 'not-modified') {
    // No prior validators were sent, so a 304 here is nonsensical; treat as invalid.
    throw new InvalidFeedError(url, 'unexpected 304 with no cached copy');
  }

  const parsed = parseFeedOrThrow(url, result.body);
  const now = Date.now();
  const siteUrl = resolveUrl(parsed.feed.siteUrl, url);
  // Fetch + cache the favicon bytes as a local data URL. Best-effort: the helper
  // never throws, so a favicon failure can never fail the subscription.
  const iconUrl = await resolveAndCacheIcon({
    siteUrl,
    feedIconUrl: parsed.feed.iconUrl,
  });
  const feed: Feed = {
    id: url,
    url,
    siteUrl,
    iconUrl,
    title: parsed.feed.title?.trim() || hostnameOf(url),
    description: parsed.feed.description,
    addedAt: now,
    lastFetchedAt: now,
    lastPublishedAt: parsed.feed.lastPublishedAt,
    etag: result.etag,
    lastModified: result.lastModified,
    error: null,
  };

  await upsertFeed(feed);
  // Keep only the newest items on first subscribe. Sort a copy (undefined dates
  // sort last / oldest) so we don't disturb the parsed order or the already-
  // computed feed.lastPublishedAt.
  const newest = [...parsed.items]
    .sort((a, b) => (b.publishedAt ?? -Infinity) - (a.publishedAt ?? -Infinity))
    .slice(0, MAX_ITEMS_ON_SUBSCRIBE);
  const items = newest.map((i) => toFeedItem(feed.id, i, now));
  const addedItems = await upsertItems(items);
  await pruneFeed(feed.id);
  return { feed, addedItems };
}

/** Remove a feed and all of its items. No-op if the feed doesn't exist. */
export async function unsubscribe(feedId: string): Promise<void> {
  await deleteFeed(feedId);
}

// ── Refresh ──────────────────────────────────────────────────────────────────

export interface RefreshFeedOptions {
  /** Abort signal, forwarded to the underlying fetch. */
  signal?: AbortSignal;
}

/**
 * Refresh one feed: conditional GET, parse on 2xx, upsert + prune, and update
 * the feed's metadata and error state. Never throws for network/parse problems
 * — those are captured into the feed's error state and returned as a
 * `status: 'error'` outcome so one bad feed can't break a batch. Genuinely
 * exceptional conditions (missing feed, missing host permission) still throw.
 */
export async function refreshFeed(
  feedId: string,
  options: RefreshFeedOptions = {},
): Promise<RefreshOutcome> {
  const feed = await getFeed(feedId);
  if (!feed) {
    throw new Error(`No such feed: ${feedId}`);
  }

  let result;
  try {
    result = await fetchFeed(feed.url, {
      etag: feed.etag,
      lastModified: feed.lastModified,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof NoHostPermissionError) {
      throw err; // Not a per-feed failure — the whole batch can't proceed.
    }
    await recordFailure(feed, err);
    return { feedId, status: 'error', message: errorMessage(err) };
  }

  const now = Date.now();

  if (result.status === 'not-modified') {
    await upsertFeed({ ...feed, lastFetchedAt: now, error: null });
    return { feedId, status: 'not-modified' };
  }

  let parsed;
  try {
    parsed = parseFeedOrThrow(feed.url, result.body);
  } catch (err) {
    await recordFailure(feed, err);
    return { feedId, status: 'error', message: errorMessage(err) };
  }

  const items = parsed.items.map((i) => toFeedItem(feed.id, i, now));
  const addedItems = await upsertItems(items);
  await pruneFeed(feed.id);

  const siteUrl = resolveUrl(parsed.feed.siteUrl, feed.url) ?? feed.siteUrl;
  // Cache favicon bytes locally. Only (re)resolve when we don't already hold a
  // cached data URL — this avoids refetching every refresh while migrating
  // feeds whose iconUrl is still empty or a remote URL to local bytes.
  const iconUrl = feed.iconUrl?.startsWith('data:')
    ? feed.iconUrl
    : ((await resolveAndCacheIcon({
        siteUrl,
        feedIconUrl: parsed.feed.iconUrl,
      })) ?? feed.iconUrl);

  await upsertFeed({
    ...feed,
    // Respect a user's custom title; otherwise track the feed's own title.
    title: parsed.feed.title?.trim() || feed.title,
    siteUrl,
    iconUrl,
    description: parsed.feed.description ?? feed.description,
    lastFetchedAt: now,
    lastPublishedAt: maxDefined(
      feed.lastPublishedAt,
      parsed.feed.lastPublishedAt,
    ),
    etag: result.etag ?? feed.etag,
    lastModified: result.lastModified ?? feed.lastModified,
    error: null,
  });
  return { feedId, status: 'updated', addedItems };
}

export interface RefreshAllOptions {
  /** Refresh every feed regardless of staleness or backoff. */
  force?: boolean;
  /** Staleness threshold: feeds fetched within this window are skipped. */
  intervalMs?: number;
  /** Max concurrent fetches. Default 6. */
  concurrency?: number;
  signal?: AbortSignal;
}

export interface RefreshAllResult {
  outcomes: RefreshOutcome[];
  /** Feeds that were eligible but skipped (fresh or in backoff). */
  skipped: number;
  /** True if any refresh actually wrote new items (worth broadcasting). */
  changed: boolean;
}

/**
 * Refresh all feeds that are due, with bounded concurrency and per-feed error
 * isolation. Staleness is `now - lastFetchedAt >= intervalMs`. Feeds that have
 * failed more than the threshold enter exponential backoff (capped at 6h) and
 * are skipped until it elapses, unless `force` is set.
 */
export async function refreshAllFeeds(
  options: RefreshAllOptions = {},
): Promise<RefreshAllResult> {
  const {
    force = false,
    intervalMs = 30 * 60_000,
    concurrency = DEFAULT_CONCURRENCY,
    signal,
  } = options;
  const now = Date.now();
  const feeds = await listFeeds();

  const due = feeds.filter((feed) => force || isDue(feed, intervalMs, now));
  const skipped = feeds.length - due.length;

  const outcomes = await runPool(
    due,
    (feed) => refreshFeed(feed.id, { signal }),
    concurrency,
  );

  const changed = outcomes.some(
    (o) => o.status === 'updated' && o.addedItems > 0,
  );
  return { outcomes, skipped, changed };
}

/** A feed is due when it's stale and not currently held off by backoff. */
export function isDue(feed: Feed, intervalMs: number, now: number): boolean {
  if (backoffActive(feed, now)) {
    return false;
  }
  const last = feed.lastFetchedAt ?? 0;
  return now - last >= intervalMs;
}

/**
 * True while a failing feed should be left alone. Backoff kicks in only past
 * the failure-count threshold, then grows exponentially from the streak's start
 * (`error.since`), capped at 6h.
 */
export function backoffActive(feed: Feed, now: number): boolean {
  const error = feed.error;
  if (!error || error.failCount <= BACKOFF_FAILCOUNT_THRESHOLD) {
    return false;
  }
  const steps = error.failCount - BACKOFF_FAILCOUNT_THRESHOLD - 1;
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** steps, BACKOFF_MAX_MS);
  return now - error.since < backoff;
}

// ── Internals ────────────────────────────────────────────────────────────────

function parseFeedOrThrow(url: string, body: string) {
  let parsed;
  try {
    parsed = parseFeed(body);
  } catch (err) {
    throw new InvalidFeedError(url, errorMessage(err));
  }
  if (!parsed.feed.title && parsed.items.length === 0) {
    throw new InvalidFeedError(url, 'no title and no items');
  }
  return parsed;
}

async function recordFailure(feed: Feed, err: unknown): Promise<void> {
  const prior = feed.error;
  await upsertFeed({
    ...feed,
    error: {
      message: errorMessage(err),
      failCount: (prior?.failCount ?? 0) + 1,
      since: prior?.since ?? Date.now(),
    },
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof FeedFetchError || err instanceof InvalidFeedError) {
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function maxDefined(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight. Preserves
 * input order in the returned results. A simple index-sharing pool — no
 * dependency needed.
 */
async function runPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}
