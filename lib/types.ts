// Core domain models for NewTabFeed.
//
// These are the shapes persisted in IndexedDB and passed across the
// service-worker / newtab-page boundary. They are intentionally minimal:
// every field earns its place. Anything derivable at render time (relative
// timestamps, favicon URLs, sanitized HTML) is NOT stored here.

/** Per-feed error state, tracked for backoff and UI surfacing. */
export interface FeedError {
  /** Human-readable reason the last refresh failed. */
  message: string;
  /** Consecutive failures. Drives exponential backoff in the scheduler. */
  failCount: number;
  /** Epoch ms of the first failure in the current failing streak. */
  since: number;
}

/** A subscribed feed. `id` is the canonical feed URL (see lib/url.ts). */
export interface Feed {
  /** Canonical feed URL. Doubles as the primary key and identity. */
  id: string;
  /** Canonical feed URL (same value as `id`; kept explicit for clarity). */
  url: string;
  /** Canonical site/home URL, when the feed advertises one. */
  siteUrl?: string;
  /** Absolute URL of the feed's own icon/logo, when it declares one. */
  iconUrl?: string;
  /** Title as reported by the feed. */
  title: string;
  /** User override; when set, the UI shows this instead of `title`. */
  customTitle?: string;
  /** Feed description/subtitle. */
  description?: string;
  /** Epoch ms the user subscribed. */
  addedAt: number;
  /** Epoch ms of the last successful fetch (2xx or 304). */
  lastFetchedAt?: number;
  /** Epoch ms of the newest item's publish date seen so far. */
  lastPublishedAt?: number;
  /** HTTP ETag from the last response, for conditional GET. */
  etag?: string;
  /** HTTP Last-Modified from the last response, for conditional GET. */
  lastModified?: string;
  /** Current error state, or null/undefined when healthy. */
  error?: FeedError | null;
}

/**
 * A single feed entry.
 *
 * `summaryHtml` is stored RAW (unsanitized). The service worker has no DOM and
 * must never sanitize; sanitization happens at render time in the newtab page
 * with DOMPurify. Treat this field as untrusted everywhere it is read.
 */
export interface FeedItem {
  /** Stable hash of `feedId` + the item's guid/link. Primary key. */
  id: string;
  /** Owning feed's id. */
  feedId: string;
  /** Item title (HTML entities already decoded by the parser). */
  title: string;
  /** Absolute item URL (relative URLs are resolved during normalization). */
  url: string;
  /** Epoch ms publish date; falls back to fetch time when the feed omits one. */
  publishedAt: number;
  /** Item author/byline, when available. */
  author?: string;
  /** RAW, UNSANITIZED summary/content HTML. Sanitize at render time. */
  summaryHtml?: string;
  /** Absolute thumbnail image URL, when the feed provides one. */
  thumbnailUrl?: string;
  /** Read state. Preserved across re-fetches. */
  read: boolean;
  /** Epoch ms this item was first fetched and stored. */
  fetchedAt: number;
}

/**
 * A parsed-and-normalized item, before it is tied to a concrete feed/fetch.
 *
 * `parseFeed` produces these; `subscribe`/`refreshFeed` turn them into
 * `FeedItem`s by attaching `feedId`, `fetchedAt`, a computed stable `id`, and
 * the default `read: false` (or a preserved flag on re-fetch).
 */
export interface NormalizedItem {
  /**
   * Identity source for the item: the feed's guid when present, otherwise the
   * link. Used (with feedId) to compute the stable item id, so re-fetches map
   * to the same record and preserve read state.
   */
  guid: string;
  title: string;
  /** Absolute item URL (already resolved against the feed/site base). */
  url: string;
  /** Epoch ms publish date, or undefined when the feed omits/garbles it. */
  publishedAt?: number;
  author?: string;
  /** RAW, UNSANITIZED summary/content HTML. */
  summaryHtml?: string;
  thumbnailUrl?: string;
}

/** Result of parsing a feed document. */
export interface ParsedFeed {
  /** Feed-level metadata. `id`/`url` are set by the caller from the fetch URL. */
  feed: Partial<Feed>;
  items: NormalizedItem[];
}
