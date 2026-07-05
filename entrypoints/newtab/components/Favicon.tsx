import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { faviconUrl } from '../lib/favicon';

interface FaviconProps {
  siteUrl: string | undefined;
  /** Fallback glyph — first letter of the source name. */
  fallback: string;
  size?: number;
  className?: string;
}

/**
 * A site favicon via the MV3 `_favicon/` API, degrading to a monogram glyph when
 * there's no site URL or the icon fails to load.
 */
export function Favicon({
  siteUrl,
  fallback,
  size = 32,
  className,
}: FaviconProps) {
  const url = faviconUrl(siteUrl, size);
  const [errored, setErrored] = useState(false);

  // Reset the error state if the source changes.
  useEffect(() => setErrored(false), [url]);

  const base = cn(
    'flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm',
    className,
  );

  if (!url || errored) {
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
      src={url}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className={base}
      onError={() => setErrored(true)}
    />
  );
}
