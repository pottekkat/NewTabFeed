// Well-known feed path probing — service-worker only (it fetches).
//
// When a page advertises no feed via <link> tags, the popup can ask us to try a
// short list of conventional feed locations for the site's origin. Every hit is
// validated by actually parsing it (feedsmith, pure-JS, SW-safe) so we never
// report a 200 HTML page or a JSON API as a feed. Results are cached per origin
// in storage.session with a 1h TTL to avoid re-hammering a site.

import { browser } from 'wxt/browser';
import { fetchFeed } from '@/lib/feeds/fetch';
import { parseFeed } from '@/lib/feeds/parse';
import { assertHostAccess } from '@/lib/permissions';
import type { DiscoveredFeed, FeedKind } from '@/lib/discovery/types';

/**
 * Conventional feed paths, in priority order. Kept short and high-signal: the
 * common CMS/blog defaults plus a couple of platform-specific ones (WordPress
 * `?feed=rss2`, Blogger `/feeds/posts/default`).
 */
export const WELL_KNOWN_PATHS: readonly string[] = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
  '/feed.json',
  '/feed/atom',
  '/?feed=rss2',
  '/blog/feed',
  '/feeds/posts/default',
];

/** Per-request timeout for each probe. Shorter than a normal feed fetch. */
const PROBE_TIMEOUT_MS = 8_000;
/** Max probes in flight at once. */
const PROBE_CONCURRENCY = 3;
/** Stop probing once this many valid feeds are found. */
const STOP_AFTER = 2;
/** Cached probe results live this long. */
const CACHE_TTL_MS = 60 * 60_000; // 1 hour

interface ProbeCacheEntry {
  feeds: DiscoveredFeed[];
  timestamp: number;
}

function cacheKey(origin: string): string {
  return `probe:${origin}`;
}

export interface ProbeOptions {
  /** Bypass the cache and re-probe. */
  force?: boolean;
  /** For tests: override "now". */
  now?: number;
}

/**
 * Probe a site origin for feeds at well-known paths. Requires host access
 * (throws `NoHostPermissionError` otherwise, so the popup can prompt). Returns
 * the discovered, parse-validated feeds (possibly empty). Results are cached per
 * origin for 1h unless `force` is set.
 */
export async function probeOrigin(
  origin: string,
  options: ProbeOptions = {},
): Promise<DiscoveredFeed[]> {
  await assertHostAccess();

  const now = options.now ?? Date.now();
  if (!options.force) {
    const cached = await readCache(origin, now);
    if (cached) {
      return cached;
    }
  }

  const feeds = await runProbes(origin);
  await writeCache(origin, feeds, now);
  return feeds;
}

async function readCache(
  origin: string,
  now: number,
): Promise<DiscoveredFeed[] | undefined> {
  const key = cacheKey(origin);
  const stored = (await browser.storage.session.get(key)) as Record<
    string,
    ProbeCacheEntry | undefined
  >;
  const entry = stored[key];
  if (entry && now - entry.timestamp < CACHE_TTL_MS) {
    return entry.feeds;
  }
  return undefined;
}

async function writeCache(
  origin: string,
  feeds: DiscoveredFeed[],
  now: number,
): Promise<void> {
  const entry: ProbeCacheEntry = { feeds, timestamp: now };
  await browser.storage.session.set({ [cacheKey(origin)]: entry });
}

/** Probe all paths with bounded concurrency, stopping early after enough hits. */
async function runProbes(origin: string): Promise<DiscoveredFeed[]> {
  const controller = new AbortController();
  const hits: DiscoveredFeed[] = [];
  const seen = new Set<string>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < WELL_KNOWN_PATHS.length && hits.length < STOP_AFTER) {
      const path = WELL_KNOWN_PATHS[next++];
      const url = joinOriginPath(origin, path);
      const feed = await probeUrl(url, controller.signal);
      if (feed && !seen.has(feed.url)) {
        seen.add(feed.url);
        hits.push(feed);
        if (hits.length >= STOP_AFTER) {
          // Cancel in-flight probes; we have enough.
          controller.abort();
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(PROBE_CONCURRENCY, WELL_KNOWN_PATHS.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return hits;
}

/** Fetch one candidate; return a feed only if it fetches AND parses as a feed. */
async function probeUrl(
  url: string,
  signal: AbortSignal,
): Promise<DiscoveredFeed | undefined> {
  try {
    const result = await fetchFeed(url, {
      timeoutMs: PROBE_TIMEOUT_MS,
      signal,
    });
    if (result.status !== 'ok') {
      return undefined; // No validators were sent, so a 304 shouldn't happen.
    }
    const parsed = parseFeed(result.body);
    if (!parsed.feed.title && parsed.items.length === 0) {
      return undefined; // Parsed, but not a usable feed.
    }
    return {
      url,
      title: parsed.feed.title?.trim() || undefined,
      kind: classifyKind(result.body),
      source: 'probe',
    };
  } catch {
    // Non-2xx, network error, timeout, abort, or parse failure → not a feed here.
    return undefined;
  }
}

/** Sniff the feed kind from the raw document. */
function classifyKind(body: string): FeedKind {
  const head = body.slice(0, 512).trimStart().toLowerCase();
  if (head.startsWith('{')) {
    return 'json';
  }
  if (head.includes('<feed')) {
    return 'atom';
  }
  if (head.includes('<rss') || head.includes('<rdf')) {
    return 'rss';
  }
  return 'unknown';
}

/** Join an origin and an absolute path, tolerating a trailing slash on the origin. */
function joinOriginPath(origin: string, path: string): string {
  return `${origin.replace(/\/$/, '')}${path}`;
}
