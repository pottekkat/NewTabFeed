// Turn a feed item's RAW summary HTML into a safe, plain-text excerpt.
//
// `FeedItem.summaryHtml` is untrusted, unsanitized HTML (the service worker has
// no DOM and never sanitizes). We never render it as markup. Here we run it
// through DOMPurify (which drops scripts and other dangerous nodes) and read the
// resulting fragment's `textContent` — that discards every tag, decodes HTML
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

  // Sanitize to a DOM fragment, then take its text — tags stripped, scripts
  // removed, entities decoded.
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  const text = fragment.textContent ?? '';

  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;

  // Cut on a word boundary where possible, then append an ellipsis.
  const truncated = collapsed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const body =
    lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${body.trimEnd()}…`;
}
