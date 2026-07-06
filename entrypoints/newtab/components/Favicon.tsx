import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { faviconUrl, originFaviconUrl } from '../lib/favicon';

interface FaviconProps {
  siteUrl: string | undefined;
  /** The feed's own declared icon URL, tried first when present. */
  iconUrl?: string;
  /** Fallback glyph — first letter of the source name. */
  fallback: string;
  size?: number;
  className?: string;
}

/**
 * A site favicon, tried in privacy-preserving order: the feed's declared icon,
 * the site's own `/favicon.ico`, then the MV3 `_favicon/` API (Chrome's local
 * cache). Each candidate advances to the next on load error, degrading to a
 * monogram glyph when none resolve. No third-party favicon service is ever used.
 */
export function Favicon({
  siteUrl,
  iconUrl,
  fallback,
  size = 32,
  className,
}: FaviconProps) {
  // Ordered candidate URLs. Empties are filtered so the chain skips gaps.
  const candidates = useMemo(
    () =>
      [iconUrl, originFaviconUrl(siteUrl), faviconUrl(siteUrl, size)].filter(
        (u): u is string => Boolean(u),
      ),
    [iconUrl, siteUrl, size],
  );

  const [index, setIndex] = useState(0);

  // Restart the chain whenever the candidate list changes.
  useEffect(() => setIndex(0), [candidates]);

  const base = cn(
    'flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm',
    className,
  );

  const src = candidates[index];

  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          base,
          'bg-muted text-muted-foreground text-[9px] font-semibold',
        )}
      >
        {fallback.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className={base}
      // Advance to the next candidate; when exhausted, index runs past the end
      // and the monogram fallback renders.
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
