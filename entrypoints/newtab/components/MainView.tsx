import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Inbox, Rss } from 'lucide-react';
import type { Feed, FeedItem } from '@/lib/types';
import type { SettingsSnapshot } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { Header } from './Header';
import { ItemGrid } from './ItemGrid';
import { EmptyState } from './EmptyState';
import { ManageFeedsDialog } from './ManageFeedsDialog';
import { SettingsDialog } from './SettingsDialog';
import { useFeedData } from '../lib/use-feed-data';
import { refreshNow, send } from '../lib/messaging';
import { settings as settingsItems } from '../lib/use-settings';

interface MainViewProps {
  settings: SettingsSnapshot;
}

export function MainView({ settings }: MainViewProps) {
  const data = useFeedData();
  const [refreshing, setRefreshing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Instant paint comes from IndexedDB; nudge the worker to fetch fresh items
  // once on mount. The worker broadcasts `feeds-updated` when anything changes.
  useEffect(() => {
    refreshNow(false);
  }, []);

  const feedsById = useMemo(() => {
    const map = new Map<string, Feed>();
    for (const feed of data.feeds) map.set(feed.id, feed);
    return map;
  }, [data.feeds]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await send({ type: 'refresh-now', force: true });
    } finally {
      setRefreshing(false);
    }
  }

  function onOpen(item: FeedItem) {
    if (settings.markReadOnOpen) void data.markItemRead(item);
  }

  const noFeeds = !data.loading && data.feeds.length === 0;
  const emptyList =
    !data.loading && data.feeds.length > 0 && data.items.length === 0;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Header
        feeds={data.feeds}
        unread={data.unread}
        totalUnread={data.totalUnread}
        feedId={data.feedId}
        onSelectFeed={data.setFeedId}
        unreadOnly={data.unreadOnly}
        onToggleUnread={data.setUnreadOnly}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        onOpenManage={() => setManageOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {noFeeds && (
          <EmptyState
            icon={Rss}
            title="No feeds yet"
            description="Add your first feed to fill your new tab with the stories you care about."
            action={
              <Button
                className="bg-orange-500 text-white hover:bg-orange-600"
                onClick={() =>
                  void settingsItems.onboardingComplete.setValue(false)
                }
              >
                Add your first feed
              </Button>
            }
          />
        )}

        {emptyList && data.unreadOnly && (
          <EmptyState
            icon={CheckCheck}
            title="All caught up"
            description="You've read everything. New items will appear here as your feeds update."
            action={
              <Button
                variant="outline"
                onClick={() => data.setUnreadOnly(false)}
              >
                Show all items
              </Button>
            }
          />
        )}

        {emptyList && !data.unreadOnly && (
          <EmptyState
            icon={Inbox}
            title="No items yet"
            description="Your feeds don't have any items stored yet. Try refreshing."
            action={
              <Button variant="outline" onClick={() => void onRefresh()}>
                Refresh now
              </Button>
            }
          />
        )}

        {!data.loading && data.items.length > 0 && (
          <ItemGrid
            items={data.items}
            feedsById={feedsById}
            density={settings.layoutDensity}
            newCount={data.newCount}
            hasMore={data.hasMore}
            loadingMore={data.loadingMore}
            onOpen={onOpen}
            onLoadMore={data.loadMore}
            onShowNew={data.showNewItems}
          />
        )}
      </main>

      <ManageFeedsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        feeds={data.feeds}
        unread={data.unread}
        onChanged={data.refreshFeeds}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onMarkAllRead={() => data.markAllRead()}
      />
    </div>
  );
}
