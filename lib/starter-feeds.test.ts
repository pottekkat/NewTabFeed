import { describe, it, expect } from 'vitest';
import { STARTER_FEEDS } from '@/lib/starter-feeds';
import { canonicalizeUrl } from '@/lib/url';

describe('STARTER_FEEDS', () => {
  it('has a healthy-sized curated list', () => {
    expect(STARTER_FEEDS.length).toBeGreaterThanOrEqual(8);
  });

  it('every entry is well-formed', () => {
    for (const feed of STARTER_FEEDS) {
      expect(feed.name).toBeTruthy();
      expect(feed.description).toBeTruthy();
      expect(['Technology', 'General']).toContain(feed.category);
      // URLs must be absolute https and survive canonicalization unchanged.
      expect(feed.feedUrl).toMatch(/^https:\/\//);
      expect(feed.siteUrl).toMatch(/^https:\/\//);
      expect(canonicalizeUrl(feed.feedUrl)).toBe(feed.feedUrl);
    }
  });

  it('has no duplicate feed URLs', () => {
    const urls = STARTER_FEEDS.map((f) => f.feedUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
