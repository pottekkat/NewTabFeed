import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import type { Feed, FeedItem } from '@/lib/types';
import type { LayoutDensity } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { ItemCard } from './ItemCard';

interface ItemGridProps {
  items: FeedItem[];
  feedsById: Map<string, Feed>;
  density: LayoutDensity;
  newCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onOpen: (item: FeedItem) => void;
  onLoadMore: () => void;
  onShowNew: () => void;
}

function sourceOf(feed: Feed | undefined, feedId: string): string {
  if (!feed) return feedId;
  return feed.customTitle?.trim() || feed.title;
}

export function ItemGrid({
  items,
  feedsById,
  density,
  newCount,
  hasMore,
  loadingMore,
  onOpen,
  onLoadMore,
  onShowNew,
}: ItemGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll: observe a sentinel just below the grid.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <>
      {newCount > 0 && (
        <div className="pointer-events-none sticky top-2 z-10 flex justify-center">
          <button
            type="button"
            onClick={onShowNew}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-4 py-1.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-orange-600"
          >
            <ArrowUp className="size-3.5" />
            {newCount} new {newCount === 1 ? 'item' : 'items'}
          </button>
        </div>
      )}

      <div
        data-slot="item-grid"
        className={cn(
          'grid',
          density === 'compact'
            ? '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-3'
            : '[grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] gap-4',
        )}
      >
        {items.map((item) => {
          const feed = feedsById.get(item.feedId);
          return (
            <ItemCard
              key={item.id}
              item={item}
              sourceName={sourceOf(feed, item.feedId)}
              siteUrl={feed?.siteUrl}
              density={density}
              onOpen={onOpen}
            />
          );
        })}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {loadingMore && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Loading more…
        </p>
      )}
    </>
  );
}
