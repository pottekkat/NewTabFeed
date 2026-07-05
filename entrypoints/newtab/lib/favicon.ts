// Favicon URLs via the MV3 `_favicon/` API (requires the "favicon" permission,
// declared in wxt.config.ts). This resolves icons Chrome already has cached for
// visited sites, with no third-party network request — keeping the reader
// local-first. Callers render a fallback glyph when the <img> errors.

import { browser } from 'wxt/browser';

/**
 * Build a `_favicon/` URL for a site. Returns undefined when there's no site URL
 * to key off (the caller then shows a fallback glyph).
 */
export function faviconUrl(
  siteUrl: string | undefined,
  size: number = 32,
): string | undefined {
  if (!siteUrl) return undefined;
  const params = new URLSearchParams({
    pageUrl: siteUrl,
    size: String(size),
  });
  return browser.runtime.getURL(`/_favicon/?${params.toString()}`);
}
