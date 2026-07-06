import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed } from './helpers';

// The read flow is split into two tests on purpose. Marking-read happens in an
// async IndexedDB write inside the card's open handler; a plain left-click also
// navigates the (single) new-tab page away, and the write racing page unload is
// inherently flaky. So we exercise "open marks read + persists" with a
// middle-click (opens the item in a background tab, keeps the new tab alive) and
// exercise navigation separately with a left-click.

test('opening a card marks it read and the state persists', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  const newest = page
    .locator('[data-slot="item-card"]')
    .filter({ hasText: 'E2E Item 9' });
  await expect(newest).toHaveAttribute('data-read', 'false');

  // Middle-click opens the item (in a background tab) without navigating away.
  await newest.click({ button: 'middle' });
  await expect(newest).toHaveAttribute('data-read', 'true');

  // Reopen the new tab: the read state came from IndexedDB, so it survives.
  const reopened = await openNewTab(context, extensionId);
  await expect(
    reopened
      .locator('[data-slot="item-card"]')
      .filter({ hasText: 'E2E Item 9' }),
  ).toHaveAttribute('data-read', 'true');

  // Unread count dropped by one: 9 of 10 items remain unread.
  await reopened.getByRole('button', { name: 'Unread only' }).click();
  await expect(reopened.locator('[data-slot="item-card"]')).toHaveCount(9);
});

test('clicking a card navigates to the item URL', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  await page
    .locator('[data-slot="item-card"]')
    .filter({ hasText: 'E2E Item 9' })
    .click();

  await expect(page).toHaveURL(`${server.url}/posts/9`);
});
