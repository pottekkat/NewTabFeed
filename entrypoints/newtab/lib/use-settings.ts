// React binding over the `@wxt-dev/storage` settings items.
//
// Loads the full snapshot once, then subscribes to each item's `.watch()` so the
// UI reflects changes live — including changes made in another open new tab or
// the popup. Components write with the item setters re-exported below (e.g.
// `settings.theme.setValue('dark')`); the watch pushes the new value back here.

import { useEffect, useState } from 'react';
import {
  getSettings,
  layoutDensity,
  markReadOnOpen,
  onboardingComplete,
  refreshIntervalMinutes,
  theme,
  type SettingsSnapshot,
} from '@/lib/settings';

/** The settings items, for components that need to write a value. */
export const settings = {
  refreshIntervalMinutes,
  layoutDensity,
  theme,
  markReadOnOpen,
  onboardingComplete,
};

/**
 * The current settings snapshot, or `null` until the first async load resolves.
 * Re-renders on any settings change.
 */
export function useSettings(): SettingsSnapshot | null {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void getSettings().then((s) => {
      if (active) setSnapshot(s);
    });

    const patch =
      <K extends keyof SettingsSnapshot>(key: K) =>
      (value: SettingsSnapshot[K]) =>
        setSnapshot((prev) => (prev ? { ...prev, [key]: value } : prev));

    const unwatchers = [
      refreshIntervalMinutes.watch(patch('refreshIntervalMinutes')),
      layoutDensity.watch(patch('layoutDensity')),
      theme.watch(patch('theme')),
      markReadOnOpen.watch(patch('markReadOnOpen')),
      onboardingComplete.watch(patch('onboardingComplete')),
    ];

    return () => {
      active = false;
      for (const unwatch of unwatchers) unwatch();
    };
  }, []);

  return snapshot;
}
