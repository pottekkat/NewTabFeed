import { describe, it, expect } from 'vitest';
import {
  scanForFeeds,
  type DocumentLike,
  type LinkLike,
} from '@/lib/discovery/scan';

// A minimal document stand-in: no jsdom. `querySelectorAll` emulates the real
// `link[rel~="alternate"], link[rel~="feed"]` pre-filter so the scan sees only
// what a browser would hand it.
function makeDoc(links: Record<string, string | null>[]): DocumentLike {
  const elements: LinkLike[] = links.map((attrs) => ({
    getAttribute: (name: string) => attrs[name] ?? null,
  }));
  return {
    querySelectorAll() {
      return elements.filter((el) => {
        const rel = (el.getAttribute('rel') ?? '').split(/\s+/);
        return rel.includes('alternate') || rel.includes('feed');
      });
    },
  };
}

const PAGE = 'https://example.com/blog/post';

describe('scanForFeeds', () => {
  it('filters to feed MIME types and maps each to a kind', () => {
    const doc = makeDoc([
      { rel: 'alternate', type: 'application/rss+xml', href: '/rss.xml' },
      { rel: 'alternate', type: 'application/atom+xml', href: '/atom.xml' },
      { rel: 'alternate', type: 'application/feed+json', href: '/feed.json' },
      // Non-feed alternates and stylesheets must be ignored.
      { rel: 'alternate', type: 'text/html', href: '/amp' },
      { rel: 'stylesheet', type: 'text/css', href: '/style.css' },
    ]);
    const feeds = scanForFeeds(doc, PAGE);
    expect(feeds.map((f) => f.kind)).toEqual(['rss', 'atom', 'json']);
  });

  it('resolves relative hrefs against the page URL', () => {
    const doc = makeDoc([
      { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' },
    ]);
    const [feed] = scanForFeeds(doc, PAGE);
    expect(feed.url).toBe('https://example.com/feed.xml');
  });

  it('keeps absolute hrefs as-is', () => {
    const doc = makeDoc([
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        href: 'https://feeds.example.org/main.xml',
      },
    ]);
    const [feed] = scanForFeeds(doc, PAGE);
    expect(feed.url).toBe('https://feeds.example.org/main.xml');
  });

  it('dedupes feeds that resolve to the same URL', () => {
    const doc = makeDoc([
      { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' },
      { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' },
    ]);
    expect(scanForFeeds(doc, PAGE)).toHaveLength(1);
  });

  it('extracts the link title when present', () => {
    const doc = makeDoc([
      {
        rel: 'alternate',
        type: 'application/rss+xml',
        href: '/feed.xml',
        title: 'Example Blog RSS',
      },
    ]);
    expect(scanForFeeds(doc, PAGE)[0].title).toBe('Example Blog RSS');
  });

  it('accepts application/json only with a feed-ish hint', () => {
    const doc = makeDoc([
      // No hint → ignored (could be any JSON alternate).
      { rel: 'alternate', type: 'application/json', href: '/data' },
      // Href hints a feed → accepted as JSON feed.
      { rel: 'alternate', type: 'application/json', href: '/feed' },
    ]);
    const feeds = scanForFeeds(doc, PAGE);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe('https://example.com/feed');
    expect(feeds[0].kind).toBe('json');
  });

  it('skips links with no resolvable href', () => {
    const doc = makeDoc([
      { rel: 'alternate', type: 'application/rss+xml', href: null },
    ]);
    expect(scanForFeeds(doc, PAGE)).toEqual([]);
  });

  it('marks every result with source "link-tag"', () => {
    const doc = makeDoc([
      { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' },
    ]);
    expect(scanForFeeds(doc, PAGE)[0].source).toBe('link-tag');
  });
});
