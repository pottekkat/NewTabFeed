import { describe, it, expect } from 'vitest';
import type { FeedItem } from '@/lib/types';
import { countNewItems, mergeItems, nextCursor } from './merge-items';

function item(id: string, publishedAt: number, read = false): FeedItem {
  return {
    id,
    feedId: 'f1',
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    publishedAt,
    read,
    fetchedAt: publishedAt,
  };
}

describe('nextCursor', () => {
  it('is undefined for an empty list', () => {
    expect(nextCursor([])).toBeUndefined();
  });

  it('returns the last (oldest) item publishedAt', () => {
    const items = [item('a', 300), item('b', 200), item('c', 100)];
    expect(nextCursor(items)).toBe(100);
  });
});

describe('countNewItems', () => {
  it('counts incoming ids not already present', () => {
    const existing = [item('a', 300), item('b', 200)];
    const incoming = [item('c', 400), item('a', 300), item('d', 350)];
    expect(countNewItems(existing, incoming)).toBe(2); // c and d
  });

  it('is zero when nothing is new', () => {
    const existing = [item('a', 300)];
    expect(countNewItems(existing, [item('a', 300)])).toBe(0);
  });
});

describe('mergeItems', () => {
  it('dedupes by id and sorts newest-first', () => {
    const existing = [item('a', 300), item('b', 200)];
    const incoming = [item('c', 400), item('a', 300)];
    const merged = mergeItems(existing, incoming);
    expect(merged.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('lets the incoming copy win on conflict (fresher read state)', () => {
    const existing = [item('a', 300, false)];
    const incoming = [item('a', 300, true)];
    const merged = mergeItems(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].read).toBe(true);
  });

  it('preserves older items the fresh page did not cover', () => {
    const existing = [item('a', 300), item('b', 200), item('c', 100)];
    const incoming = [item('new', 400), item('a', 300)];
    const merged = mergeItems(existing, incoming);
    expect(merged.map((i) => i.id)).toEqual(['new', 'a', 'b', 'c']);
  });
});
