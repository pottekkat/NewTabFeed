import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed, openHeaderMenu } from './helpers';

test('renaming a feed shows a custom title on cards', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  await openHeaderMenu(page, 'Manage feeds');
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'E2E Fixture Feed', exact: true })
    .click();
  await dialog.getByLabel('Feed title').fill('My Renamed Feed');
  await dialog.getByLabel('Feed title').press('Enter');
  await expect(dialog.getByText('My Renamed Feed')).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).click();
  // Cards now show the custom title as their source.
  await expect(
    page
      .locator('[data-slot="item-card"]')
      .first()
      .getByText('My Renamed Feed'),
  ).toBeVisible();
});

test('removing a feed clears its items and returns the empty state', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  await openHeaderMenu(page, 'Manage feeds');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove E2E Fixture Feed' }).click();
  // A confirm step guards removal.
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog.getByText('No feeds yet.')).toBeVisible();

  // Reopen the new tab: with the feed (and its items) gone from IndexedDB, a
  // fresh load shows only the empty state and no cards.
  const reopened = await openNewTab(context, extensionId);
  await expect(
    reopened.getByRole('heading', { name: 'No feeds yet' }),
  ).toBeVisible();
  await expect(reopened.locator('[data-slot="item-card"]')).toHaveCount(0);
});

test('OPML export includes the subscribed feed URL', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  await openHeaderMenu(page, 'Manage feeds');
  const dialog = page.getByRole('dialog');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  const opml = readFileSync(path, 'utf8');
  expect(opml).toContain(`${server.url}/rss.xml`);
});

test('OPML import subscribes to every feed in the file', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await page.getByRole('button', { name: 'Start empty' }).click();
  await expect(
    page.getByRole('heading', { name: 'No feeds yet' }),
  ).toBeVisible();

  await openHeaderMenu(page, 'Manage feeds');
  const dialog = page.getByRole('dialog');

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Imported</title></head>
  <body>
    <outline text="RSS" title="RSS" type="rss" xmlUrl="${server.url}/rss.xml" />
    <outline text="Atom" title="Atom" type="rss" xmlUrl="${server.url}/atom.xml" />
  </body>
</opml>`;
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'import.opml',
    mimeType: 'text/x-opml',
    buffer: Buffer.from(opml),
  });

  await expect(dialog.getByText(/Imported 2/)).toBeVisible();
  await expect(dialog.getByText('E2E Fixture Feed')).toBeVisible();
  await expect(dialog.getByText('E2E Atom Fixture')).toBeVisible();
});
