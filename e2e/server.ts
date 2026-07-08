// A tiny local HTTP server that stands in for real feed sites during e2e.
//
// The extension's service worker fetches feeds over the network (host access is
// granted at install by the WXT_E2E build), so the suite needs a real origin to
// fetch from. This server serves a valid RSS 2.0 feed, an Atom feed, HTML pages
// with and without an advertised feed, and—because probing looks at
// conventional locations—the same feed at `/rss` and `/rss.xml`.
//
// Feed item links point back at this origin so clicking a card navigates to a
// page that actually loads (a 200) instead of a real external site.
//
// The served RSS body is mutable via `setRss` so the refresh spec can add an
// item mid-test and assert it shows up.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';

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
 * `<img>` to actually load—a failed load trips the card's onError and falls
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

/**
 * An article page rich in Open Graph metadata, served at `/og-article`. The
 * link-preview enrichment pass fetches this page for feed items that lack a
 * cover and/or carry a thin description, mining `og:image` + `og:description`
 * from its <head>. `${base}/cover.png` is served as a real PNG so the enriched
 * cover <img> actually loads.
 */
function ogArticle(base: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>OG Article</title>
    <meta property="og:image" content="${base}/cover.png" />
    <meta property="og:description" content="A rich summary mined from the linked article page." />
  </head>
  <body><h1>The linked article</h1></body>
</html>`;
}

/**
 * An RSS 2.0 feed exercising the link-preview enrichment pass, served at
 * `/preview.xml`. Both items link at `${base}/og-article` (which advertises
 * og:image + og:description). "Needs preview" ships no cover and a link-only
 * (thin) body, so enrichment must fill both from the article page. "Has own
 * cover" already carries an inline image and real prose, so enrichment must
 * leave it untouched. Descending `pubDate`s keep ordering deterministic.
 */
export function makePreviewRss(base: string): string {
  const pub = (i: number) => new Date(BASE_TIME - i * 60_000).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>E2E Link Preview Feed</title>
    <link>${base}</link>
    <description>Feed exercising link-preview enrichment.</description>
    <item>
      <title>Needs preview</title>
      <link>${base}/og-article</link>
      <guid isPermaLink="false">e2e-preview-1</guid>
      <pubDate>${pub(1)}</pubDate>
      <description><![CDATA[<a href="${base}/og-article">Comments</a>]]></description>
    </item>
    <item>
      <title>Has own cover</title>
      <link>${base}/og-article</link>
      <guid isPermaLink="false">e2e-preview-2</guid>
      <pubDate>${pub(2)}</pubDate>
      <description><![CDATA[<p>Plenty of real prose here in the body, well over twenty-five characters.</p><img src="${base}/cover.png" alt="" />]]></description>
    </item>
  </channel>
</rss>`;
}

// --- Store-screenshot capture data -----------------------------------------
//
// The store screenshots need a grid that looks like a real reader: several
// sources, a mix of real cover images and generated placeholders, varied
// titles and short summaries, and recent timestamps. The plain `/rss.xml`
// fixture (ten identical items, no covers) is built for assertions, not looks,
// so capture uses its own richer feeds served under `/capture/*`. All of it is
// fixture data on this local origin—no real sites are ever fetched.

interface CaptureItem {
  title: string;
  summary: string;
  /** Cover image number under `/capture/cover/<n>.png`, or none for a placeholder. */
  cover?: number;
  /** How long ago the item was published, so relative times read as "2h ago". */
  minutesAgo: number;
}

interface CaptureFeed {
  /** Path the feed is served at, e.g. `/capture/signal.xml`. */
  path: string;
  title: string;
  /** Icon number under `/capture/icon/<n>.svg`. */
  icon: number;
  items: CaptureItem[];
}

export const CAPTURE_FEEDS: readonly CaptureFeed[] = [
  {
    path: '/capture/signal.xml',
    title: 'Signal',
    icon: 1,
    items: [
      {
        title: 'A small team shipped a browser in eighteen months',
        summary:
          'The engine is boring on purpose. The interesting part is how they said no to almost everything.',
        cover: 1,
        minutesAgo: 14,
      },
      {
        title: 'Local-first software, five years on',
        summary:
          'What held up, what did not, and why sync is still the hard part nobody wants to own.',
        cover: 2,
        minutesAgo: 96,
      },
      {
        title: 'Reading RSS in 2026 without a single server',
        summary:
          'Feeds never went away. The plumbing just got quieter, and now it fits in a new tab.',
        minutesAgo: 175,
      },
    ],
  },
  {
    path: '/capture/orbital.xml',
    title: 'Orbital Notes',
    icon: 2,
    items: [
      {
        title: 'The quietest place we have ever built',
        summary:
          'Inside an anechoic chamber, engineers listen to hardware the way a doctor listens to a heart.',
        cover: 3,
        minutesAgo: 38,
      },
      {
        title: 'A field guide to the winter sky',
        summary:
          'Four constellations, one planet, and the one meteor shower worth setting an alarm for.',
        cover: 4,
        minutesAgo: 210,
      },
      {
        title: 'Why the next telescope folds like origami',
        summary:
          'It has to fit in a rocket, then unfold in the cold with no one there to fix it.',
        minutesAgo: 320,
      },
    ],
  },
  {
    path: '/capture/foundry.xml',
    title: 'The Type Foundry',
    icon: 3,
    items: [
      {
        title: 'The comeback of the workhorse serif',
        summary:
          'For a decade everything went geometric and sans. Editors are quietly walking it back.',
        cover: 5,
        minutesAgo: 52,
      },
      {
        title: 'Designing an icon set that survives dark mode',
        summary:
          'One stroke width, two backgrounds, and a lot of squinting at 16 pixels.',
        cover: 6,
        minutesAgo: 132,
      },
      {
        title: 'Color, contrast, and the myth of pure black',
        summary:
          'Nobody reads long-form on #000. Here is the range that actually stays comfortable.',
        minutesAgo: 265,
      },
    ],
  },
  {
    path: '/capture/fieldguide.xml',
    title: 'Field Guide',
    icon: 4,
    items: [
      {
        title: 'How a city learned to plant for the heat',
        summary:
          'Species lists are getting rewritten street by street as summers stretch longer.',
        cover: 7,
        minutesAgo: 74,
      },
      {
        title: 'The slow return of the urban river',
        summary:
          'Concrete channels are coming up. Underneath, the water remembers where it used to go.',
        cover: 8,
        minutesAgo: 158,
      },
      {
        title: 'Notes from a week without notifications',
        summary:
          'Nothing broke. A few things got missed. Most of them did not matter.',
        minutesAgo: 402,
      },
    ],
  },
];

/** Build one capture feed as RSS 2.0, timestamps relative to now. */
export function makeCaptureFeed(base: string, feed: CaptureFeed): string {
  const items = feed.items
    .map((item) => {
      const pub = new Date(Date.now() - item.minutesAgo * 60_000).toUTCString();
      const link = `${base}/posts/${encodeURIComponent(item.title.slice(0, 24))}`;
      // A real cover rides inline in the body as a PNG (feedsmith lifts the
      // first content <img> into thumbnailUrl); items with no cover get a
      // generated placeholder.
      const body =
        item.cover === undefined
          ? item.summary
          : `<![CDATA[<p>${item.summary}</p><img src="${base}/capture/cover/${item.cover}.png" alt="" />]]>`;
      return `    <item>
      <title>${item.title}</title>
      <link>${link}</link>
      <guid isPermaLink="false">capture-${feed.icon}-${item.minutesAgo}</guid>
      <pubDate>${pub}</pubDate>
      <description>${body}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${feed.title}</title>
    <link>${base}</link>
    <description>NewTabFeed capture fixture: ${feed.title}.</description>
    <image>
      <url>${base}/capture/icon/${feed.icon}.svg</url>
      <title>${feed.title}</title>
      <link>${base}</link>
    </image>
${items}
  </channel>
</rss>`;
}

/** A soft two-stop gradient cover with a light geometric motif, 640×360. */
function captureCoverSvg(n: number): string {
  const hue = (n * 47) % 360;
  const hue2 = (hue + 40) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 62% 58%)" />
      <stop offset="1" stop-color="hsl(${hue2} 58% 46%)" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)" />
  <g fill="#ffffff" fill-opacity="0.12">
    <circle cx="512" cy="96" r="120" />
    <circle cx="120" cy="300" r="80" />
  </g>
  <g stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" fill="none">
    <path d="M0 260 L200 180 L400 240 L640 150" />
  </g>
</svg>`;
}

/** A small rounded-square source icon carrying a single letter, 32×32. */
function captureIconSvg(n: number): string {
  const hue = (n * 63) % 360;
  const letters = ['S', 'O', 'F', 'G'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="hsl(${hue} 60% 52%)" />
  <text x="16" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffff">${letters[(n - 1) % letters.length]}</text>
</svg>`;
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
  // Capture covers are rasterized once at startup: the card's cover extraction
  // rejects SVG srcs (they're often icons/spacers), so covers must be real PNGs.
  const coverPngs = new Map<number, Buffer>();

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };

    // Store-capture routes live outside the switch because covers/icons carry a
    // dynamic id in the path. Feeds match exactly against CAPTURE_FEEDS.
    if (path.startsWith('/capture/cover/')) {
      const n = Number(
        path.slice('/capture/cover/'.length).replace('.png', ''),
      );
      const png = coverPngs.get(n);
      if (!png) return send(404, 'text/plain', 'no such cover');
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
      return;
    }
    if (path.startsWith('/capture/icon/')) {
      const n = Number(path.slice('/capture/icon/'.length).replace('.svg', ''));
      return send(200, 'image/svg+xml; charset=utf-8', captureIconSvg(n));
    }
    const captureFeed = CAPTURE_FEEDS.find((f) => f.path === path);
    if (captureFeed) {
      return send(
        200,
        'application/rss+xml; charset=utf-8',
        makeCaptureFeed(base, captureFeed),
      );
    }

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
      case '/preview.xml':
        return send(
          200,
          'application/rss+xml; charset=utf-8',
          makePreviewRss(base),
        );
      case '/og-article':
        return send(200, 'text/html; charset=utf-8', ogArticle(base));
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

  // Rasterize every cover an item references, so `/capture/cover/<n>.png` can
  // serve real PNG bytes on demand.
  const coverNumbers = new Set(
    CAPTURE_FEEDS.flatMap((f) => f.items)
      .map((i) => i.cover)
      .filter((n): n is number => n !== undefined),
  );
  await Promise.all(
    [...coverNumbers].map(async (n) => {
      const png = await sharp(Buffer.from(captureCoverSvg(n)))
        .png()
        .toBuffer();
      coverPngs.set(n, png);
    }),
  );

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
