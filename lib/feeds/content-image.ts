// First-content-image extraction — runs in the service worker.
//
// Many feeds ship no structured thumbnail (media:thumbnail, enclosure, etc.) and
// instead embed the cover as an inline `<img>` inside the item's content HTML
// (content:encoded / Atom <content> / description). This module recovers that
// image so those cards still get a cover, at zero extra network cost — the HTML
// is already in hand.
//
// SECURITY: the HTML here is UNTRUSTED. We only READ a single attribute value
// out of it via regex — we never render or execute this markup. Rendering and
// sanitization happen later, in the newtab page, via DOMPurify. Matching favicon
// resolution, this stays regex-only: NO DOMParser/DOM APIs (forbidden in the SW).

/** Filenames that are almost certainly tracking/spacer pixels, not real covers. */
const TRACKING_SRC_RE = /(pixel|spacer|blank|1x1|tracking|beacon)/i;

/**
 * Return the `src` of the first usable content `<img>` in an HTML string, or
 * undefined when there is none. The raw (possibly-relative) src is returned
 * verbatim — the caller resolves it against the correct base.
 *
 * "Usable" skips images that are clearly not content: an empty src, a `data:`
 * URI, an SVG, or an obvious tracking/spacer pixel (a `width`/`height` of 0 or 1,
 * or a filename like `pixel`/`spacer`/`1x1`/`tracking`/`beacon`). This is
 * best-effort: we scan tags in document order and return the first that passes.
 */
export function firstContentImage(
  html: string | undefined,
): string | undefined {
  if (!html) {
    return undefined;
  }
  const imgTag = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgTag.exec(html)) !== null) {
    const tag = match[0];
    const src = getAttr(tag, 'src')?.trim();
    if (!src || isUnusableSrc(src) || isSpacerPixel(tag)) {
      continue;
    }
    return src;
  }
  return undefined;
}

/** A src that can never be a real cover: `data:` URIs and SVGs. */
export function isUnusableSrc(src: string): boolean {
  if (/^data:/i.test(src)) {
    return true;
  }
  if (TRACKING_SRC_RE.test(src)) {
    return true;
  }
  // SVG (by extension, ignoring any query/fragment).
  return /\.svg(\?|#|$)/i.test(src);
}

/** Treat a 0/1-pixel `<img>` (a common tracking beacon) as not-a-cover. */
function isSpacerPixel(tag: string): boolean {
  return (
    isTinyDimension(getAttr(tag, 'width')) ||
    isTinyDimension(getAttr(tag, 'height'))
  );
}

function isTinyDimension(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const n = Number.parseInt(value, 10);
  return n === 0 || n === 1;
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
