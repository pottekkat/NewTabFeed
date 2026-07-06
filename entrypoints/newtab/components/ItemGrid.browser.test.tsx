import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import type { Feed, FeedItem } from '@/lib/types';

vi.mock('../lib/favicon', () => ({
  faviconUrl: () => undefined,
  originFaviconUrl: () => undefined,
}));

import { ItemGrid } from './ItemGrid';

// The shipped grid track rule (comfortable density) lives in a Tailwind
// arbitrary-property class. Tailwind's stylesheet isn't loaded in the browser
// test project, so we reproduce exactly that rule here, keyed off the same
// `data-slot`, to exercise the responsive column behavior.
const GRID_CSS = `[data-slot="item-grid"]{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));}`;

let styleEl: HTMLStyleElement;

function makeItems(n: number): FeedItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i${i}`,
    feedId: 'f1',
    title: `Headline number ${i}`,
    url: `https://example.com/${i}`,
    publishedAt: Date.now() - i * 1000,
    read: false,
    fetchedAt: Date.now(),
  }));
}

const feedsById = new Map<string, Feed>([
  [
    'f1',
    {
      id: 'f1',
      url: 'https://example.com/feed',
      title: 'Example',
      siteUrl: 'https://example.com',
      addedAt: 0,
    },
  ],
]);

function renderGrid() {
  return render(
    <ItemGrid
      items={makeItems(6)}
      feedsById={feedsById}
      density="comfortable"
      newCount={0}
      hasMore={false}
      loadingMore={false}
      onOpen={() => {}}
      onLoadMore={() => {}}
      onShowNew={() => {}}
    />,
  );
}

function cardTops(container: HTMLElement): number[] {
  return [
    ...container.querySelectorAll<HTMLElement>('[data-slot="item-card"]'),
  ].map((el) => el.offsetTop);
}

describe('ItemGrid layout', () => {
  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = GRID_CSS;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
  });

  it('lays cards out in multiple columns on a wide viewport', async () => {
    await page.viewport(1280, 800);
    const screen = await renderGrid();
    await expect
      .element(screen.getByText('Headline number 0'))
      .toBeInTheDocument();

    const tops = cardTops(screen.container);
    // First two cards share a row → same offsetTop (multi-column layout).
    expect(tops[0]).toBe(tops[1]);
  });

  it('stacks cards into a single column on a narrow viewport', async () => {
    await page.viewport(360, 800);
    const screen = await renderGrid();
    await expect
      .element(screen.getByText('Headline number 0'))
      .toBeInTheDocument();

    const tops = cardTops(screen.container);
    // Single column → each card sits below the previous one.
    expect(tops[1]).toBeGreaterThan(tops[0]);
  });
});
