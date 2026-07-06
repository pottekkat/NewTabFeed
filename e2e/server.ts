// A tiny local HTTP server that stands in for real feed sites during e2e.
//
// The extension's service worker fetches feeds over the network (host access is
// granted at install by the WXT_E2E build), so the suite needs a real origin to
// fetch from. This server serves a valid RSS 2.0 feed, an Atom feed, HTML pages
// with and without an advertised feed, and — because probing looks at
// conventional locations — the same feed at `/rss` and `/rss.xml`.
//
// Feed item links point back at this origin so clicking a card navigates to a
// page that actually loads (a 200) instead of a real external site.
//
// The served RSS body is mutable via `setRss` so the refresh spec can add an
// item mid-test and assert it shows up.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureServer {
  /** Base origin, e.g. `http://localhost:54321` (no trailing slash). */
  url: string;
  /** Replace the body served at `/rss.xml` and `/rss`. */
  setRss(xml: string): void;
  close(): Promise<void>;
}

/** Fixed epoch so item ordering is deterministic across runs. */
const BASE_TIME = Date.UTC(2024, 0, 1, 12, 0, 0);

/**
 * A valid 1×1 PNG served at `/cover.png`. The cover-image e2e needs the card's
 * `<img>` to actually load — a failed load trips the card's onError and falls
 * back to the placeholder, which would defeat the "real cover" assertions.
 */
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Build an RSS 2.0 document with `count` items (ids 0..count-1). Higher ids are
 * newer, so item `count-1` sorts to the top of the timeline. Item links point at
 * `${base}/posts/<id>` on this same origin.
 */
export function makeRss(base: string, count: number): string {
  const items = Array.from({ length: count }, (_, i) => {
    const pub = new Date(BASE_TIME + i * 60_000).toUTCString();
    return `    <item>
      <title>E2E Item ${i}</title>
      <link>${base}/posts/${i}</link>
      <guid isPermaLink="false">e2e-item-${i}</guid>
      <pubDate>${pub}</pubDate>
      <description>Body of end-to-end item number ${i}.</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>E2E Fixture Feed</title>
    <link>${base}</link>
    <description>A local feed used by NewTabFeed's end-to-end tests.</description>
${items}
  </channel>
</rss>`;
}

/** A small Atom feed served at `/atom.xml`, for OPML/import coverage. */
function makeAtom(base: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>E2E Atom Fixture</title>
  <link href="${base}/" rel="alternate"/>
  <link href="${base}/atom.xml" rel="self"/>
  <id>${base}/atom</id>
  <updated>2024-01-01T12:00:00Z</updated>
  <entry>
    <title>Atom Entry One</title>
    <link href="${base}/posts/atom-1" rel="alternate"/>
    <id>e2e-atom-1</id>
    <published>2024-01-01T11:00:00Z</published>
    <updated>2024-01-01T11:00:00Z</updated>
    <summary>First atom entry.</summary>
  </entry>
</feed>`;
}

/**
 * An RSS 2.0 feed exercising the cover-image + excerpt pipeline, served at
 * `/rich.xml`. Its four items cover each distinct outcome the newtab card can
 * render: a real cover pulled from an inline content `<img>`, a real cover from a
 * structured `media:thumbnail`, a generated placeholder with the body suppressed
 * (link-only aggregator), and a generated placeholder with a visible excerpt
 * (plain prose, no image). `pubDate`s descend so the items sort newest-first in
 * the order listed (item 1 newest). Links point at `${base}/posts/<n>` (served
 * as 200 HTML) so card navigation succeeds.
 */
export function makeRichRss(base: string): string {
  const pub = (i: number) => new Date(BASE_TIME - i * 60_000).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>E2E Rich Fixture Feed</title>
    <link>${base}</link>
    <description>Feed exercising cover images, placeholders, and excerpts.</description>
    <item>
      <title>Inline image cover</title>
      <link>${base}/posts/1</link>
      <guid isPermaLink="false">e2e-rich-1</guid>
      <pubDate>${pub(1)}</pubDate>
      <description><![CDATA[<p>This post embeds its cover inline in the body text.</p><img src="${base}/cover.png" alt="" />]]></description>
    </item>
    <item>
      <title>Structured media cover</title>
      <link>${base}/posts/2</link>
      <guid isPermaLink="false">e2e-rich-2</guid>
      <pubDate>${pub(2)}</pubDate>
      <media:thumbnail url="${base}/cover.png"/>
      <description>Structured thumbnail body, plain prose here.</description>
    </item>
    <item>
      <title>Link-only aggregator</title>
      <link>${base}/posts/3</link>
      <guid isPermaLink="false">e2e-rich-3</guid>
      <pubDate>${pub(3)}</pubDate>
      <description><![CDATA[<a href="${base}/posts/3">Comments</a>]]></description>
    </item>
    <item>
      <title>Plain text no image</title>
      <link>${base}/posts/4</link>
      <guid isPermaLink="false">e2e-rich-4</guid>
      <pubDate>${pub(4)}</pubDate>
      <description>Just readable prose, and no image at all in this one.</description>
    </item>
  </channel>
</rss>`;
}

function pageWithFeed(base: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Page With Feed</title>
    <link rel="alternate" type="application/rss+xml" title="E2E Fixture Feed" href="${base}/rss.xml" />
  </head>
  <body><h1>A page that advertises a feed</h1></body>
</html>`;
}

const PAGE_PLAIN = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Plain Page</title></head>
  <body><h1>A page with no feed link</h1></body>
</html>`;

/** Start a fixture server on an ephemeral port. Resolves once it is listening. */
export async function startFixtureServer(): Promise<FixtureServer> {
  let rssBody = '';
  let atomBody = '';

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };

    switch (path) {
      case '/rss.xml':
      case '/rss':
        return send(200, 'application/rss+xml; charset=utf-8', rssBody);
      case '/rich.xml':
        return send(
          200,
          'application/rss+xml; charset=utf-8',
          makeRichRss(base),
        );
      case '/atom.xml':
        return send(200, 'application/atom+xml; charset=utf-8', atomBody);
      case '/cover.png':
        // A real binary image so the card's cover <img> actually loads (the
        // string-only `send` helper can't carry a Buffer body).
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(COVER_PNG);
        return;
      case '/page-with-feed.html':
        return send(200, 'text/html; charset=utf-8', pageWithFeed(base));
      case '/page-plain.html':
        return send(200, 'text/html; charset=utf-8', PAGE_PLAIN);
      default:
        // Item links (`/posts/*`) and unmatched well-known probe paths land
        // here. Returning a 200 HTML page lets card navigation succeed; probes
        // that hit it are rejected by the parser (it isn't a feed), so the probe
        // safely moves on to `/rss`.
        return send(
          200,
          'text/html; charset=utf-8',
          `<!doctype html><title>Item</title><h1>Item page</h1>`,
        );
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://localhost:${port}`;
  rssBody = makeRss(base, 10);
  atomBody = makeAtom(base);

  return {
    url: base,
    setRss(xml: string) {
      rssBody = xml;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        // Destroy keep-alive sockets first; otherwise `close` waits for the
        // browser's idle connections and stalls test teardown.
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
