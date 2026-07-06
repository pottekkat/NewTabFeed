import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { CoverPlaceholder } from './CoverPlaceholder';

describe('CoverPlaceholder', () => {
  it('renders a placeholder element with the source monogram', async () => {
    const screen = await render(
      <CoverPlaceholder seed="news.ycombinator.com" label="Hacker News" />,
    );

    const el = screen.container.querySelector(
      '[data-slot="cover-placeholder"]',
    );
    expect(el).not.toBeNull();
    // First letter of the label, uppercased.
    expect(el?.textContent).toBe('H');
  });

  it('is deterministic — the same seed yields the same gradient', async () => {
    const first = await render(
      <CoverPlaceholder seed="lobste.rs" label="Lobsters" />,
    );
    const styleA = (
      first.container.querySelector(
        '[data-slot="cover-placeholder"]',
      ) as HTMLElement
    ).style.backgroundImage;
    await first.unmount();

    const second = await render(
      <CoverPlaceholder seed="lobste.rs" label="Lobsters" />,
    );
    const styleB = (
      second.container.querySelector(
        '[data-slot="cover-placeholder"]',
      ) as HTMLElement
    ).style.backgroundImage;

    expect(styleA).toBe(styleB);
    expect(styleA).not.toBe('');
  });

  it('derives different gradients for different seeds', async () => {
    const a = await render(
      <CoverPlaceholder seed="news.ycombinator.com" label="Hacker News" />,
    );
    const styleA = (
      a.container.querySelector(
        '[data-slot="cover-placeholder"]',
      ) as HTMLElement
    ).style.backgroundImage;
    await a.unmount();

    const b = await render(
      <CoverPlaceholder seed="lobste.rs" label="Lobsters" />,
    );
    const styleB = (
      b.container.querySelector(
        '[data-slot="cover-placeholder"]',
      ) as HTMLElement
    ).style.backgroundImage;

    expect(styleA).not.toBe(styleB);
  });
});
