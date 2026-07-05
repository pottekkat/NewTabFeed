// Apply the color theme by toggling the `.dark` class on <html>, per the shadcn
// convention. 'system' follows the OS preference via matchMedia and updates live
// when the OS switches; 'light'/'dark' pin the choice.

import { useEffect } from 'react';
import type { Theme } from '@/lib/settings';

function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * Keep <html>'s `.dark` class in sync with the given theme. Pass `null` while
 * settings are still loading to leave the current class untouched (avoids a
 * light→dark flash).
 */
export function useTheme(theme: Theme | null): void {
  useEffect(() => {
    if (theme === null) return;

    if (theme !== 'system') {
      applyDark(theme === 'dark');
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    applyDark(query.matches);
    const onChange = (e: MediaQueryListEvent) => applyDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);
}
