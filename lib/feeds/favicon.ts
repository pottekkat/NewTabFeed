// Favicon resolution + local byte caching — runs in the service worker only.
//
// Rendering a favicon from a remote URL at paint time is fragile: hotlink
// protection, cross-origin resource policy, sites Chrome has never visited (the
// MV3 `_favicon` API then returns a generic globe), and plain 404s all leave a
// blank. The robust, local-first fix is to fetch the icon BYTES here in the
// worker and store them as a `data:` URL, so the newtab page renders from local
// bytes that always work — offline included.
//
// MV3 hazards handled here:
// - NO DOM APIs in the worker: icon `<link>`s are extracted from the homepage
//   HTML with a regex over the `<head>`, never a DOMParser.
// - A response that takes >30s kills the worker, so every fetch has an 8s
//   AbortController timeout.
// - Icon resolution is strictly BEST-EFFORT: any failure returns undefined and
//   never throws out of subscribe/refresh. Everything is wrapped in try/catch.

import { originOf, resolveUrl } from '@/lib/url';

/** Per-request timeout. Favicon work must never approach the 30s worker limit. */
const ICON_FETCH_TIMEOUT_MS = 8_000;
/** Skip icons larger than this to keep IndexedDB small (~150 KB). */
const MAX_ICON_BYTES = 150 * 1024;
/** Only the first slice of the homepage is scanned for `<link>`s (head lives up top). */
const HTML_SCAN_LIMIT = 100_000;

/** Recognizable image extensions, used when a server omits/garbles Content-Type. */
const IMAGE_EXT_RE = /\.(ico|png|gif|jpe?g|webp|svg|avif|bmp)(\?|#|$)/i;

/** Extension → MIME, for building the data-URL prefix when Content-Type is unhelpful. */
const EXT_MIME: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/**
 * Resolve the best available icon for a feed and return it as a locally-cached
 * `data:` URL, or undefined when nothing usable resolves.
 *
 * Sources are tried in priority order, and the first that yields valid image
 * bytes wins:
 *   1. `feedIconUrl` — the feed's self-declared icon.
 *   2. Icon `<link>`s in the site homepage's `<head>` (apple-touch-icon first,
 *      then plain `icon`/`shortcut icon`).
 *   3. `${origin}/favicon.ico` — the conventional fallback.
 *
 * Best-effort: never throws. A network/permission/parse failure just falls
 * through to the next source (or returns undefined).
 */
export async function resolveAndCacheIcon(opts: {
  siteUrl?: string;
  feedIconUrl?: string;
}): Promise<string | undefined> {
  const { siteUrl, feedIconUrl } = opts;
  try {
    // 1. The feed's own declared icon. If it yields bytes we stop here and
    //    never touch the homepage (cheapest, most authoritative source).
    if (feedIconUrl) {
      const resolved = resolveUrl(feedIconUrl, siteUrl);
      const data = resolved ? await fetchIconBytes(resolved) : undefined;
      if (data) {
        return data;
      }
    }

    // 2. Icon links declared in the homepage <head>.
    if (siteUrl) {
      for (const href of await findHtmlIcons(siteUrl)) {
        const resolved = resolveUrl(href, siteUrl);
        const data = resolved ? await fetchIconBytes(resolved) : undefined;
        if (data) {
          return data;
        }
      }
    }

    // 3. The conventional /favicon.ico at the site origin.
    const origin = originOf(siteUrl);
    if (origin) {
      const data = await fetchIconBytes(`${origin}/favicon.ico`);
      if (data) {
        return data;
      }
    }
  } catch {
    // Best-effort: swallow anything unexpected and leave the icon unset.
  }
  return undefined;
}

/**
 * Fetch an icon URL and, if it looks like a sane image, return it as a
 * `data:<mime>;base64,<bytes>` string. Returns undefined on any failure or if
 * the response isn't a valid, reasonably-sized image.
 */
async function fetchIconBytes(url: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return undefined;
    }
    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    // Accept when the server says image/*, or the URL ends in a known image
    // extension (some servers mislabel favicons as text/plain or octet-stream).
    if (!contentType.startsWith('image/') && !IMAGE_EXT_RE.test(url)) {
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
      return undefined;
    }
    const mime = contentType.startsWith('image/')
      ? contentType
      : (mimeFromUrl(url) ?? 'image/x-icon');
    return `data:${mime};base64,${base64FromBytes(bytes)}`;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the homepage HTML and extract icon `<link>` hrefs from its `<head>`,
 * ordered by preference (apple-touch-icon first). Returns [] on any failure.
 */
async function findHtmlIcons(siteUrl: string): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(siteUrl);
    if (!response.ok) {
      return [];
    }
    const html = (await response.text()).slice(0, HTML_SCAN_LIMIT);
    // Only scan the <head>; the closing tag bounds where icon links live.
    const headEnd = html.search(/<\/head>/i);
    return extractIconLinks(headEnd === -1 ? html : html.slice(0, headEnd));
  } catch {
    return [];
  }
}

/**
 * Regex-extract icon `<link>` hrefs from an HTML fragment (no DOMParser in the
 * worker). Matches any `<link>` whose `rel` contains "icon" — covering `icon`,
 * `shortcut icon`, and `apple-touch-icon` — tolerating attribute order and
 * single/double/unquoted values. Apple-touch-icons come first (usually a crisp
 * PNG); other icons follow in document order.
 */
function extractIconLinks(html: string): string[] {
  const apple: string[] = [];
  const other: string[] = [];
  const linkTag = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkTag.exec(html)) !== null) {
    const tag = match[0];
    const rel = getAttr(tag, 'rel');
    if (!rel || !/icon/i.test(rel)) {
      continue;
    }
    const href = getAttr(tag, 'href');
    if (!href) {
      continue;
    }
    (/apple-touch-icon/i.test(rel) ? apple : other).push(href);
  }
  return [...apple, ...other];
}

/** Read a single HTML attribute value, handling double/single/unquoted forms. */
function getAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  );
  const m = re.exec(tag);
  if (!m) {
    return undefined;
  }
  return m[2] ?? m[3] ?? m[4];
}

/** Fetch with an AbortController timeout; credentials omitted (public assets). */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-cache',
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Base64-encode raw bytes via `btoa`, chunking to avoid arg-count limits. */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Best-guess MIME from a URL's file extension. */
function mimeFromUrl(url: string): string | undefined {
  const ext = IMAGE_EXT_RE.exec(url)?.[1]?.toLowerCase();
  return ext ? EXT_MIME[ext] : undefined;
}
