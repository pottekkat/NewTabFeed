import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { resetIndexedDB } from '@/tests/idb';
import { fixture } from '@/tests/helpers';
import { dispatch } from '@/lib/message-handler';
import { listFeeds } from '@/lib/db';

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

const FEED_URL = 'https://feed.example.com/feed';

describe('dispatch — subscribe', () => {
  it('subscribes and broadcasts feeds-updated', async () => {
    registry.set(FEED_URL, fixture('rss2.xml'));
    const broadcast = vi.spyOn(browser.runtime, 'sendMessage');

    const res = await dispatch({ type: 'subscribe', url: FEED_URL });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.feed.id).toBe(FEED_URL);
    }
    expect(await listFeeds()).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith({ type: 'feeds-updated' });
  });

  it('returns a structured error (not a throw) on failure', async () => {
    registry.set(FEED_URL, fixture('rss2.xml'));
    await dispatch({ type: 'subscribe', url: FEED_URL });
    const res = await dispatch({ type: 'subscribe', url: FEED_URL });
    expect(res).toMatchObject({
      ok: false,
      errorName: 'AlreadySubscribedError',
    });
  });

  it('surfaces NoHostPermissionError distinguishably', async () => {
    hasAccess.mockResolvedValue(false);
    registry.set(FEED_URL, fixture('rss2.xml'));
    const res = await dispatch({ type: 'subscribe', url: FEED_URL });
    expect(res).toMatchObject({
      ok: false,
      errorName: 'NoHostPermissionError',
    });
  });
});

describe('dispatch — unsubscribe', () => {
  it('removes a feed', async () => {
    registry.set(FEED_URL, fixture('rss2.xml'));
    await dispatch({ type: 'subscribe', url: FEED_URL });
    const res = await dispatch({ type: 'unsubscribe', feedId: FEED_URL });
    expect(res).toMatchObject({ ok: true, data: { ok: true } });
    expect(await listFeeds()).toHaveLength(0);
  });
});

describe('dispatch — refresh-now', () => {
  it('reports whether anything changed', async () => {
    registry.set(FEED_URL, fixture('rss2.xml'));
    await dispatch({ type: 'subscribe', url: FEED_URL });
    // Force re-fetch of the same body → dedupe → nothing new.
    const res = await dispatch({ type: 'refresh-now', force: true });
    expect(res).toMatchObject({ ok: true, data: { changed: false } });
  });
});

describe('dispatch — OPML export/import', () => {
  it('exports subscribed feeds as OPML', async () => {
    registry.set(FEED_URL, fixture('rss2.xml'));
    await dispatch({ type: 'subscribe', url: FEED_URL });
    const res = await dispatch({ type: 'export-opml' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.xml).toContain(FEED_URL);
      expect(res.data.xml).toContain('NewTabFeed subscriptions');
    }
  });

  it('imports an OPML document', async () => {
    const other = 'https://other.example.com/feed';
    registry.set(other, fixture('atom.xml'));
    const opml = `<?xml version="1.0"?><opml version="2.0"><body>
      <outline text="Other" type="rss" xmlUrl="${other}"/>
    </body></opml>`;
    const res = await dispatch({ type: 'import-opml', xml: opml });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.added).toHaveLength(1);
    }
    expect(await listFeeds()).toHaveLength(1);
  });
});
