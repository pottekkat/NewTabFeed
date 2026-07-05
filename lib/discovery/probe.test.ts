import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { probeOrigin, WELL_KNOWN_PATHS } from '@/lib/discovery/probe';
import { NoHostPermissionError } from '@/lib/permissions';

// Control host access directly (as lib/feeds/fetch.test does) so probeOrigin's
// own assertHostAccess and fetchFeed's share one switch.
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

const ORIGIN = 'https://blog.example.com';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test Feed</title><item><title>Hello</title><link>https://blog.example.com/hello</link></item></channel></rss>`;
const HTML =
  '<!doctype html><html><head><title>Not a feed</title></head><body>hi</body></html>';

function response(
  body: string | undefined,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? (body ? 200 : 404);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(init.headers),
    text: async () => body ?? 'not found',
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fakeBrowser.reset();
  hasAccess.mockResolvedValue(true);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Serve a body for the listed full URLs, 404 for everything else. */
function serve(registry: Record<string, string>) {
  fetchMock.mockImplementation(async (url: string) => response(registry[url]));
}

describe('probeOrigin', () => {
  it('throws NoHostPermissionError when host access is missing', async () => {
    hasAccess.mockResolvedValue(false);
    await expect(probeOrigin(ORIGIN)).rejects.toBeInstanceOf(
      NoHostPermissionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports only feeds that actually parse (ignores HTML 200s)', async () => {
    serve({
      [`${ORIGIN}/feed`]: HTML, // 200 but not a feed
      [`${ORIGIN}/rss`]: RSS,
    });
    const feeds = await probeOrigin(ORIGIN);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: `${ORIGIN}/rss`,
      title: 'Test Feed',
      kind: 'rss',
      source: 'probe',
    });
  });

  it('stops early after two hits instead of probing every path', async () => {
    // Every path returns a valid feed; early-stop must avoid all 12 fetches.
    fetchMock.mockImplementation(async () => response(RSS));
    const feeds = await probeOrigin(ORIGIN);
    expect(feeds.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeLessThan(WELL_KNOWN_PATHS.length);
  });

  it('treats network errors as misses', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${ORIGIN}/index.xml`) return response(RSS);
      throw new TypeError('network down');
    });
    const feeds = await probeOrigin(ORIGIN);
    expect(feeds).toEqual([
      expect.objectContaining({ url: `${ORIGIN}/index.xml` }),
    ]);
  });

  it('caches results per origin within the TTL, then re-probes after it', async () => {
    serve({ [`${ORIGIN}/rss`]: RSS });
    const t0 = 1_000_000;

    const first = await probeOrigin(ORIGIN, { now: t0 });
    expect(first).toHaveLength(1);
    const afterFirst = fetchMock.mock.calls.length;

    // Within TTL → served from cache, no new fetches.
    const second = await probeOrigin(ORIGIN, { now: t0 + 60_000 });
    expect(second).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(afterFirst);

    // Past the 1h TTL → probes again.
    const third = await probeOrigin(ORIGIN, { now: t0 + 61 * 60_000 });
    expect(third).toHaveLength(1);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it('force bypasses the cache', async () => {
    serve({ [`${ORIGIN}/rss`]: RSS });
    const t0 = 2_000_000;
    await probeOrigin(ORIGIN, { now: t0 });
    const afterFirst = fetchMock.mock.calls.length;
    await probeOrigin(ORIGIN, { now: t0 + 1000, force: true });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });
});
