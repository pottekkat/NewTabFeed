// Link-tag feed autodiscovery — pure and DOM-library-free.
//
// The content script hands us the live `document`; tests hand us a minimal
// stand-in. We only touch `querySelectorAll` and, on each result,
// `getAttribute`, so both work without jsdom. NOTHING here fetches — scanning is
// read-only DOM inspection; the service worker does all network I/O.

import { resolveUrl, canonicalizeUrl } from '@/lib/url';
import type { DiscoveredFeed, FeedKind } from '@/lib/discovery/types';

/** The slice of an `HTMLLinkElement` we read. */
export interface LinkLike {
  getAttribute(name: string): string | null;
}

/** The slice of `Document` we read: a `querySelectorAll` returning `LinkLike`s. */
export interface DocumentLike {
  querySelectorAll(selector: string): ArrayLike<LinkLike> | Iterable<LinkLike>;
}

// `<link rel>` can list multiple space-separated tokens ("alternate home").
// We match feeds advertised as alternate representations (the autodiscovery
// convention) or with an explicit "feed" token.
const FEED_LINK_SELECTOR = 'link[rel~="alternate"], link[rel~="feed"]';

/** MIME types that unambiguously denote a feed, mapped to our kind. */
const TYPE_TO_KIND: Record<string, FeedKind> = {
  'application/rss+xml': 'rss',
  'application/atom+xml': 'atom',
  'application/feed+json': 'json',
  'application/json+feed': 'json',
};

/**
 * Scan a document's `<link>` tags for advertised feeds.
 *
 * - filters to feed MIME types (RSS / Atom / JSON Feed); a bare
 *   `application/json` alternate counts only when its href/title hints "feed"
 *   (avoids treating arbitrary JSON alternates as feeds),
 * - resolves relative hrefs against `pageUrl`,
 * - dedupes by canonical URL (first occurrence wins),
 * - extracts the link `title` when present.
 */
export function scanForFeeds(
  doc: DocumentLike,
  pageUrl: string | undefined,
): DiscoveredFeed[] {
  const out: DiscoveredFeed[] = [];
  const seen = new Set<string>();

  for (const link of Array.from(doc.querySelectorAll(FEED_LINK_SELECTOR))) {
    const rawType = link.getAttribute('type');
    const type = rawType?.trim().toLowerCase();
    const href = link.getAttribute('href') ?? undefined;
    const title = link.getAttribute('title')?.trim() || undefined;

    const kind = feedKindForLink(type, href, title);
    if (!kind) {
      continue;
    }

    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) {
      continue;
    }

    const key = canonicalKey(resolved);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    out.push({ url: resolved, title, kind, source: 'link-tag' });
  }

  return out;
}

/**
 * Decide whether a link is a feed and, if so, its kind. Returns undefined for
 * non-feed links. `application/json` is accepted only with a feed-ish hint.
 */
function feedKindForLink(
  type: string | undefined,
  href: string | undefined,
  title: string | undefined,
): FeedKind | undefined {
  if (!type) {
    return undefined;
  }
  const known = TYPE_TO_KIND[type];
  if (known) {
    return known;
  }
  if (type === 'application/json' && looksFeedish(href, title)) {
    return 'json';
  }
  return undefined;
}

const FEEDISH = /\b(feed|rss|atom)\b|feed|rss|atom/i;

function looksFeedish(
  href: string | undefined,
  title: string | undefined,
): boolean {
  return FEEDISH.test(href ?? '') || FEEDISH.test(title ?? '');
}

/** Canonical form for dedup only; falls back to the raw URL if canonicalize throws. */
function canonicalKey(url: string): string {
  try {
    return canonicalizeUrl(url);
  } catch {
    return url;
  }
}
