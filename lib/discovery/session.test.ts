import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import {
  recordDiscoveredFeeds,
  getDiscoveredFeeds,
  clearDiscovered,
} from '@/lib/discovery/session';
import type { DiscoveredFeed } from '@/lib/discovery/types';

// fakeBrowser implements storage.session but throws on action.*—stub the badge
// calls so we can assert on them. (The overloaded action typings don't accept a
// plain async mock, so cast the spies to a bare Mock.)
let setBadgeText: Mock;
let setBadgeBg: Mock;

beforeEach(() => {
  fakeBrowser.reset();
  setBadgeText = vi.spyOn(browser.action, 'setBadgeText') as unknown as Mock;
  setBadgeText.mockResolvedValue(undefined);
  setBadgeBg = vi.spyOn(
    browser.action,
    'setBadgeBackgroundColor',
  ) as unknown as Mock;
  setBadgeBg.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FEEDS: DiscoveredFeed[] = [
  { url: 'https://a.com/feed.xml', kind: 'rss', source: 'link-tag' },
  { url: 'https://a.com/atom.xml', kind: 'atom', source: 'link-tag' },
];

describe('recordDiscoveredFeeds', () => {
  it('persists feeds per tab and lights up the badge with the count', async () => {
    await recordDiscoveredFeeds(7, FEEDS, 'https://a.com/');

    expect(await getDiscoveredFeeds(7)).toEqual(FEEDS);
    expect(setBadgeText).toHaveBeenCalledWith({ text: '2', tabId: 7 });
    expect(setBadgeBg).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 7 }),
    );
  });

  it('keeps per-tab state isolated', async () => {
    await recordDiscoveredFeeds(1, [FEEDS[0]]);
    await recordDiscoveredFeeds(2, FEEDS);
    expect(await getDiscoveredFeeds(1)).toEqual([FEEDS[0]]);
    expect(await getDiscoveredFeeds(2)).toEqual(FEEDS);
  });

  it('clears the badge and state when no feeds are found', async () => {
    await recordDiscoveredFeeds(3, FEEDS);
    await recordDiscoveredFeeds(3, []);
    expect(await getDiscoveredFeeds(3)).toEqual([]);
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 3 });
  });

  it('ignores messages with no tab id', async () => {
    await recordDiscoveredFeeds(undefined, FEEDS);
    expect(setBadgeText).not.toHaveBeenCalled();
    expect(setBadgeBg).not.toHaveBeenCalled();
  });
});

describe('clearDiscovered', () => {
  it('removes state and clears the tab badge', async () => {
    await recordDiscoveredFeeds(9, FEEDS);
    await clearDiscovered(9);
    expect(await getDiscoveredFeeds(9)).toEqual([]);
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 9 });
  });
});

describe('getDiscoveredFeeds', () => {
  it('returns an empty array for an unknown tab', async () => {
    expect(await getDiscoveredFeeds(999)).toEqual([]);
  });
});
