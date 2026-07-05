import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import {
  ensureRefreshAlarm,
  watchRefreshInterval,
  REFRESH_ALARM,
} from '@/lib/scheduler';
import { refreshIntervalMinutes } from '@/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('ensureRefreshAlarm', () => {
  it('creates the refresh alarm at the default interval', async () => {
    await ensureRefreshAlarm();
    const alarm = await browser.alarms.get(REFRESH_ALARM);
    expect(alarm?.periodInMinutes).toBe(30);
  });

  it('recreates the alarm when the interval setting changes', async () => {
    await ensureRefreshAlarm();
    await refreshIntervalMinutes.setValue(60);
    await ensureRefreshAlarm();
    const alarm = await browser.alarms.get(REFRESH_ALARM);
    expect(alarm?.periodInMinutes).toBe(60);
  });

  it('clamps below the 0.5-minute floor', async () => {
    await refreshIntervalMinutes.setValue(0.1);
    await ensureRefreshAlarm();
    const alarm = await browser.alarms.get(REFRESH_ALARM);
    expect(alarm?.periodInMinutes).toBe(0.5);
  });

  it('is idempotent — no churn when the period already matches', async () => {
    await ensureRefreshAlarm();
    const createSpy = vi.spyOn(browser.alarms, 'create');
    await ensureRefreshAlarm();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('watchRefreshInterval', () => {
  it('rebuilds the alarm when the setting changes', async () => {
    await ensureRefreshAlarm();
    const unwatch = watchRefreshInterval();
    await refreshIntervalMinutes.setValue(45);
    // Let the watch callback's async ensureRefreshAlarm settle.
    await vi.waitFor(async () => {
      const alarm = await browser.alarms.get(REFRESH_ALARM);
      expect(alarm?.periodInMinutes).toBe(45);
    });
    unwatch();
  });
});
