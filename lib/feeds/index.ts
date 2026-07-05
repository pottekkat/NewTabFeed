// Public surface of the feeds domain module.
export { parseFeed, parseDate } from '@/lib/feeds/parse';
export {
  fetchFeed,
  FeedFetchError,
  type FetchFeedResult,
  type FetchFeedOptions,
} from '@/lib/feeds/fetch';
export {
  subscribe,
  unsubscribe,
  refreshFeed,
  refreshAllFeeds,
  isDue,
  backoffActive,
  AlreadySubscribedError,
  InvalidFeedError,
  type SubscribeResult,
  type RefreshOutcome,
  type RefreshAllOptions,
  type RefreshAllResult,
} from '@/lib/feeds/refresh';
