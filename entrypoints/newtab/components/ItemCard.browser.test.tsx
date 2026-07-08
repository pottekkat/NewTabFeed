import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import type { FeedItem } from '@/lib/types';

// Favicon reaches for `wxt/browser` (the MV3 `_favicon/` API), which doesn't
// exist in the test page. Stub it to a plain glyph so the card renders in
// isolation.
vi.mock('../lib/favicon', () => ({
  faviconUrl: () => undefined,
  originFaviconUrl: () => undefined,
}));

import { ItemCard } from './ItemCard';

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'i1',
    feedId: 'f1',
    title: 'A quiet headline',
    url: 'https://example.com/post',
    publishedAt: Date.now() - 60 * 60 * 1000, // 1h ago
    read: false,
    fetchedAt: Date.now(),
    summaryHtml: '<p>Some <b>excerpt</b> body text.</p>',
    ...overrides,
  };
}

describe('ItemCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, source, relative time and a real link', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );

    await expect
      .element(screen.getByText('A quiet headline'))
      .toBeInTheDocument();
    await expect.element(screen.getByText('Example News')).toBeInTheDocument();
    await expect.element(screen.getByText('1h')).toBeInTheDocument();

    const link = screen.getByRole('link');
    await expect
      .element(link)
      .toHaveAttribute('href', 'https://example.com/post');
  });

  it('shows a sanitized text excerpt in comfortable density', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );

    // Tags stripped, text kept—never the raw markup.
    await expect
      .element(screen.getByText('Some excerpt body text.'))
      .toBeInTheDocument();
  });

  it('hides the excerpt in compact density', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="compact"
        onOpen={() => {}}
      />,
    );

    expect(screen.container.querySelector('p')).toBeNull();
  });

  it('marks unread items with an accent dot; read items have none', async () => {
    const unread = await render(
      <ItemCard
        item={makeItem({ read: false })}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );
    await expect.element(unread.getByLabelText('Unread')).toBeInTheDocument();
    await unread.unmount();

    const read = await render(
      <ItemCard
        item={makeItem({ read: true })}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );
    expect(read.container.querySelector('[aria-label="Unread"]')).toBeNull();
    // Read cards are dimmed and flagged for styling.
    expect(read.container.querySelector('[data-read="true"]')).not.toBeNull();
  });

  it('renders a real cover image (and no placeholder) when the item has a thumbnail', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem({ thumbnailUrl: 'https://example.com/cover.jpg' })}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );

    const cover = screen.container.querySelector(
      'img[src="https://example.com/cover.jpg"]',
    );
    expect(cover).not.toBeNull();
    // A usable real image must win—the placeholder must not also render.
    expect(
      screen.container.querySelector('[data-slot="cover-placeholder"]'),
    ).toBeNull();
  });

  it('renders a generated placeholder when the item has no thumbnail', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={() => {}}
      />,
    );

    // No real cover image (the favicon mock yields no URL either)...
    expect(screen.container.querySelector('img')).toBeNull();
    // ...but the generated placeholder fills the slot instead.
    expect(
      screen.container.querySelector('[data-slot="cover-placeholder"]'),
    ).not.toBeNull();
  });

  it('omits the placeholder in compact density', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="compact"
        onOpen={() => {}}
      />,
    );

    expect(
      screen.container.querySelector('[data-slot="cover-placeholder"]'),
    ).toBeNull();
  });

  it('omits the cover image in compact density', async () => {
    const screen = await render(
      <ItemCard
        item={makeItem({ thumbnailUrl: 'https://example.com/cover.jpg' })}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="compact"
        onOpen={() => {}}
      />,
    );

    expect(
      screen.container.querySelector(
        'img[src="https://example.com/cover.jpg"]',
      ),
    ).toBeNull();
  });

  it('calls onOpen when the card is clicked', async () => {
    const onOpen = vi.fn();
    const screen = await render(
      <ItemCard
        item={makeItem()}
        sourceName="Example News"
        siteUrl="https://example.com"
        density="comfortable"
        onOpen={onOpen}
      />,
    );

    // The anchor points at a real URL; suppress the navigation the click would
    // otherwise trigger in the test page.
    const link = screen.getByRole('link');
    (link.element() as HTMLAnchorElement).addEventListener('click', (e) =>
      e.preventDefault(),
    );
    await userEvent.click(link);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });
});
