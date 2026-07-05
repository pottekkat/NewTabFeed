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
import type { RequestMessage } from '@/lib/messages';

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
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureRefreshAlarm();
  });
  watchRefreshInterval();

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

  // Typed request/response channel from newtab/popup. `return true` keeps the
  // message channel open for the async response (per MV3 rules).
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      sendResponse(await dispatch(message as RequestMessage));
    })();
    return true;
  });
});
