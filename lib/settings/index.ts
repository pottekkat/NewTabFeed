// User settings, via @wxt-dev/storage's `defineItem` (type-safe, versioned,
// backed by chrome.storage.local). NOT for the item archive — that's IndexedDB.
//
// Each item declares a `fallback` so `getValue()` always returns a concrete
// value (never null) and reads work before the user has ever changed anything.

import { storage } from '#imports';

export type LayoutDensity = 'comfortable' | 'compact';
export type Theme = 'system' | 'light' | 'dark';

/** How often the background alarm refreshes feeds. */
export const refreshIntervalMinutes = storage.defineItem<number>(
  'local:settings:refreshIntervalMinutes',
  { fallback: 30 },
);

/** Card grid density. */
export const layoutDensity = storage.defineItem<LayoutDensity>(
  'local:settings:layoutDensity',
  { fallback: 'comfortable' },
);

/** Color theme; 'system' follows the OS preference. */
export const theme = storage.defineItem<Theme>('local:settings:theme', {
  fallback: 'system',
});

/** Whether opening an item marks it read automatically. */
export const markReadOnOpen = storage.defineItem<boolean>(
  'local:settings:markReadOnOpen',
  { fallback: true },
);

/** Whether first-run onboarding has been completed/dismissed. */
export const onboardingComplete = storage.defineItem<boolean>(
  'local:settings:onboardingComplete',
  { fallback: false },
);

/** All settings values in one shot — convenient for the UI's initial render. */
export interface SettingsSnapshot {
  refreshIntervalMinutes: number;
  layoutDensity: LayoutDensity;
  theme: Theme;
  markReadOnOpen: boolean;
  onboardingComplete: boolean;
}

export async function getSettings(): Promise<SettingsSnapshot> {
  const [interval, density, themeValue, markRead, onboarding] =
    await Promise.all([
      refreshIntervalMinutes.getValue(),
      layoutDensity.getValue(),
      theme.getValue(),
      markReadOnOpen.getValue(),
      onboardingComplete.getValue(),
    ]);
  return {
    refreshIntervalMinutes: interval,
    layoutDensity: density,
    theme: themeValue,
    markReadOnOpen: markRead,
    onboardingComplete: onboarding,
  };
}
