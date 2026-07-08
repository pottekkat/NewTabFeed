// Feed parsing + normalization.
//
// feedsmith is a pure-JS parser (no DOMParser), which is exactly why it can run
// in the MV3 service worker. `parseFeed` sniffs the format (RSS / Atom / RDF /
// JSON Feed) and returns a `{ format, feed }` union of deeply-partial shapes.
// This module flattens all four into our single `ParsedFeed` model so the rest
// of the app never has to branch on feed format again.

import { parseFeed as parseFeedDocument } from 'feedsmith';
import type { Atom, DeepPartial, Json, Rdf, Rss } from 'feedsmith/types';
import type { Feed, NormalizedItem, ParsedFeed } from '@/lib/types';
import { resolveUrl } from '@/lib/url';
import { firstContentImage } from '@/lib/feeds/content-image';

/** Newest N items to keep per parse. Feeds can be huge; the reader doesn't need history. */
const MAX_ITEMS_PER_PARSE = 100;

// The parser yields deeply-partial objects (every field may be missing), so all
// access below is defensive. These aliases keep the signatures readable.
type RssFeed = DeepPartial<Rss.Feed<string>>;
type AtomFeed = DeepPartial<Atom.Feed<string>>;
type RdfFeed = DeepPartial<Rdf.Feed<string>>;
type JsonFeed = DeepPartial<Json.Feed<string>>;
type MediaLike = NonNullable<DeepPartial<Rss.Item<string>>['media']>;

/**
 * Parse a raw feed document (XML or JSON text) and normalize it.
 *
 * Throws if the text isn't a recognizable feed, so callers (subscribe / refresh)
 * can treat a throw as "not a valid feed". Feed-level `id`/`url` are NOT set
 * here—the caller fills them from the URL it fetched.
 */
export function parseFeed(xmlOrJson: string): ParsedFeed {
  const parsed = parseFeedDocument(xmlOrJson, {
    maxItems: MAX_ITEMS_PER_PARSE,
  });
  switch (parsed.format) {
    case 'rss':
      return normalizeRss(parsed.feed);
    case 'atom':
      return normalizeAtom(parsed.feed);
    case 'rdf':
      return normalizeRdf(parsed.feed);
    case 'json':
      return normalizeJson(parsed.feed);
  }
}

/** Parse "Wed, 02 Oct 2024 13:00:00 GMT" / "2024-10-02T13:00:00Z" → epoch ms. */
export function parseDate(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Track the newest item date so the caller can update Feed.lastPublishedAt. */
function withLatest(feed: Partial<Feed>, items: NormalizedItem[]): ParsedFeed {
  let latest: number | undefined;
  for (const item of items) {
    if (
      item.publishedAt !== undefined &&
      (latest === undefined || item.publishedAt > latest)
    ) {
      latest = item.publishedAt;
    }
  }
  if (latest !== undefined) {
    feed.lastPublishedAt = latest;
  }
  return { feed, items };
}

/**
 * Pull a usable thumbnail out of a Media RSS (`media:*`) block. Tries, in order:
 * a direct `media:thumbnail`, a thumbnail on any `media:content`, then the URL
 * of the first image-typed `media:content`. Handles the deprecated `contents`
 * field, a single `media:group`, and the `groups` array form.
 */
function mediaThumbnail(media: MediaLike | undefined): string | undefined {
  if (!media) {
    return undefined;
  }
  if (media.thumbnails?.[0]?.url) {
    return media.thumbnails[0].url;
  }
  const contents = [
    ...(media.contents ?? []),
    ...(media.group?.contents ?? []),
    ...(media.groups?.flatMap((g) => g?.contents ?? []) ?? []),
  ];
  for (const c of contents) {
    if (c?.thumbnails?.[0]?.url) {
      return c.thumbnails[0].url;
    }
  }
  for (const c of contents) {
    if (c?.url && (c.medium === 'image' || c.type?.startsWith('image/'))) {
      return c.url;
    }
  }
  return undefined;
}

function isImageEnclosure(
  type: string | undefined,
  url: string | undefined,
): boolean {
  if (type?.startsWith('image/')) {
    return true;
  }
  return /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url ?? '');
}

function normalizeRss(feed: RssFeed): ParsedFeed {
  const siteUrl = feed.link;
  const items: NormalizedItem[] = [];
  for (const raw of feed.items ?? []) {
    const link = resolveUrl(raw.link, siteUrl);
    const guid = raw.guid?.value ?? raw.link ?? link;
    if (!guid) {
      continue; // No identity—can't dedupe it; skip.
    }
    const enclosureThumb = raw.enclosures?.find((e) =>
      isImageEnclosure(e?.type, e?.url),
    )?.url;
    const summaryHtml = raw.content?.encoded ?? raw.description;
    items.push({
      guid,
      title: raw.title ?? '(untitled)',
      url: link ?? siteUrl ?? '',
      publishedAt: parseDate(raw.pubDate ?? raw.dc?.dates?.[0] ?? raw.dc?.date),
      author: raw.authors?.[0] ?? raw.dc?.creators?.[0],
      summaryHtml,
      // Structured thumbnails win; fall back to the first inline content <img>.
      // Resolve against the item's own page first so relative srcs land on the
      // right origin, then the site URL.
      thumbnailUrl: resolveUrl(
        mediaThumbnail(raw.media) ??
          enclosureThumb ??
          raw.itunes?.image ??
          firstContentImage(summaryHtml),
        link ?? siteUrl,
      ),
    });
  }
  return withLatest(
    {
      title: feed.title,
      siteUrl,
      description: feed.description,
      iconUrl: resolveUrl(feed.image?.url, siteUrl),
    },
    items,
  );
}

/** Atom links carry a `rel`; the readable page is `rel="alternate"` (the default). */
function atomAlternate(
  links: Array<{ rel?: string; href?: string } | undefined> | undefined,
): string | undefined {
  if (!links) {
    return undefined;
  }
  const alt = links.find((l) => l?.rel === 'alternate' || l?.rel === undefined);
  return (alt ?? links.find((l) => l?.rel !== 'self'))?.href;
}

function normalizeAtom(feed: AtomFeed): ParsedFeed {
  const siteUrl = atomAlternate(feed.links);
  const items: NormalizedItem[] = [];
  for (const entry of feed.entries ?? []) {
    const link = resolveUrl(atomAlternate(entry.links), siteUrl);
    const guid = entry.id ?? link;
    if (!guid) {
      continue;
    }
    const enclosure = entry.links?.find(
      (l) => l?.rel === 'enclosure' && isImageEnclosure(l?.type, l?.href),
    )?.href;
    const summaryHtml = entry.content ?? entry.summary;
    items.push({
      guid,
      title: entry.title ?? '(untitled)',
      url: link ?? siteUrl ?? '',
      publishedAt: parseDate(entry.published ?? entry.updated),
      author: entry.authors?.[0]?.name,
      summaryHtml,
      // Structured thumbnails win; fall back to the first inline content <img>,
      // resolved against the entry's own page first, then the site URL.
      thumbnailUrl: resolveUrl(
        mediaThumbnail(entry.media) ??
          enclosure ??
          firstContentImage(summaryHtml),
        link ?? siteUrl,
      ),
    });
  }
  return withLatest(
    {
      title: feed.title,
      siteUrl,
      description: feed.subtitle,
      // `icon` is the small square icon (preferred); `logo` is the wider banner.
      iconUrl: resolveUrl(feed.icon ?? feed.logo, siteUrl),
    },
    items,
  );
}

function normalizeRdf(feed: RdfFeed): ParsedFeed {
  const siteUrl = feed.link;
  const items: NormalizedItem[] = [];
  for (const raw of feed.items ?? []) {
    const link = resolveUrl(raw.link, siteUrl);
    const guid = raw.rdf?.about ?? raw.link ?? link;
    if (!guid) {
      continue;
    }
    const summaryHtml = raw.content?.encoded ?? raw.description;
    items.push({
      guid,
      title: raw.title ?? '(untitled)',
      url: link ?? siteUrl ?? '',
      publishedAt: parseDate(raw.dc?.dates?.[0] ?? raw.dc?.date),
      author: raw.dc?.creators?.[0],
      summaryHtml,
      // Structured thumbnail wins; fall back to the first inline content <img>,
      // resolved against the item's own page first, then the site URL.
      thumbnailUrl: resolveUrl(
        mediaThumbnail(raw.media) ?? firstContentImage(summaryHtml),
        link ?? siteUrl,
      ),
    });
  }
  return withLatest(
    {
      title: feed.title,
      siteUrl,
      description: feed.description,
      iconUrl: resolveUrl(feed.image?.url, siteUrl),
    },
    items,
  );
}

function normalizeJson(feed: JsonFeed): ParsedFeed {
  const siteUrl = feed.home_page_url;
  const items: NormalizedItem[] = [];
  for (const raw of feed.items ?? []) {
    const url = resolveUrl(raw.url ?? raw.external_url, siteUrl);
    const guid = raw.id ?? raw.url ?? url;
    if (!guid) {
      continue;
    }
    const attachmentThumb = raw.attachments?.find((a) =>
      isImageEnclosure(a?.mime_type, a?.url),
    )?.url;
    const summaryHtml = raw.content_html ?? raw.summary ?? raw.content_text;
    items.push({
      guid,
      title: raw.title ?? '(untitled)',
      url: url ?? siteUrl ?? '',
      publishedAt: parseDate(raw.date_published ?? raw.date_modified),
      author: raw.authors?.[0]?.name,
      summaryHtml,
      // Structured images win; fall back to the first inline content <img>. Only
      // content_html carries markup—content_text won't, but firstContentImage
      // safely returns undefined for it. Resolve against the item's page first.
      thumbnailUrl: resolveUrl(
        raw.image ??
          raw.banner_image ??
          attachmentThumb ??
          firstContentImage(summaryHtml),
        url ?? siteUrl,
      ),
    });
  }
  return withLatest(
    {
      title: feed.title,
      siteUrl,
      description: feed.description,
      // JSON Feed's `icon` is the large icon; `favicon` the small one—either works.
      iconUrl: resolveUrl(feed.icon ?? feed.favicon, siteUrl),
    },
    items,
  );
}
