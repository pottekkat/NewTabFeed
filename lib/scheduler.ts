// Alarm scheduling for periodic refresh.
//
// MV3 forbids setTimeout/setInterval for background timing (they die with the
// worker). We use chrome.alarms, which persists across worker restarts. The
// alarm period tracks the user's refresh-interval setting; when the setting
// changes we recreate the alarm.

import { browser } from 'wxt/browser';
import { refreshIntervalMinutes } from '@/lib/settings';

/** The single periodic refresh alarm's name. */
export const REFRESH_ALARM = 'refresh-feeds';

/** Never schedule below Chrome's 0.5-minute floor for packed extensions. */
const MIN_PERIOD_MINUTES = 0.5;

/**
 * Ensure the refresh alarm exists and matches the current interval setting.
 * Idempotent: if an alarm with the right period already exists it's left alone,
 * otherwise it's (re)created. Call on install, on startup, and whenever the
 * interval setting changes.
 */
export async function ensureRefreshAlarm(): Promise<void> {
  const minutes = Math.max(
    MIN_PERIOD_MINUTES,
    await refreshIntervalMinutes.getValue(),
  );
  const existing = await browser.alarms.get(REFRESH_ALARM);
  if (existing && existing.periodInMinutes === minutes) {
    return;
  }
  // create() replaces any existing alarm of the same name.
  await browser.alarms.create(REFRESH_ALARM, {
    periodInMinutes: minutes,
    // Fire the first run one period out; startup/newtab-open handle "now".
    delayInMinutes: minutes,
  });
}

/**
 * Wire the interval setting to the alarm: whenever the user changes it, rebuild
 * the alarm. Returns the unwatch function. Call once at worker startup.
 */
export function watchRefreshInterval(): () => void {
  return refreshIntervalMinutes.watch(() => {
    void ensureRefreshAlarm();
  });
}
