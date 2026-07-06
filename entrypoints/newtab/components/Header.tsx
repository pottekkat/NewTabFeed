import {
  MoreHorizontal,
  RefreshCw,
  Rss,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { Feed } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FeedFilter } from './FeedFilter';
import { MenuItem, Popover } from './Popover';

interface HeaderProps {
  feeds: Feed[];
  unread: Map<string, number>;
  totalUnread: number;
  feedId: string | undefined;
  onSelectFeed: (feedId: string | undefined) => void;
  unreadOnly: boolean;
  onToggleUnread: (value: boolean) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenManage: () => void;
  onOpenSettings: () => void;
}

export function Header({
  feeds,
  unread,
  totalUnread,
  feedId,
  onSelectFeed,
  unreadOnly,
  onToggleUnread,
  refreshing,
  onRefresh,
  onOpenManage,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 sm:px-6">
        <div className="mr-1 flex items-center gap-1.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 128 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="rounded-[4px]"
          >
            <rect width="128" height="128" rx="28" fill="#F97316" />
            <g
              stroke="#FFFFFF"
              strokeWidth="12"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M38 62 A28 28 0 0 1 66 90" />
              <path d="M38 40 A50 50 0 0 1 88 90" />
            </g>
            <circle cx="38" cy="90" r="11" fill="#18181B" />
          </svg>
          <span className="text-sm font-semibold tracking-tight">
            NewTabFeed
          </span>
        </div>

        {feeds.length > 0 && (
          <FeedFilter
            feeds={feeds}
            unread={unread}
            totalUnread={totalUnread}
            selected={feedId}
            onSelect={onSelectFeed}
          />
        )}

        <div className="ml-auto flex items-center gap-1">
          {feeds.length > 0 && (
            <button
              type="button"
              aria-pressed={unreadOnly}
              onClick={() => onToggleUnread(!unreadOnly)}
              className={cn(
                'h-8 rounded-md px-2.5 text-sm font-medium transition-colors',
                unreadOnly
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground',
              )}
            >
              Unread only
            </button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh feeds"
            title="Refresh feeds"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </Button>

          <Popover
            align="end"
            trigger={(props) => (
              <Button
                variant="ghost"
                size="icon"
                {...props}
                aria-label="More options"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    onOpenManage();
                    close();
                  }}
                >
                  <Rss className="size-4" />
                  Manage feeds
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    onOpenSettings();
                    close();
                  }}
                >
                  <SettingsIcon className="size-4" />
                  Settings
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>
    </header>
  );
}
