import { memo, useMemo } from 'react';
import type { FeedItem } from '@/lib/types';
import type { LayoutDensity } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Favicon } from './Favicon';
import { excerpt } from '../lib/excerpt';
import { absoluteTime, relativeTime } from '../lib/relative-time';

interface ItemCardProps {
  item: FeedItem;
  /** Display name of the owning feed (customTitle || title). */
  sourceName: string;
  siteUrl: string | undefined;
  density: LayoutDensity;
  /** Called when the card is opened (plain, middle, or modified click). */
  onOpen: (item: FeedItem) => void;
}

function ItemCardImpl({
  item,
  sourceName,
  siteUrl,
  density,
  onOpen,
}: ItemCardProps) {
  const compact = density === 'compact';
  // Excerpts are text-only (sanitized, tags stripped) and hidden in compact mode.
  const summary = useMemo(
    () => (compact ? '' : excerpt(item.summaryHtml)),
    [compact, item.summaryHtml],
  );

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
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Favicon siteUrl={siteUrl} fallback={sourceName} />
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
