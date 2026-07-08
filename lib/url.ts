// URL helpers—pure, framework-free, no extension APIs.
//
// Feed URLs come from users (typed into an "add feed" box) and from feeds
// themselves (item links, often relative). We canonicalize the former so the
// same feed typed two ways yields one Feed id, and resolve the latter so item
// URLs are always absolute and openable from the newtab page.

/**
 * Canonicalize a user-supplied feed/site URL:
 * - trims surrounding whitespace,
 * - prepends `https://` when no scheme is present,
 * - drops the fragment (`#...`),
 * - normalizes the host to lower case and removes a trailing-slash-only path.
 *
 * Throws if the input can't be understood as an http(s) URL, so callers can
 * reject bad input at subscribe time.
 */
export function canonicalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Empty URL');
  }
  // Add a scheme if the user typed a bare host like "example.com/feed".
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  // Collapse a path that is just "/" to empty so "https://x.com" and
  // "https://x.com/" canonicalize identically.
  if (url.pathname === '/') {
    url.pathname = '';
  }
  return url.toString();
}

/**
 * Resolve a possibly-relative URL against one or more base URLs, returning the
 * first absolute result. Bases are tried in order (e.g. the item's own feed
 * URL first, then the site URL). Returns undefined when nothing resolves.
 */
export function resolveUrl(
  href: string | undefined,
  ...bases: Array<string | undefined>
): string | undefined {
  const value = href?.trim();
  if (!value) {
    return undefined;
  }
  // Already absolute?
  try {
    return new URL(value).toString();
  } catch {
    // Relative—fall through and try to resolve against the bases.
  }
  for (const base of bases) {
    if (!base) {
      continue;
    }
    try {
      return new URL(value, base).toString();
    } catch {
      // Try the next base.
    }
  }
  return undefined;
}

/** Derive an origin (scheme://host) from a URL, or undefined if unparseable. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
