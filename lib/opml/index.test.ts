import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetIndexedDB } from '@/tests/idb';
import { fixture } from '@/tests/helpers';
import type { Feed } from '@/lib/types';
import { exportOpml, parseOpmlDocument, importOpml } from '@/lib/opml';
import { subscribe } from '@/lib/feeds';

// ── Pure export/parse (no network) ───────────────────────────────────────────

describe('parseOpmlDocument', () => {
  const entries = parseOpmlDocument(fixture('subscriptions.opml'));

  it('flattens nested folders into a single list', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://hnrss.org/frontpage');
    expect(urls).toContain('https://xkcd.com/rss.xml'); // was two folders deep
  });

  it('drops folders that have no feed URL', () => {
    expect(entries.some((e) => e.title === 'A folder with no feeds')).toBe(
      false,
    );
  });

  it('dedupes by canonical URL', () => {
    const marginalian = entries.filter(
      (e) => e.url === 'https://www.themarginalian.org/feed/',
    );
    expect(marginalian).toHaveLength(1);
  });

  it('carries title and site URL', () => {
    const hn = entries.find((e) => e.url === 'https://hnrss.org/frontpage');
    expect(hn?.title).toBe('Hacker News');
    expect(hn?.siteUrl).toBe('https://news.ycombinator.com/');
  });
});

describe('exportOpml → parseOpmlDocument round-trip', () => {
  it('preserves the set of feeds', () => {
    const feeds: Feed[] = [
      {
        id: 'https://a.com/feed',
        url: 'https://a.com/feed',
        siteUrl: 'https://a.com/',
        title: 'Alpha',
        addedAt: 1,
        error: null,
      },
      {
        id: 'https://b.com/feed',
        url: 'https://b.com/feed',
        title: 'Beta',
        customTitle: 'My Beta',
        addedAt: 2,
        error: null,
      },
    ];
    const xml = exportOpml(feeds);
    expect(xml).toContain('NewTabFeed subscriptions');

    const parsed = parseOpmlDocument(xml);
    expect(parsed.map((e) => e.url).sort()).toEqual([
      'https://a.com/feed',
      'https://b.com/feed',
    ]);
    // customTitle wins over title on export.
    expect(parsed.find((e) => e.url === 'https://b.com/feed')?.title).toBe(
      'My Beta',
    );
  });
});

// ── Import orchestration (mocked network) ────────────────────────────────────

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

const registry = new Map<string, string>();
const fetchMock = vi.fn();

beforeEach(async () => {
  await resetIndexedDB();
  registry.clear();
  hasAccess.mockResolvedValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const body = registry.get(url);
    return {
      status: body ? 200 : 404,
      ok: Boolean(body),
      headers: new Headers(),
      text: async () => body ?? 'not found',
    };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importOpml', () => {
  const GOOD1 = 'https://good1.example.com/feed';
  const GOOD2 = 'https://good2.example.com/feed';
  const BAD = 'https://bad.example.com/feed';

  const opml = `<?xml version="1.0"?>
<opml version="2.0"><head><title>t</title></head><body>
  <outline text="Good1" type="rss" xmlUrl="${GOOD1}"/>
  <outline text="Good2" type="rss" xmlUrl="${GOOD2}"/>
  <outline text="Bad" type="rss" xmlUrl="${BAD}"/>
</body></opml>`;

  it('subscribes all feeds, tolerating individual failures and duplicates', async () => {
    registry.set(GOOD1, fixture('rss2.xml'));
    registry.set(GOOD2, fixture('atom.xml'));
    // BAD is not registered → 404 → failure.
    // Pre-subscribe GOOD1 so the import sees it as a duplicate.
    await subscribe(GOOD1);

    const result = await importOpml(opml);

    expect(result.added.map((r) => r.feed.id)).toEqual([GOOD2]);
    expect(result.skippedDuplicates.map((e) => e.url)).toEqual([GOOD1]);
    expect(result.failed.map((f) => f.entry.url)).toEqual([BAD]);
    expect(result.failed[0].message).toContain('404');
  });
});
