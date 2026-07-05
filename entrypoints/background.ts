import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import { dispatch } from '@/lib/message-handler';
import {
  ensureRefreshAlarm,
  watchRefreshInterval,
  REFRESH_ALARM,
} from '@/lib/scheduler';
import { refreshAllFeeds } from '@/lib/feeds';
import { broadcastFeedsUpdated } from '@/lib/message-handler';
import { refreshIntervalMinutes } from '@/lib/settings';
import {
  syncDiscoveryRegistration,
  recordDiscoveredFeeds,
  clearDiscovered,
} from '@/lib/discovery';
import { isFeedsFound, type RequestMessage } from '@/lib/messages';

// Service worker: the domain core's only host in production. It stays thin and
// delegates everything to lib/.
//
// MV3 rules honored here:
// - No DOM APIs (feed parsing is pure-JS feedsmith; sanitizing happens in the page).
// - No durable state in module globals — every handler reads from storage/IndexedDB.
// - Scheduling via chrome.alarms, never setTimeout/setInterval.
// - Listeners are registered synchronously at the top level so a restarted
//   worker replays events to them.
export default defineBackground(() => {
  // Keep the periodic refresh alarm in sync on install, startup, and setting change.
  browser.runtime.onInstalled.addListener(() => {
    void ensureRefreshAlarm();
    void syncDiscoveryRegistration();
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureRefreshAlarm();
    void syncDiscoveryRegistration();
  });
  watchRefreshInterval();

  // Register/unregister the discovery content script as host access is granted
  // or revoked (onboarding grants it). Registration lives in the scripting API,
  // not the manifest, so `<all_urls>` stays an optional permission.
  browser.permissions.onAdded.addListener(() => {
    void syncDiscoveryRegistration();
  });
  browser.permissions.onRemoved.addListener(() => {
    void syncDiscoveryRegistration();
  });

  // Badge is per-tab and reflects the current page. Clear it the moment a tab
  // starts navigating (the freshly-loaded page re-reports at document_idle) and
  // when a tab closes, so a stale count can't linger.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      void clearDiscovered(tabId);
    }
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void clearDiscovered(tabId);
  });

  // Periodic refresh: only stale feeds, honoring backoff.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REFRESH_ALARM) {
      return;
    }
    void (async () => {
      const intervalMs = (await refreshIntervalMinutes.getValue()) * 60_000;
      const result = await refreshAllFeeds({ intervalMs });
      if (result.changed) {
        await broadcastFeedsUpdated();
      }
    })();
  });

  // Typed request/response channel from newtab/popup, plus the fire-and-forget
  // `feeds-found` message from the discovery content script.
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content-script discovery: needs sender.tab.id, no response expected.
    if (isFeedsFound(message)) {
      void recordDiscoveredFeeds(
        sender.tab?.id,
        message.feeds,
        message.pageUrl,
      );
      return false;
    }
    // `return true` keeps the channel open for the async response (per MV3 rules).
    void (async () => {
      sendResponse(await dispatch(message as RequestMessage));
    })();
    return true;
  });
});
