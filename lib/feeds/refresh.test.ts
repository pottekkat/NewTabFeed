import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetIndexedDB } from '@/tests/idb';
import { fixture } from '@/tests/helpers';
import { getFeed, listItems, markRead } from '@/lib/db';
import type { Feed } from '@/lib/types';
import {
  subscribe,
  unsubscribe,
  refreshFeed,
  refreshAllFeeds,
  isDue,
  backoffActive,
  AlreadySubscribedError,
  InvalidFeedError,
} from '@/lib/feeds';
import { NoHostPermissionError } from '@/lib/permissions';

// Favicon caching does real network work in the worker; stub it here so
// subscribe/refresh tests stay deterministic and offline. It returns a cached
// `data:` URL whenever the feed declared an icon, mirroring the real helper's
// "feed icon first" behavior. favicon.test.ts covers the real implementation.
vi.mock('@/lib/feeds/favicon', () => ({
  resolveAndCacheIcon: vi.fn(
    async ({ feedIconUrl }: { siteUrl?: string; feedIconUrl?: string }) =>
      feedIconUrl ? 'data:image/png;base64,AAAA' : undefined,
  ),
}));

// Host access is granted by default; individual tests flip `hasAccess`.
const hasAccess = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  return {
    ...actual,
    assertHostAccess: async () => {
      if (!(await hasAccess())) {
        throw new actual.NoHostPermissionError();
      }
    },
  };
});

interface Entry {
  body?: string;
  etag?: string;
  status?: number;
}

const registry = new Map<string, Entry>();
const fetchMock = vi.fn();

function mockResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => body,
  };
}

beforeEach(async () => {
  await resetIndexedDB();
  registry.clear();
  hasAccess.mockResolvedValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (url: string, opts?: { headers?: Record<string, string> }) => {
      const entry = registry.get(url);
      if (!entry) {
        return mockResponse(404, 'not found');
      }
      if (entry.status && entry.status >= 400) {
        return mockResponse(entry.status, 'error');
      }
      const ifNoneMatch = opts?.headers?.['If-None-Match'];
      if (entry.etag && ifNoneMatch === entry.etag) {
        return mockResponse(304, '');
      }
      return mockResponse(
        200,
        entry.body ?? '',
        entry.etag ? { etag: entry.etag } : {},
      );
    },
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const FEED_URL = 'https://example.com/feed';

function serve(url: string, entry: Entry) {
  registry.set(url, entry);
}

/** Build an RSS document with `count` items, dated one day apart (item N newest). */
function rssWithItems(count: number): string {
  const items = Array.from({ length: count }, (_, i) => {
    const n = i + 1; // Item n is n days after the epoch base → higher n is newer.
    const date = new Date(Date.UTC(2024, 0, n)).toUTCString();
    return `<item>
      <title>Item ${n}</title>
      <link>https://example.com/posts/${n}</link>
      <guid isPermaLink="false">tag:example.com,2024:/posts/${n}</guid>
      <pubDate>${date}</pubDate>
      <description>Body ${n}</description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Many Items</title>
    <link>https://example.com</link>
    <description>A feed with a back-catalogue</description>
    ${items}
  </channel>
</rss>`;
}

describe('subscribe', () => {
  it('creates a feed and its items from a fetched document', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml'), etag: 'W/"v1"' });
    const { feed, addedItems } = await subscribe(FEED_URL);

    expect(feed.id).toBe(FEED_URL);
    expect(feed.title).toBe('Gadgets & Gizmos');
    expect(feed.siteUrl).toBe('https://example.com/');
    expect(feed.etag).toBe('W/"v1"');
    expect(feed.error).toBeNull();
    expect(addedItems).toBe(2);
    expect(await listItems()).toHaveLength(2);
  });

  it("caches the feed's declared icon as a local data URL", async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    const { feed } = await subscribe(FEED_URL);
    // rss2.xml declares <image><url>/logo.png</url>; the worker fetches its
    // bytes and stores them as a data URL (stubbed helper).
    expect(feed.iconUrl).toMatch(/^data:image\//);
    expect((await getFeed(FEED_URL))?.iconUrl).toMatch(/^data:image\//);
  });

  it('stores only the newest 10 items when a feed has more', async () => {
    // 15 items dated one day apart; item 15 is the newest.
    serve(FEED_URL, { body: rssWithItems(15) });
    const { addedItems } = await subscribe(FEED_URL);
    expect(addedItems).toBe(10);

    const stored = await listItems();
    expect(stored).toHaveLength(10);
    // The newest 10 (items 15..6) are kept; the 5 oldest are dropped.
    const titles = stored.map((i) => i.title).sort();
    expect(titles).toContain('Item 15');
    expect(titles).toContain('Item 6');
    expect(titles).not.toContain('Item 5');
    expect(titles).not.toContain('Item 1');
  });

  it('canonicalizes the URL so it is the feed id', async () => {
    serve('https://example.com/feed', { body: fixture('rss2.xml') });
    const { feed } = await subscribe(
      '  EXAMPLE.com/feed#frag  '.replace('EXAMPLE', 'example'),
    );
    expect(feed.id).toBe('https://example.com/feed');
  });

  it('rejects a duplicate subscription', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await subscribe(FEED_URL);
    await expect(subscribe(FEED_URL)).rejects.toBeInstanceOf(
      AlreadySubscribedError,
    );
  });

  it('rejects a document that is not a valid feed', async () => {
    serve(FEED_URL, { body: fixture('malformed.xml') });
    await expect(subscribe(FEED_URL)).rejects.toBeInstanceOf(InvalidFeedError);
  });

  it('propagates NoHostPermissionError when access is missing', async () => {
    hasAccess.mockResolvedValue(false);
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await expect(subscribe(FEED_URL)).rejects.toBeInstanceOf(
      NoHostPermissionError,
    );
  });
});

describe('unsubscribe', () => {
  it('removes the feed and its items', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await subscribe(FEED_URL);
    await unsubscribe(FEED_URL);
    expect(await getFeed(FEED_URL)).toBeUndefined();
    expect(await listItems()).toHaveLength(0);
  });
});

describe('refreshFeed', () => {
  it('short-circuits on a 304 and preserves items', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml'), etag: 'W/"v1"' });
    await subscribe(FEED_URL);
    const before = Date.now();

    const outcome = await refreshFeed(FEED_URL);
    expect(outcome).toEqual({ feedId: FEED_URL, status: 'not-modified' });
    const feed = await getFeed(FEED_URL);
    expect(feed?.lastFetchedAt).toBeGreaterThanOrEqual(before);
    expect(feed?.error).toBeNull();
    expect(await listItems()).toHaveLength(2);
  });

  it('preserves read flags across a re-fetch with changed content', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') }); // no etag → always 200
    await subscribe(FEED_URL);
    const [newest] = await listItems();
    await markRead(newest.id);

    const outcome = await refreshFeed(FEED_URL);
    expect(outcome.status).toBe('updated');
    const stored = (await listItems()).find((i) => i.id === newest.id);
    expect(stored?.read).toBe(true);
  });

  it('records an error (not a throw) when the fetch fails', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await subscribe(FEED_URL);
    serve(FEED_URL, { status: 500 });

    const outcome = await refreshFeed(FEED_URL);
    expect(outcome.status).toBe('error');
    const feed = await getFeed(FEED_URL);
    expect(feed?.error?.failCount).toBe(1);
    expect(feed?.error?.message).toContain('500');
  });

  it('increments failCount across consecutive failures, keeping the original since', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await subscribe(FEED_URL);
    serve(FEED_URL, { status: 500 });
    await refreshFeed(FEED_URL);
    const firstSince = (await getFeed(FEED_URL))?.error?.since;
    await refreshFeed(FEED_URL);
    const feed = await getFeed(FEED_URL);
    expect(feed?.error?.failCount).toBe(2);
    expect(feed?.error?.since).toBe(firstSince);
  });

  it('clears the error after a successful refresh', async () => {
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await subscribe(FEED_URL);
    serve(FEED_URL, { status: 500 });
    await refreshFeed(FEED_URL);
    serve(FEED_URL, { body: fixture('rss2.xml') });
    await refreshFeed(FEED_URL);
    expect((await getFeed(FEED_URL))?.error).toBeNull();
  });
});

describe('refreshAllFeeds', () => {
  const A = 'https://a.example.com/feed';
  const B = 'https://b.example.com/feed';

  async function subscribeBoth() {
    serve(A, { body: fixture('rss2.xml') });
    serve(B, { body: fixture('atom.xml') });
    await subscribe(A);
    await subscribe(B);
  }

  it('isolates a failing feed from a healthy one', async () => {
    await subscribeBoth();
    serve(A, { status: 503 }); // A now fails
    // Force so freshly-subscribed feeds are eligible despite recent lastFetchedAt.
    const result = await refreshAllFeeds({ force: true });

    const byId = Object.fromEntries(
      result.outcomes.map((o) => [o.feedId, o.status]),
    );
    expect(byId[A]).toBe('error');
    // B has no ETag, so it re-fetches 200 and re-parses successfully.
    expect(byId[B]).toBe('updated');
    expect((await getFeed(A))?.error?.failCount).toBe(1);
    expect((await getFeed(B))?.error).toBeNull();
  });

  it('skips fresh feeds unless forced', async () => {
    await subscribeBoth();
    // Just subscribed → lastFetchedAt is now → not stale at a 30-min interval.
    const skippedResult = await refreshAllFeeds();
    expect(skippedResult.outcomes).toHaveLength(0);
    expect(skippedResult.skipped).toBe(2);

    const forcedResult = await refreshAllFeeds({ force: true });
    expect(forcedResult.outcomes).toHaveLength(2);
  });

  it('reports changed=false when nothing new was written', async () => {
    await subscribeBoth();
    const result = await refreshAllFeeds({ force: true });
    // Same fixtures re-served → items dedupe → no new items.
    expect(result.changed).toBe(false);
  });
});

describe('isDue / backoffActive (staleness + backoff policy)', () => {
  const base: Feed = { id: 'f', url: 'f', title: 'f', addedAt: 0, error: null };
  const now = 10_000_000;
  const interval = 30 * 60_000;

  it('is due when stale and healthy', () => {
    expect(
      isDue({ ...base, lastFetchedAt: now - interval - 1 }, interval, now),
    ).toBe(true);
  });

  it('is not due when fetched within the interval', () => {
    expect(isDue({ ...base, lastFetchedAt: now - 1 }, interval, now)).toBe(
      false,
    );
  });

  it('does not back off at or below the failure threshold', () => {
    const feed = { ...base, error: { message: 'x', failCount: 3, since: now } };
    expect(backoffActive(feed, now)).toBe(false);
  });

  it('backs off past the threshold until the (exponential) window elapses', () => {
    const feed = { ...base, error: { message: 'x', failCount: 6, since: now } };
    // Still inside the backoff window right after the streak started.
    expect(backoffActive(feed, now + 60_000)).toBe(true);
    // Well past 6h → window elapsed.
    expect(backoffActive(feed, now + 7 * 60 * 60_000)).toBe(false);
  });

  it('a backed-off feed is not due even when stale', () => {
    const feed = {
      ...base,
      lastFetchedAt: 0,
      error: { message: 'x', failCount: 6, since: now },
    };
    expect(isDue(feed, interval, now + 60_000)).toBe(false);
  });
});
