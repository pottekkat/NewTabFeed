// Link-preview extraction — runs in the service worker.
//
// When a feed item ships no thumbnail and/or no usable description, we fetch the
// linked article's HTML and mine its Open Graph / Twitter Card metadata to fill
// the cover image and/or excerpt. This is GENERIC: no per-hostname/site-specific
// logic — just the standards every publisher already emits in <head>.
//
// SECURITY: the fetched HTML is UNTRUSTED. We only READ attribute values out of
// it via regex — we never render or execute this markup (rendering and
// sanitization happen later, in the newtab page, via DOMPurify). Mirroring
// content-image.ts and favicon resolution, this stays regex-only: NO
// DOMParser/DOM APIs (forbidden in the SW).

import { assertHostAccess } from '@/lib/permissions';
import { isUnusableSrc } from '@/lib/feeds/content-image';

/** Metadata mined from a linked article's <head>. Fields absent when unfound. */
export interface LinkPreview {
  /** Absolute cover-image URL, resolved against the article URL. */
  imageUrl?: string;
  /** Plain-text article excerpt/description. */
  description?: string;
}

/** Default per-fetch timeout. og tags live in <head>, so this is generous. */
const DEFAULT_TIMEOUT_MS = 6000;

/** Cap the downloaded body at 256 KiB — the tags we want are in <head>. */
const RANGE_HEADER = 'bytes=0-262143';

/** Meta keys we accept for the cover image, in priority order. */
const IMAGE_KEYS = [
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
];

/** Meta keys we accept for the excerpt, in priority order. */
const DESCRIPTION_KEYS = [
  'og:description',
  'twitter:description',
  'description',
];

/**
 * Extract an Open Graph / Twitter Card preview from an HTML document. Scans
 * every `<meta>` tag, keys them by `property`/`name` (whichever is present),
 * and picks the highest-priority image and description. `baseUrl` (the
 * article's final URL) resolves a relative og:image. Returns `{}` when nothing
 * usable is found.
 */
export function extractPreview(html: string, baseUrl: string): LinkPreview {
  // First value wins per key (documents rarely repeat, and the head's own copy
  // should take precedence over any stray later duplicate).
  const metas = new Map<string, string>();
  const metaTag = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaTag.exec(html)) !== null) {
    const tag = match[0];
    const key = (getAttr(tag, 'property') ?? getAttr(tag, 'name'))
      ?.trim()
      .toLowerCase();
    const content = getAttr(tag, 'content');
    if (key && content !== undefined && !metas.has(key)) {
      metas.set(key, content);
    }
  }

  const preview: LinkPreview = {};

  const rawImage = firstDefined(metas, IMAGE_KEYS);
  if (rawImage) {
    // HTML attribute values are entity-encoded; decode before treating as a URL
    // (og:image query strings routinely carry `&amp;`).
    const decoded = decodeEntities(rawImage).trim();
    if (decoded && !isUnusableSrc(decoded)) {
      try {
        const resolved = new URL(decoded, baseUrl).href;
        if (!isUnusableSrc(resolved)) {
          preview.imageUrl = resolved;
        }
      } catch {
        // Unparseable URL → skip; leave imageUrl unset.
      }
    }
  }

  const rawDescription = firstDefined(metas, DESCRIPTION_KEYS);
  if (rawDescription) {
    const decoded = decodeEntities(rawDescription).trim();
    if (decoded) {
      preview.description = decoded;
    }
  }

  return preview;
}

/**
 * Whether a feed's own "description" is too thin to render a useful excerpt:
 * link-only markup (e.g. an HN "Comments" link) or fewer than 25 characters of
 * real text. Strips `<a>…</a>` blocks first, then all remaining tags, and
 * collapses whitespace before measuring. Undefined/empty is thin.
 */
export function summaryIsThin(html: string | undefined): boolean {
  if (!html) {
    return true;
  }
  const text = html
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length < 25;
}

/**
 * Fetch a linked article and extract its preview metadata. Cookie-less and
 * body-capped (Range), with a hard per-request timeout (default 6s). Requires
 * host access — `NoHostPermissionError` propagates so the orchestrator can stop
 * the whole pass. Every OTHER failure (network, timeout, non-2xx) resolves to
 * `{}` — this function never throws for them.
 */
export async function fetchLinkPreview(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LinkPreview> {
  await assertHostAccess();

  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Abort our request if the caller's signal fires.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        // Cap the body: og tags live in <head>. A server that ignores Range and
        // returns a full 200 is fine — we just read whatever we get.
        Range: RANGE_HEADER,
      },
      signal: controller.signal,
      redirect: 'follow',
      // Article pages are public; don't leak cookies/credentials.
      credentials: 'omit',
    });
    if (!response.ok) {
      return {};
    }
    const body = await response.text();
    // Resolve relative og:image against the FINAL URL, so redirects resolve right.
    return extractPreview(body, response.url || url);
  } catch {
    // Network error, timeout/abort, decode failure — all best-effort no-ops.
    return {};
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

/** Return the first key present in `map`, following `keys` priority order. */
function firstDefined(
  map: Map<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = map.get(key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
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

/**
 * Decode the HTML entities that show up in og/meta content: the five named
 * ones plus numeric decimal (`&#NN;`) and hex (`&#xHH;`). `&amp;` is decoded
 * last so an encoded entity like `&amp;lt;` survives as literal `&lt;`.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      codePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      codePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Safely turn a code point into a string, dropping invalid ones. */
function codePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}
