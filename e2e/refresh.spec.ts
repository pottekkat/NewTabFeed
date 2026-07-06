import { test, expect } from './fixtures';
import { makeRss } from './server';
import { openNewTab, onboardWithFeed } from './helpers';

test('refreshing surfaces a newly published item', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(10);

  // The server now publishes an 11th, newer item.
  server.setRss(makeRss(server.url, 11));
  await expect(page.getByText('E2E Item 10')).toHaveCount(0);

  // Force a refresh from the toolbar; the worker fetches, stores, and broadcasts.
  await page.getByRole('button', { name: 'Refresh feeds' }).click();

  // The new item merges in at the top (the page is at the top, so no pill).
  await expect(page.getByText('E2E Item 10')).toBeVisible();
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(11);
});
