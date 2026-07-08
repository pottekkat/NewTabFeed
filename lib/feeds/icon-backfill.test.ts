import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { resetIndexedDB } from '@/tests/idb';
import { upsertFeed, getFeed } from '@/lib/db';
import type { Feed } from '@/lib/types';
import { backfillFeedIcons } from '@/lib/feeds/icon-backfill';

// Mock only the icon resolver; it does network work we don't want in unit tests.
const resolveAndCacheIconMock = vi.fn();
vi.mock('@/lib/feeds/favicon', () => ({
  resolveAndCacheIcon: (...args: unknown[]) => resolveAndCacheIconMock(...args),
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

function feed(id = 'f', overrides: Partial<Feed> = {}): Feed {
  return {
    id,
    url: id,
    title: 'F',
    addedAt: 1000,
    error: null,
    siteUrl: `https://${id}.example.com`,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetIndexedDB();
  fakeBrowser.reset();
  hasAccess.mockResolvedValue(true);
  resolveAndCacheIconMock.mockReset();
  resolveAndCacheIconMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('backfillFeedIcons', () => {
  it('skips feeds that already have a cached data: icon', async () => {
    await upsertFeed(feed('a', { iconUrl: 'data:image/png;base64,AAAA' }));

    const result = await backfillFeedIcons();
    expect(result).toEqual({ changed: false });
    expect(resolveAndCacheIconMock).not.toHaveBeenCalled();
  });

  it('resolves and persists a data: icon for a feed missing one', async () => {
    await upsertFeed(feed('a', { iconUrl: undefined }));
    resolveAndCacheIconMock.mockResolvedValue('data:image/png;base64,ICON');

    const result = await backfillFeedIcons();
    expect(result).toEqual({ changed: true });
    expect(resolveAndCacheIconMock).toHaveBeenCalledWith({
      siteUrl: 'https://a.example.com',
      feedIconUrl: undefined,
    });

    const stored = await getFeed('a');
    expect(stored?.iconUrl).toBe('data:image/png;base64,ICON');
  });

  it('re-resolves a feed whose iconUrl is a remote (non-data) URL', async () => {
    await upsertFeed(feed('a', { iconUrl: 'https://a.example.com/fav.ico' }));
    resolveAndCacheIconMock.mockResolvedValue('data:image/png;base64,ICON');

    const result = await backfillFeedIcons();
    expect(result).toEqual({ changed: true });

    const stored = await getFeed('a');
    expect(stored?.iconUrl).toBe('data:image/png;base64,ICON');
  });

  it('leaves the feed unchanged when nothing resolves (changed:false)', async () => {
    await upsertFeed(feed('a', { iconUrl: undefined }));
    resolveAndCacheIconMock.mockResolvedValue(undefined);

    const result = await backfillFeedIcons();
    expect(result).toEqual({ changed: false });

    const stored = await getFeed('a');
    expect(stored?.iconUrl).toBeUndefined();
  });

  it('respects the maxFeeds cap', async () => {
    await upsertFeed(feed('a', { addedAt: 1 }));
    await upsertFeed(feed('b', { addedAt: 2 }));
    await upsertFeed(feed('c', { addedAt: 3 }));
    await upsertFeed(feed('d', { addedAt: 4 }));

    await backfillFeedIcons({ maxFeeds: 2 });
    expect(resolveAndCacheIconMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing (changed:false) when host access is missing', async () => {
    hasAccess.mockResolvedValue(false);
    await upsertFeed(feed('a', { iconUrl: undefined }));

    const result = await backfillFeedIcons();
    expect(result).toEqual({ changed: false });
    expect(resolveAndCacheIconMock).not.toHaveBeenCalled();
  });

  it('does not abort the pass when a single resolution throws', async () => {
    await upsertFeed(feed('a', { addedAt: 1 }));
    await upsertFeed(feed('b', { addedAt: 2 }));
    resolveAndCacheIconMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('data:image/png;base64,OK');

    const result = await backfillFeedIcons({ concurrency: 1 });
    expect(result).toEqual({ changed: true });

    // The first feed's throw did not stop the second from resolving/persisting.
    const stored = await getFeed('b');
    expect(stored?.iconUrl).toBe('data:image/png;base64,OK');
  });
});
