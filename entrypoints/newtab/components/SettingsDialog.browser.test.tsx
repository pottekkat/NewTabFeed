import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import type { SettingsSnapshot } from '@/lib/settings';

// The dialog writes through the `@wxt-dev/storage` items (which reach `#imports`
// at module load). Mock the binding so writes are observable spies. Spies are
// created via vi.hoisted so they exist when the hoisted vi.mock factory runs.
const setValues = vi.hoisted(() => ({
  theme: vi.fn(),
  layoutDensity: vi.fn(),
  refreshIntervalMinutes: vi.fn(),
  markReadOnOpen: vi.fn(),
  onboardingComplete: vi.fn(),
}));
vi.mock('../lib/use-settings', () => ({
  settings: {
    theme: { setValue: setValues.theme },
    layoutDensity: { setValue: setValues.layoutDensity },
    refreshIntervalMinutes: { setValue: setValues.refreshIntervalMinutes },
    markReadOnOpen: { setValue: setValues.markReadOnOpen },
    onboardingComplete: { setValue: setValues.onboardingComplete },
  },
}));

import { SettingsDialog } from './SettingsDialog';

const snapshot: SettingsSnapshot = {
  refreshIntervalMinutes: 30,
  layoutDensity: 'comfortable',
  theme: 'system',
  markReadOnOpen: true,
  onboardingComplete: true,
};

function renderDialog(
  overrides: Partial<SettingsSnapshot> = {},
  onMarkAllRead = vi.fn(),
) {
  return render(
    <SettingsDialog
      open
      onOpenChange={() => {}}
      settings={{ ...snapshot, ...overrides }}
      onMarkAllRead={onMarkAllRead}
    />,
  );
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the settings when open', async () => {
    const screen = await renderDialog();
    await expect.element(screen.getByText('Settings')).toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Dark' }))
      .toBeInTheDocument();
  });

  it('reflects the current theme as the pressed segment', async () => {
    const screen = await renderDialog({ theme: 'light' });
    await expect
      .element(screen.getByRole('button', { name: 'Light' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(screen.getByRole('button', { name: 'Dark' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('writes the theme when a segment is clicked', async () => {
    const screen = await renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(setValues.theme).toHaveBeenCalledWith('dark');
  });

  it('writes the density when a segment is clicked', async () => {
    const screen = await renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(setValues.layoutDensity).toHaveBeenCalledWith('compact');
  });

  it('writes the refresh interval from the select', async () => {
    const screen = await renderDialog();
    // Radix Select is a custom listbox: open the trigger, then click the
    // option in the portalled content (options carry role="option").
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Every hour' }));
    expect(setValues.refreshIntervalMinutes).toHaveBeenCalledWith(60);
  });

  it('toggles mark-read-on-open', async () => {
    const screen = await renderDialog({ markReadOnOpen: true });
    await userEvent.click(screen.getByRole('switch'));
    expect(setValues.markReadOnOpen).toHaveBeenCalledWith(false);
  });

  it('marks all as read via the callback', async () => {
    const onMarkAllRead = vi.fn().mockResolvedValue(undefined);
    const screen = await renderDialog({}, onMarkAllRead);
    await userEvent.click(
      screen.getByRole('button', { name: /mark all read/i }),
    );
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });
});
