import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { resetIndexedDB } from '@/tests/idb';
import { upsertFeed, upsertItems, listItems } from '@/lib/db';
import { fetchLinkPreviews } from '@/lib/settings';
import type { Feed, FeedItem } from '@/lib/types';
import { enrichPendingPreviews } from '@/lib/feeds/enrich';

// Mock only the network entry point; keep summaryIsThin/extractPreview real,
// since the db layer imports summaryIsThin from the same module.
const fetchLinkPreviewMock = vi.fn();
vi.mock('@/lib/feeds/link-preview', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/feeds/link-preview')>();
  return {
    ...actual,
    fetchLinkPreview: (...args: unknown[]) => fetchLinkPreviewMock(...args),
  };
});

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

function feed(id = 'f'): Feed {
  return { id, url: id, title: 'F', addedAt: 1000, error: null };
}

function item(id: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    feedId: 'f',
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: Number(id.replace(/\D/g, '')) || 1,
    read: false,
    fetchedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetIndexedDB();
  fakeBrowser.reset();
  hasAccess.mockResolvedValue(true);
  fetchLinkPreviewMock.mockReset();
  fetchLinkPreviewMock.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enrichPendingPreviews', () => {
  it('does nothing when the feature is toggled off', async () => {
    await fetchLinkPreviews.setValue(false);
    await upsertFeed(feed());
    await upsertItems([item('1')]); // no thumbnail → would be a candidate

    const result = await enrichPendingPreviews();
    expect(result).toEqual({ changed: false });
    expect(fetchLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('does nothing (changed:false) when host access is missing', async () => {
    hasAccess.mockResolvedValue(false);
    await upsertFeed(feed());
    await upsertItems([item('1')]);

    const result = await enrichPendingPreviews();
    expect(result).toEqual({ changed: false });
    expect(fetchLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('fills a missing thumbnail and summary and returns changed:true', async () => {
    await upsertFeed(feed());
    await upsertItems([item('1', { summaryHtml: '<a href="#">Comments</a>' })]);
    fetchLinkPreviewMock.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/c.jpg',
      description: 'A rich enriched excerpt worth showing to the reader.',
    });

    const result = await enrichPendingPreviews();
    expect(result).toEqual({ changed: true });

    const stored = (await listItems())[0];
    expect(stored.thumbnailUrl).toBe('https://cdn.example.com/c.jpg');
    expect(stored.summaryHtml).toBe(
      'A rich enriched excerpt worth showing to the reader.',
    );
    expect(stored.previewFetchedAt).toBeGreaterThan(0);
  });

  it('marks an item attempted even when nothing is found (changed:false)', async () => {
    await upsertFeed(feed());
    await upsertItems([item('1')]);
    fetchLinkPreviewMock.mockResolvedValue({});

    const result = await enrichPendingPreviews();
    expect(result).toEqual({ changed: false });

    const stored = (await listItems())[0];
    expect(stored.previewFetchedAt).toBeGreaterThan(0);
    expect(stored.thumbnailUrl).toBeUndefined();
  });

  it('does not re-fetch an item already marked previewFetchedAt', async () => {
    await upsertFeed(feed());
    await upsertItems([item('1', { previewFetchedAt: 123 })]);

    const result = await enrichPendingPreviews();
    expect(result).toEqual({ changed: false });
    expect(fetchLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('respects the maxItems cap', async () => {
    await upsertFeed(feed());
    await upsertItems([item('1'), item('2'), item('3'), item('4')]);

    await enrichPendingPreviews({ maxItems: 2 });
    expect(fetchLinkPreviewMock).toHaveBeenCalledTimes(2);
  });

  it('does not abort the pass when a single fetch fails', async () => {
    await upsertFeed(feed());
    await upsertItems([item('1'), item('2')]);
    fetchLinkPreviewMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ imageUrl: 'https://cdn.example.com/ok.jpg' });

    const result = await enrichPendingPreviews({ concurrency: 1 });
    expect(result).toEqual({ changed: true });
    // Both items were attempted (both stamped), despite one throwing.
    const stored = await listItems();
    expect(stored.every((i) => i.previewFetchedAt)).toBe(true);
  });
});
