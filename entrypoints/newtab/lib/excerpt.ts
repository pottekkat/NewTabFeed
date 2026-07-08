// Turn a feed item's RAW summary HTML into a safe, plain-text excerpt.
//
// `FeedItem.summaryHtml` is untrusted, unsanitized HTML (the service worker has
// no DOM and never sanitizes). We never render it as markup. Here we run it
// through DOMPurify (which drops scripts and other dangerous nodes) and read the
// resulting fragment's `textContent`—that discards every tag, decodes HTML
// entities, and yields a plain string. We then collapse whitespace and truncate.
// React renders the result as text, so no HTML ever reaches the DOM as markup.
//
// DOMPurify needs a DOM, so this module runs only in the newtab page (and in the
// browser-mode test project), never in the service worker.

import DOMPurify from 'dompurify';

const DEFAULT_MAX_LENGTH = 220;

/**
 * Extract a plain-text excerpt from raw summary HTML. Returns '' for missing or
 * empty input. Guaranteed tag-free: safe to render as text.
 */
export function excerpt(
  html: string | undefined,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  if (!html) return '';

  // Sanitize to a DOM fragment, then take its text—tags stripped, scripts
  // removed, entities decoded.
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  // `textContent` concatenates with no separators, so "a</p><p>b" collapses to
  // "ab". Insert spaces at block/line boundaries first, so paragraphs and list
  // items stay word-separated instead of jamming together.
  separateBlocks(fragment);
  const collapsed = (fragment.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  // Link-aggregator feeds (Lobsters, Hacker News) carry no article body—their
  // "description" is just a link to the discussion or a block of metadata, not
  // prose. Rendering that as an excerpt is noise (the card already opens the
  // post on click), so suppress it. Detected structurally, not per-source.
  if (isLinkOnly(fragment) || isMetadataOnly(collapsed)) return '';

  if (collapsed.length <= maxLength) return collapsed;

  // Cut on a word boundary where possible, then append an ellipsis.
  const truncated = collapsed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const body =
    lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${body.trimEnd()}…`;
}

/** Block/line elements after which a word boundary should exist in the text. */
const BLOCK_SELECTOR =
  'p,div,br,li,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,tr,section,article,figure,pre';

/**
 * Insert a space at block-level boundaries so `textContent` doesn't glue the
 * last word of one block to the first of the next. `<br>` is void, so the space
 * goes after it; everything else gets a trailing space child.
 */
function separateBlocks(fragment: DocumentFragment): void {
  fragment.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
    if (el.tagName === 'BR') el.after(' ');
    else el.append(' ');
  });
}

/**
 * True when the fragment's only text lives inside links—e.g. Lobsters, whose
 * item body is just `<p><a>Comments</a></p>`. Removing the anchors leaves no
 * prose behind. A real summary that merely ends in a "read more" link keeps its
 * surrounding text, so it is not suppressed.
 */
function isLinkOnly(fragment: DocumentFragment): boolean {
  const clone = fragment.cloneNode(true) as DocumentFragment;
  clone.querySelectorAll('a').forEach((a) => a.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim() === '';
}

/**
 * True when the text is only aggregator metadata, not prose—e.g. hnrss's
 * "Article URL: … Comments URL: … Points: N # Comments: N". We strip URLs, the
 * known labels, and any digits/punctuation; if nothing but that remains, there
 * is no real summary to show. ("Article URL"/"Comments URL" aren't RSS
 * fields—just text hnrss packs into the description; the canonical link is `<link>`.)
 */
function isMetadataOnly(text: string): boolean {
  const residue = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:article|comments?)\s+url\s*:/gi, ' ')
    .replace(/\bpoints?\s*:/gi, ' ')
    .replace(/#\s*comments?\s*:?/gi, ' ')
    .replace(/[\s\d.,;:#|/\\()[\]–—-]+/g, '')
    .trim();
  return residue === '';
}
