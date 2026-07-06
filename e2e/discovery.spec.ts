import { test, expect } from './fixtures';
import {
  openPopup,
  tabIdForUrl,
  badgeText,
  waitForDiscoveryRegistered,
} from './helpers';

test('an advertised feed lights the badge and subscribes from the popup', async ({
  context,
  extensionId,
  background,
  server,
}) => {
  await waitForDiscoveryRegistered(background);

  const pageUrl = `${server.url}/page-with-feed.html`;
  const pageTab = await context.newPage();
  await pageTab.goto(pageUrl);
  const tabId = await tabIdForUrl(background, pageUrl);

  // The content script found one advertised feed → the badge shows "1".
  await expect.poll(() => badgeText(background, tabId)).toBe('1');

  const popup = await openPopup(context, extensionId, tabId);
  await expect(popup.getByText('E2E Fixture Feed')).toBeVisible();
  await popup.getByRole('button', { name: 'Subscribe' }).click();
  await expect(popup.getByText('Subscribed')).toBeVisible();
});

test('a plain page offers a probe that finds a well-known feed', async ({
  context,
  extensionId,
  background,
  server,
}) => {
  await waitForDiscoveryRegistered(background);

  const pageUrl = `${server.url}/page-plain.html`;
  const pageTab = await context.newPage();
  await pageTab.goto(pageUrl);
  const tabId = await tabIdForUrl(background, pageUrl);

  // No advertised feed → the badge stays empty.
  await expect.poll(() => badgeText(background, tabId)).toBe('');

  const popup = await openPopup(context, extensionId, tabId);
  await expect(
    popup.getByText('No feed advertised on this page.'),
  ).toBeVisible();

  // Probing the origin hits a conventional location (/rss) and surfaces a feed.
  await popup.getByRole('button', { name: 'Check for RSS feeds' }).click();
  const subscribe = popup.getByRole('button', { name: 'Subscribe' }).first();
  await expect(subscribe).toBeVisible();
  await subscribe.click();
  await expect(popup.getByText('Subscribed').first()).toBeVisible();
});
