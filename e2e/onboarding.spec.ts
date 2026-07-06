import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed } from './helpers';

test('first run shows onboarding; "Start empty" lands on the empty state', async ({
  context,
  extensionId,
}) => {
  const page = await openNewTab(context, extensionId);

  // Onboarding is identifiable by its tagline and the starter-feed checklist.
  await expect(
    page.getByText('Your feeds. Your tab. Nothing else.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pick a few feeds to get started' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start empty' }).click();

  // Main view, no feeds subscribed → the "No feeds yet" empty state.
  await expect(
    page.getByRole('heading', { name: 'No feeds yet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add your first feed' }),
  ).toBeVisible();
});

test('adding a feed during onboarding fills the grid with its items', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);

  // Newest fixture item first; the grid is populated from the subscribed feed.
  await expect(page.getByText('E2E Item 9')).toBeVisible();
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(10);
});
