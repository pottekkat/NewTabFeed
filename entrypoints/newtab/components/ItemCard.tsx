import { memo, useMemo, useState } from 'react';
import type { FeedItem } from '@/lib/types';
import type { LayoutDensity } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { CoverPlaceholder } from './CoverPlaceholder';
import { Favicon } from './Favicon';
import { excerpt } from '../lib/excerpt';
import { absoluteTime, relativeTime } from '../lib/relative-time';

interface ItemCardProps {
  item: FeedItem;
  /** Display name of the owning feed (customTitle || title). */
  sourceName: string;
  siteUrl: string | undefined;
  /** The owning feed's declared icon URL, tried first for the favicon. */
  iconUrl?: string;
  density: LayoutDensity;
  /** Called when the card is opened (plain, middle, or modified click). */
  onOpen: (item: FeedItem) => void;
}

/**
 * A stable key the placeholder gradient's hue derives from — the linked
 * article's hostname. Same host always yields the same color: a direct blog's
 * posts share one tint, while an aggregator's cards (whose links point at many
 * outside domains) get pleasant per-domain variety. Falls back to the feed id
 * (or title) when the URL can't be parsed.
 */
function coverSeed(item: FeedItem): string {
  try {
    return new URL(item.url).hostname;
  } catch {
    return item.feedId || item.title;
  }
}

function ItemCardImpl({
  item,
  sourceName,
  siteUrl,
  iconUrl,
  density,
  onOpen,
}: ItemCardProps) {
  const compact = density === 'compact';
  // Excerpts are text-only (sanitized, tags stripped) and hidden in compact mode.
  const summary = useMemo(
    () => (compact ? '' : excerpt(item.summaryHtml)),
    [compact, item.summaryHtml],
  );

  // Cover image: comfortable density only, hidden if it fails to load. When no
  // usable image exists (aggregators ship none, or the real one errored), a
  // generated placeholder fills the same slot so the grid never looks unfinished.
  const [coverErrored, setCoverErrored] = useState(false);
  const hasCover = Boolean(item.thumbnailUrl) && !coverErrored;
  const showCover = !compact && hasCover;
  const showPlaceholder = !compact && !hasCover;

  return (
    <a
      href={item.url}
      // Same tab is correct — this IS the new tab. Modified/middle clicks open a
      // background tab via the browser's native anchor handling; we don't
      // preventDefault, we just record the open.
      onClick={() => onOpen(item)}
      onAuxClick={(e) => {
        if (e.button === 1) onOpen(item);
      }}
      data-slot="item-card"
      data-read={item.read}
      className={cn(
        'group bg-card text-card-foreground focus-visible:ring-ring/50 flex flex-col rounded-xl border shadow-sm transition-colors outline-none hover:border-orange-500/40 focus-visible:ring-[3px]',
        compact ? 'gap-1.5 p-3' : 'gap-2 p-4',
        item.read && 'opacity-60 hover:opacity-100',
      )}
    >
      {showCover && (
        // Bleed to the card's edges (counter the p-4 padding) so the cover sits
        // flush against the top; top corners match the card's rounding.
        <img
          src={item.thumbnailUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setCoverErrored(true)}
          className="-mx-4 -mt-4 aspect-video w-[calc(100%+2rem)] rounded-t-xl object-cover"
        />
      )}

      {showPlaceholder && (
        <CoverPlaceholder seed={coverSeed(item)} label={sourceName} />
      )}

      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Favicon siteUrl={siteUrl} iconUrl={iconUrl} fallback={sourceName} />
        <span className="truncate font-medium">{sourceName}</span>
        <span aria-hidden="true">·</span>
        <time
          dateTime={new Date(item.publishedAt).toISOString()}
          title={absoluteTime(item.publishedAt)}
          className="shrink-0 tabular-nums"
        >
          {relativeTime(item.publishedAt)}
        </time>
        {!item.read && (
          <span
            aria-label="Unread"
            className="ml-auto size-2 shrink-0 rounded-full bg-orange-500"
          />
        )}
      </div>

      <h3
        className={cn(
          'line-clamp-2 font-semibold text-balance',
          compact ? 'text-sm' : 'text-[15px] leading-snug',
        )}
      >
        {item.title}
      </h3>

      {summary && (
        <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
          {summary}
        </p>
      )}
    </a>
  );
}

export const ItemCard = memo(ItemCardImpl);
