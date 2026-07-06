import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed } from './helpers';

// Cover images, generated placeholders, and excerpt suppression, verified through
// the full pipeline: the service worker fetches `/rich.xml` over HTTP from the
// fixture server, feedsmith parses + normalizes it (resolving a thumbnailUrl from
// media:thumbnail, an image enclosure, or the first inline content <img>), items
// land in IndexedDB, and the newtab page renders each card. Every card ends up in
// one of four states — real cover, or generated placeholder — with its excerpt
// either shown or structurally suppressed (link-only / metadata-only bodies).

test('an inline content image becomes the card cover', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rich.xml`);
  const card = (title: string) =>
    page.locator('[data-slot="item-card"]').filter({ hasText: title });

  await expect(
    card('Inline image cover').locator(`img[src="${server.url}/cover.png"]`),
  ).toBeVisible();
  await expect(
    card('Inline image cover').locator('[data-slot="cover-placeholder"]'),
  ).toHaveCount(0);
  await expect(
    card('Inline image cover').locator('[data-slot="item-excerpt"]'),
  ).toBeVisible();
});

test('a structured media:thumbnail becomes the card cover', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rich.xml`);
  const card = (title: string) =>
    page.locator('[data-slot="item-card"]').filter({ hasText: title });

  await expect(
    card('Structured media cover').locator(
      `img[src="${server.url}/cover.png"]`,
    ),
  ).toBeVisible();
  await expect(
    card('Structured media cover').locator('[data-slot="cover-placeholder"]'),
  ).toHaveCount(0);
  await expect(
    card('Structured media cover').locator('[data-slot="item-excerpt"]'),
  ).toBeVisible();
});

test('an item with no image shows a generated placeholder', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rich.xml`);
  const card = (title: string) =>
    page.locator('[data-slot="item-card"]').filter({ hasText: title });

  await expect(
    card('Plain text no image').locator('[data-slot="cover-placeholder"]'),
  ).toBeVisible();
  await expect(
    card('Plain text no image').locator(`img[src="${server.url}/cover.png"]`),
  ).toHaveCount(0);
  await expect(
    card('Plain text no image').locator('[data-slot="item-excerpt"]'),
  ).toBeVisible();
});

test('a link-only aggregator body is suppressed (placeholder, no excerpt)', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rich.xml`);
  const card = (title: string) =>
    page.locator('[data-slot="item-card"]').filter({ hasText: title });

  await expect(
    card('Link-only aggregator').locator('[data-slot="cover-placeholder"]'),
  ).toBeVisible();
  await expect(
    card('Link-only aggregator').locator('[data-slot="item-excerpt"]'),
  ).toHaveCount(0);
});
