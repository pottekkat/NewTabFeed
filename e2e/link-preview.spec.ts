import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed } from './helpers';

// Link-preview enrichment, verified through the full pipeline. `/preview.xml`
// carries two items that both link at `/og-article` (a page advertising
// og:image + og:description). "Needs preview" ships no cover and a link-only
// (thin) body, so the service worker's enrichment pass—which runs AFTER
// subscribe/refresh and then re-broadcasts `feeds-updated`—must fetch the
// article and fill both the cover and the excerpt. "Has own cover" already has
// an inline image and real prose, so enrichment must leave it untouched. With
// the setting off, no item is enriched at all.

const card = (page: import('@playwright/test').Page, title: string) =>
  page.locator('[data-slot="item-card"]').filter({ hasText: title });

test('enrichment fills a missing cover and excerpt from the linked article', async ({
  context,
  extensionId,
  server,
}) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/preview.xml`);

  const needsPreview = card(page, 'Needs preview');

  // Enrichment is async (post-subscribe, then a re-broadcast), so the cover and
  // excerpt fill in progressively—allow a generous timeout.
  await expect(
    needsPreview.locator(`img[src="${server.url}/cover.png"]`),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    needsPreview.locator('[data-slot="cover-placeholder"]'),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(needsPreview.locator('[data-slot="item-excerpt"]')).toHaveText(
    'A rich summary mined from the linked article page.',
    { timeout: 15_000 },
  );

  // The item that already had its own cover is untouched by enrichment.
  await expect(
    card(page, 'Has own cover').locator(`img[src="${server.url}/cover.png"]`),
  ).toBeVisible();
});

test('with link previews off, the item is not enriched', async ({
  context,
  extensionId,
  background,
  server,
}) => {
  // Turn the setting off in the service worker's storage BEFORE onboarding, so
  // the subscribe-time enrichment pass stands down. `@wxt-dev/storage` maps the
  // `local:settings:fetchLinkPreviews` item to the chrome.storage.local key
  // `settings:fetchLinkPreviews`.
  await background.evaluate(() =>
    chrome.storage.local.set({ 'settings:fetchLinkPreviews': false }),
  );

  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/preview.xml`);

  // Force a full refresh and wait for it to finish. The toolbar button is
  // disabled for the whole `refresh-now` dispatch (refresh + the enrichment
  // pass), so waiting for it to re-enable is a real settle: if the feature were
  // on, the article would have been fetched and the card filled by now.
  const refresh = page.getByRole('button', { name: 'Refresh feeds' });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(refresh).toBeEnabled({ timeout: 15_000 });

  // Anchor on the item that carries its own cover so we know items rendered.
  await expect(
    card(page, 'Has own cover').locator(`img[src="${server.url}/cover.png"]`),
  ).toBeVisible();

  // "Needs preview" keeps its un-enriched state: generated placeholder, no cover
  // image, and no excerpt (its link-only body stays suppressed).
  const needsPreview = card(page, 'Needs preview');
  await expect(
    needsPreview.locator('[data-slot="cover-placeholder"]'),
  ).toBeVisible();
  await expect(
    needsPreview.locator(`img[src="${server.url}/cover.png"]`),
  ).toHaveCount(0);
  await expect(needsPreview.locator('[data-slot="item-excerpt"]')).toHaveCount(
    0,
  );
});
