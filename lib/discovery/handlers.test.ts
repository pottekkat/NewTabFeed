import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { resetIndexedDB } from '@/tests/idb';
import { dispatch } from '@/lib/message-handler';
import { recordDiscoveredFeeds } from '@/lib/discovery/session';
import { listFeeds } from '@/lib/db';
import { canonicalizeUrl } from '@/lib/url';
import type { DiscoveredFeed } from '@/lib/discovery/types';

// Same host-access control pattern as message-handler.test.ts.
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
  fakeBrowser.reset();
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

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title><item><title>Hi</title><link>https://blog.example.com/hi</link></item></channel></rss>`;

describe('dispatch — get-discovered', () => {
  it('returns the feeds a content script recorded for the tab', async () => {
    const feeds: DiscoveredFeed[] = [
      {
        url: 'https://blog.example.com/feed.xml',
        kind: 'rss',
        source: 'link-tag',
      },
    ];
    await recordDiscoveredFeeds(42, feeds);

    const res = await dispatch({ type: 'get-discovered', tabId: 42 });
    expect(res).toEqual({ ok: true, data: { feeds } });
  });

  it('returns an empty list for a tab with nothing recorded', async () => {
    const res = await dispatch({ type: 'get-discovered', tabId: 1 });
    expect(res).toEqual({ ok: true, data: { feeds: [] } });
  });
});

describe('dispatch — probe-origin', () => {
  it('returns parse-validated feeds from well-known paths', async () => {
    registry.set('https://blog.example.com/rss', RSS);
    const res = await dispatch({
      type: 'probe-origin',
      origin: 'https://blog.example.com',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.feeds).toEqual([
        expect.objectContaining({
          url: 'https://blog.example.com/rss',
          kind: 'rss',
          source: 'probe',
        }),
      ]);
    }
  });

  it('surfaces a NoHostPermissionError when access is missing', async () => {
    hasAccess.mockResolvedValue(false);
    const res = await dispatch({
      type: 'probe-origin',
      origin: 'https://blog.example.com',
    });
    expect(res).toMatchObject({
      ok: false,
      errorName: 'NoHostPermissionError',
    });
  });
});

// The popup marks a discovered feed "Subscribed" by comparing its canonicalized
// URL to stored feed ids. This guards that alignment: a subscribed feed's id
// equals the canonical form of the URL discovery would surface.
describe('subscribed-state key alignment', () => {
  it('a subscribed feed id matches the canonicalized discovered URL', async () => {
    const discoveredUrl = 'https://blog.example.com/rss';
    registry.set(canonicalizeUrl(discoveredUrl), RSS);

    const sub = await dispatch({ type: 'subscribe', url: discoveredUrl });
    expect(sub.ok).toBe(true);

    const feeds = await listFeeds();
    expect(feeds.map((f) => f.id)).toContain(canonicalizeUrl(discoveredUrl));
  });
});
