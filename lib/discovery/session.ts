// Per-tab discovery state + the action badge.
//
// The service worker is ephemeral, so what the content script found for a tab
// can't live in a module variable—it goes in `storage.session` keyed by tab
// id (cleared when the browser closes, which is exactly the lifetime we want).
// The badge is a per-tab overlay ("light up" when a site has feeds).

import { browser } from 'wxt/browser';
import type { DiscoveredFeed } from '@/lib/discovery/types';

/** Tailwind orange-500—the extension's accent, used for the "feeds here" badge. */
const BADGE_COLOR = '#f97316';

interface TabDiscovery {
  feeds: DiscoveredFeed[];
  pageUrl?: string;
}

function tabKey(tabId: number): string {
  return `discovered:${tabId}`;
}

/**
 * Record what a content script found for a tab: persist it and light up (or
 * clear) the badge for that tab. Ignored when there's no tab id (e.g. a message
 * from a non-tab context).
 */
export async function recordDiscoveredFeeds(
  tabId: number | undefined,
  feeds: DiscoveredFeed[],
  pageUrl?: string,
): Promise<void> {
  if (tabId === undefined) {
    return;
  }
  if (feeds.length === 0) {
    await clearDiscovered(tabId);
    return;
  }
  const entry: TabDiscovery = { feeds, pageUrl };
  await browser.storage.session.set({ [tabKey(tabId)]: entry });
  await setBadge(tabId, feeds.length);
}

/** Read the feeds discovered for a tab (empty when none). */
export async function getDiscoveredFeeds(
  tabId: number,
): Promise<DiscoveredFeed[]> {
  const key = tabKey(tabId);
  const stored = (await browser.storage.session.get(key)) as Record<
    string,
    TabDiscovery | undefined
  >;
  return stored[key]?.feeds ?? [];
}

/** Forget a tab's discovery state and clear its badge. */
export async function clearDiscovered(tabId: number): Promise<void> {
  await browser.storage.session.remove(tabKey(tabId));
  await setBadge(tabId, 0);
}

/**
 * Set (or clear, when count is 0) the badge for a single tab. Wrapped in
 * try/catch because the badge is cosmetic—a race with tab teardown must never
 * reject a discovery write.
 */
async function setBadge(tabId: number, count: number): Promise<void> {
  try {
    if (count > 0) {
      await browser.action.setBadgeBackgroundColor({
        color: BADGE_COLOR,
        tabId,
      });
      await browser.action.setBadgeText({ text: String(count), tabId });
    } else {
      await browser.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    // Tab gone or action unavailable—nothing to update.
  }
}
