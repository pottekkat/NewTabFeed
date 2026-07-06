import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';

// A 1x1 transparent PNG that actually loads in the browser test page, so a
// candidate using it stays put (no error) instead of cascading onward.
const OK_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Deterministic lower-priority candidates. originFaviconUrl yields a loadable
// image; faviconUrl yields a broken URL that will error.
vi.mock('../lib/favicon', () => ({
  originFaviconUrl: () => OK_PNG,
  faviconUrl: () => 'https://invalid.invalid/_favicon',
}));

import { Favicon } from './Favicon';

describe('Favicon', () => {
  it('renders the feed icon (iconUrl) first', async () => {
    const screen = await render(
      <Favicon
        siteUrl="https://example.com"
        iconUrl={OK_PNG}
        fallback="Example"
      />,
    );

    const img = screen.container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', OK_PNG);
  });

  it('falls back to the next candidate when the feed icon fails to load', async () => {
    const screen = await render(
      <Favicon
        siteUrl="https://example.com"
        // Broken URL → errors → chain advances to the (loadable) originFavicon.
        iconUrl="https://invalid.invalid/icon.png"
        fallback="Example"
      />,
    );

    await vi.waitFor(() =>
      expect(screen.container.querySelector('img')).toHaveAttribute(
        'src',
        OK_PNG,
      ),
    );
  });
});
