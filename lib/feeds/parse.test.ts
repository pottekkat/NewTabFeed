import { describe, it, expect } from 'vitest';
import { parseFeed, parseDate } from '@/lib/feeds/parse';
import { fixture } from '@/tests/helpers';

describe('parseFeed—RSS 2.0', () => {
  const parsed = parseFeed(fixture('rss2.xml'));

  it('extracts feed metadata and decodes HTML entities in the title', () => {
    expect(parsed.feed.title).toBe('Gadgets & Gizmos');
    expect(parsed.feed.siteUrl).toBe('https://example.com');
    expect(parsed.feed.description).toBe('Reviews of things with buttons');
  });

  it('extracts the channel image as an absolute iconUrl', () => {
    // The fixture declares a relative <image><url>/logo.png</url>.
    expect(parsed.feed.iconUrl).toBe('https://example.com/logo.png');
  });

  it('decodes entities in item titles', () => {
    expect(parsed.items[0].title).toBe('The Best & Worst Keyboards of 2024');
  });

  it('uses guid for identity and prefers content:encoded for summary', () => {
    expect(parsed.items[0].guid).toBe(
      'tag:example.com,2024:/posts/keyboards-2024',
    );
    expect(parsed.items[0].summaryHtml).toContain('<strong>full</strong>');
  });

  it('extracts a media:thumbnail', () => {
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://cdn.example.com/keyboards-thumb.jpg',
    );
  });

  it('falls back to an image enclosure for the thumbnail', () => {
    // Second item has no media:*, only an image/png enclosure.
    expect(parsed.items[1].thumbnailUrl).toBe(
      'https://cdn.example.com/mouse-hero.png',
    );
  });

  it('parses publish dates to epoch ms', () => {
    expect(parsed.items[0].publishedAt).toBe(
      Date.parse('Wed, 02 Oct 2024 13:00:00 GMT'),
    );
  });

  it('records the newest item date as lastPublishedAt', () => {
    expect(parsed.feed.lastPublishedAt).toBe(parsed.items[0].publishedAt);
  });
});

describe('parseFeed—Atom 1.0', () => {
  const parsed = parseFeed(fixture('atom.xml'));

  it('resolves the alternate link as the site URL', () => {
    expect(parsed.feed.siteUrl).toBe('https://blog.example.org/');
  });

  it('prefers <icon> over <logo> and resolves it to an absolute iconUrl', () => {
    expect(parsed.feed.iconUrl).toBe('https://blog.example.org/favicon.ico');
  });

  it('uses the entry id as guid and the alternate link as url', () => {
    expect(parsed.items[0].guid).toBe(
      'urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a',
    );
    expect(parsed.items[0].url).toBe(
      'https://blog.example.org/compilers-and-coffee',
    );
  });

  it('decodes escaped HTML content', () => {
    expect(parsed.items[0].summaryHtml).toBe(
      '<p>The <em>long</em> version.</p>',
    );
  });

  it('falls back to updated when published is missing', () => {
    expect(parsed.items[1].publishedAt).toBe(
      Date.parse('2024-10-01T12:00:00Z'),
    );
  });

  it('reads the media:thumbnail', () => {
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://blog.example.org/img/compilers.jpg',
    );
  });
});

describe('parseFeed—RDF / RSS 1.0', () => {
  const parsed = parseFeed(fixture('rdf.xml'));

  it('extracts dc:date and dc:creator', () => {
    expect(parsed.items[0].author).toBe('Douglas Adams');
    expect(parsed.items[0].publishedAt).toBe(
      Date.parse('2024-09-15T08:00:00Z'),
    );
  });

  it('prefers content:encoded for the summary', () => {
    expect(parsed.items[0].summaryHtml).toContain('<b>emphasis</b>');
  });
});

describe('parseFeed—JSON Feed 1.1', () => {
  const parsed = parseFeed(fixture('jsonfeed.json'));

  it('reads home_page_url as the site URL', () => {
    expect(parsed.feed.siteUrl).toBe('https://json.example.com/');
  });

  it('prefers icon over favicon for iconUrl', () => {
    expect(parsed.feed.iconUrl).toBe('https://json.example.com/icon-512.png');
  });

  it('uses content_html and the item image', () => {
    expect(parsed.items[0].summaryHtml).toBe(
      '<p>Structured <em>and</em> simple.</p>',
    );
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://json.example.com/img/hello.png',
    );
  });

  it('falls back to content_text and an image attachment', () => {
    expect(parsed.items[1].summaryHtml).toBe('Plain text only.');
    expect(parsed.items[1].thumbnailUrl).toBe(
      'https://json.example.com/img/second.jpg',
    );
  });
});

describe('parseFeed—identity and edge cases', () => {
  it('guid identity is stable when guid differs from link', () => {
    // First rss2 item: guid (tag:) is not the link, so re-runs must keep the guid.
    const a = parseFeed(fixture('rss2.xml')).items[0].guid;
    const b = parseFeed(fixture('rss2.xml')).items[0].guid;
    expect(a).toBe(b);
    expect(a).not.toBe('https://example.com/posts/keyboards-2024');
  });

  it('leaves publishedAt undefined when dates are missing or garbage', () => {
    const parsed = parseFeed(fixture('missing-dates.xml'));
    expect(parsed.items[0].publishedAt).toBeUndefined();
    expect(parsed.items[1].publishedAt).toBeUndefined();
    expect(parsed.feed.lastPublishedAt).toBeUndefined();
  });

  it('resolves relative item and thumbnail URLs against the channel link', () => {
    const parsed = parseFeed(fixture('relative-urls.xml'));
    expect(parsed.items[0].url).toBe(
      'https://relative.example.com/blog/relative-post',
    );
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://relative.example.com/images/relative-thumb.jpg',
    );
    expect(parsed.items[1].url).toBe(
      'https://relative.example.com/blog/second-post',
    );
  });

  it('throws on malformed XML', () => {
    expect(() => parseFeed(fixture('malformed.xml'))).toThrow();
  });
});

describe('parseFeed—inline content-image fallback', () => {
  it('RSS: uses the first content <img> when no structured thumbnail exists', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Inline Images</title>
          <link>https://blog.test</link>
          <item>
            <title>Post</title>
            <link>https://blog.test/posts/one</link>
            <guid>https://blog.test/posts/one</guid>
            <content:encoded><![CDATA[<p>Hi</p><img src="/img/cover.jpg">]]></content:encoded>
          </item>
        </channel>
      </rss>`;
    const parsed = parseFeed(xml);
    // Relative content-img src resolves to an absolute URL on the item's origin.
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://blog.test/img/cover.jpg',
    );
  });

  it('RSS: a structured media:thumbnail wins over a content <img>', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"
           xmlns:content="http://purl.org/rss/1.0/modules/content/"
           xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Precedence</title>
          <link>https://blog.test</link>
          <item>
            <title>Post</title>
            <link>https://blog.test/posts/one</link>
            <guid>https://blog.test/posts/one</guid>
            <media:thumbnail url="https://cdn.test/structured.jpg"/>
            <content:encoded><![CDATA[<img src="https://cdn.test/inline.jpg">]]></content:encoded>
          </item>
        </channel>
      </rss>`;
    const parsed = parseFeed(xml);
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://cdn.test/structured.jpg',
    );
  });

  it('Atom: uses the first content <img> when no structured thumbnail exists', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Inline Atom</title>
        <link href="https://notes.test/"/>
        <entry>
          <title>Entry</title>
          <id>urn:uuid:inline-1</id>
          <link href="https://notes.test/entry/1"/>
          <content type="html">&lt;p&gt;Body&lt;/p&gt;&lt;img src="/media/pic.png"&gt;</content>
        </entry>
      </feed>`;
    const parsed = parseFeed(xml);
    expect(parsed.items[0].thumbnailUrl).toBe(
      'https://notes.test/media/pic.png',
    );
  });
});

describe('parseDate', () => {
  it('parses RFC-822 dates', () => {
    expect(parseDate('Wed, 02 Oct 2024 13:00:00 GMT')).toBe(
      Date.parse('2024-10-02T13:00:00Z'),
    );
  });
  it('parses ISO-8601 dates', () => {
    expect(parseDate('2024-10-02T13:00:00Z')).toBe(
      Date.parse('2024-10-02T13:00:00Z'),
    );
  });
  it('returns undefined for garbage and empty input', () => {
    expect(parseDate('not a date')).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
  });
});
