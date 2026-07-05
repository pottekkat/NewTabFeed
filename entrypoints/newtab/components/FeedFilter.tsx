import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import type { Feed } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Favicon } from './Favicon';
import { MenuItem, Popover } from './Popover';

interface FeedFilterProps {
  feeds: Feed[];
  unread: Map<string, number>;
  totalUnread: number;
  selected: string | undefined;
  onSelect: (feedId: string | undefined) => void;
}

function label(feed: Feed): string {
  return feed.customTitle?.trim() || feed.title;
}

/** Dropdown to filter the timeline: All feeds, or a single feed (with unread counts). */
export function FeedFilter({
  feeds,
  unread,
  totalUnread,
  selected,
  onSelect,
}: FeedFilterProps) {
  const current = selected ? feeds.find((f) => f.id === selected) : undefined;
  const triggerLabel = current ? label(current) : 'All feeds';

  return (
    <Popover
      align="start"
      className="max-h-[70vh] w-64 overflow-y-auto"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="hover:bg-accent hover:text-accent-foreground inline-flex h-8 max-w-52 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            onSelect={() => {
              onSelect(undefined);
              close();
            }}
          >
            <span className="flex-1">All feeds</span>
            {totalUnread > 0 && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {totalUnread}
              </span>
            )}
            {!selected && <Check className="size-3.5 shrink-0" />}
          </MenuItem>

          <div className="bg-border my-1 h-px" />

          {feeds.map((feed) => {
            const count = unread.get(feed.id) ?? 0;
            const isSelected = selected === feed.id;
            return (
              <MenuItem
                key={feed.id}
                onSelect={() => {
                  onSelect(feed.id);
                  close();
                }}
              >
                <Favicon siteUrl={feed.siteUrl} fallback={label(feed)} />
                <span className="flex-1 truncate">{label(feed)}</span>
                {feed.error && (
                  <span
                    title={feed.error.message}
                    aria-label={`Feed error: ${feed.error.message}`}
                    className="shrink-0"
                  >
                    <AlertTriangle className="size-3.5 text-amber-500" />
                  </span>
                )}
                {count > 0 && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {count}
                  </span>
                )}
                <Check
                  className={cn(
                    'size-3.5 shrink-0',
                    !isSelected && 'invisible',
                  )}
                />
              </MenuItem>
            );
          })}
        </>
      )}
    </Popover>
  );
}
