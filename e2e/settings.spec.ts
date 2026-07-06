import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed, openHeaderMenu } from './helpers';

test('theme and density changes apply and persist', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  // Pin the OS preference to light so the default "System" theme is a known baseline.
  await page.emulateMedia({ colorScheme: 'light' });
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  const html = page.locator('html');
  const grid = page.locator('[data-slot="item-grid"]');
  await expect(html).not.toHaveClass(/dark/);
  await expect(grid).toHaveClass(/minmax\(280px/);

  await openHeaderMenu(page, 'Settings');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(html).toHaveClass(/dark/);
  await dialog.getByRole('button', { name: 'Compact', exact: true }).click();
  await expect(grid).toHaveClass(/minmax\(220px/);

  // Reopen: persisted theme wins over the (still light) OS preference, and density sticks.
  const reopened = await openNewTab(context, extensionId);
  await reopened.emulateMedia({ colorScheme: 'light' });
  await expect(reopened.locator('html')).toHaveClass(/dark/);
  await expect(reopened.locator('[data-slot="item-grid"]')).toHaveClass(
    /minmax\(220px/,
  );
});

test('the unread-only filter toggles and hides read items', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  // Mark the newest item read so the filter has something to hide.
  await page
    .locator('[data-slot="item-card"]')
    .filter({ hasText: 'E2E Item 9' })
    .click({ button: 'middle' });

  const unreadOnly = page.getByRole('button', { name: 'Unread only' });
  await expect(unreadOnly).toHaveAttribute('aria-pressed', 'false');

  await unreadOnly.click();
  await expect(unreadOnly).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(9);

  await unreadOnly.click();
  await expect(unreadOnly).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(10);
});
