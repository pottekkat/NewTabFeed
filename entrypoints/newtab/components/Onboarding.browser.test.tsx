import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

// Onboarding orchestrates the permission prompt + subscribe messages and writes
// the onboardingComplete flag. Mock those boundaries so the flow is observable
// without touching extension APIs. Spies are created via vi.hoisted so they
// exist when the hoisted vi.mock factories run.
const { ensureHostAccess, send, setOnboardingComplete } = vi.hoisted(() => ({
  ensureHostAccess: vi.fn(),
  send: vi.fn(),
  setOnboardingComplete: vi.fn(),
}));
vi.mock('../lib/messaging', () => ({ ensureHostAccess, send }));
vi.mock('../lib/use-settings', () => ({
  settings: {
    onboardingComplete: { setValue: setOnboardingComplete },
  },
}));

vi.mock('../lib/favicon', () => ({
  faviconUrl: () => undefined,
  originFaviconUrl: () => undefined,
}));

import { Onboarding } from './Onboarding';

describe('Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureHostAccess.mockResolvedValue(true);
    send.mockResolvedValue({ ok: true, data: undefined });
    setOnboardingComplete.mockResolvedValue(undefined);
  });

  it('pre-checks the four default starter feeds', async () => {
    const screen = await render(<Onboarding onComplete={() => {}} />);
    const boxes = screen.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const checked = [...boxes].filter((b) => b.checked);
    expect(checked).toHaveLength(4);
  });

  it('lets the user deselect a starter feed', async () => {
    const screen = await render(<Onboarding onComplete={() => {}} />);
    // Hacker News is one of the pre-checked defaults.
    const hn = screen.container
      .querySelector<HTMLLabelElement>('label')!
      .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(hn.checked).toBe(true);
    await userEvent.click(hn);
    expect(hn.checked).toBe(false);
  });

  it('disables "Start reading" once every feed is deselected', async () => {
    const screen = await render(<Onboarding onComplete={() => {}} />);
    const startBtn = screen.getByRole('button', { name: /start reading/i });
    await expect.element(startBtn).toBeEnabled();

    const boxes = screen.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]:checked',
    );
    for (const box of boxes) await userEvent.click(box);

    await expect.element(startBtn).toBeDisabled();
  });

  it('requests host access, subscribes to each feed, then completes', async () => {
    const onComplete = vi.fn();
    const screen = await render(<Onboarding onComplete={onComplete} />);

    await userEvent.click(
      screen.getByRole('button', { name: /start reading/i }),
    );

    // Permission requested before any subscribe.
    expect(ensureHostAccess).toHaveBeenCalledTimes(1);
    // One subscribe per pre-checked default feed.
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'subscribe' }),
    );
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the permission-denied retry state when access is refused', async () => {
    ensureHostAccess.mockResolvedValue(false);
    const onComplete = vi.fn();
    const screen = await render(<Onboarding onComplete={onComplete} />);

    await userEvent.click(
      screen.getByRole('button', { name: /start reading/i }),
    );

    await expect
      .element(screen.getByText(/host access is needed/i))
      .toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips onboarding empty, still setting the completion flag', async () => {
    const onComplete = vi.fn();
    const screen = await render(<Onboarding onComplete={onComplete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start empty' }));

    expect(send).not.toHaveBeenCalled();
    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
