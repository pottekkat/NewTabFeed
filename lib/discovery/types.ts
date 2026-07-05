// Discovery domain types — shared by the content-script scan, the well-known
// path probe, session/badge state, and the popup UI.

/** Broad classification of a discovered feed, for a small UI badge (rss/atom/json). */
export type FeedKind = 'rss' | 'atom' | 'json' | 'unknown';

/** Where a discovered feed came from. */
export type FeedSource = 'link-tag' | 'probe';

/**
 * A feed found for the current page, before the user subscribes. `url` is an
 * absolute feed URL (relative hrefs are resolved during the scan); subscribe and
 * the already-subscribed comparison canonicalize it via `lib/url`.
 */
export interface DiscoveredFeed {
  url: string;
  /** Feed title when known (link `title` attr, or the parsed feed's title). */
  title?: string;
  kind: FeedKind;
  source: FeedSource;
}
