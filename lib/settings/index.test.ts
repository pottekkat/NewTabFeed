import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  refreshIntervalMinutes,
  layoutDensity,
  theme,
  markReadOnOpen,
  onboardingComplete,
  getSettings,
} from '@/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings defaults', () => {
  it('returns documented fallbacks before anything is set', async () => {
    expect(await refreshIntervalMinutes.getValue()).toBe(30);
    expect(await layoutDensity.getValue()).toBe('comfortable');
    expect(await theme.getValue()).toBe('system');
    expect(await markReadOnOpen.getValue()).toBe(true);
    expect(await onboardingComplete.getValue()).toBe(false);
  });

  it('getSettings snapshots all values at once', async () => {
    expect(await getSettings()).toEqual({
      refreshIntervalMinutes: 30,
      layoutDensity: 'comfortable',
      theme: 'system',
      markReadOnOpen: true,
      onboardingComplete: false,
    });
  });
});

describe('settings persistence', () => {
  it('round-trips changed values', async () => {
    await refreshIntervalMinutes.setValue(60);
    await theme.setValue('dark');
    expect(await refreshIntervalMinutes.getValue()).toBe(60);
    expect(await theme.getValue()).toBe('dark');
  });

  it('notifies watchers on change', async () => {
    let seen: number | undefined;
    const unwatch = refreshIntervalMinutes.watch((value) => {
      seen = value;
    });
    await refreshIntervalMinutes.setValue(15);
    unwatch();
    expect(seen).toBe(15);
  });
});
