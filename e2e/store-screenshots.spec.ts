// Chrome Web Store screenshot capture. This is not a normal test: it drives the
// real built extension through the e2e harness, then mounts each capture inside
// a mock browser window (see frame.ts) and saves the 1280x800 store PNGs into
// `docs/store/`. It stays out of CI: every test skips unless CAPTURE=1 is set.
//
// Run it with `pnpm screenshots` (builds the e2e extension first, then captures).
// Unlike the rest of the suite, the grid shots onboard with the real starter
// feeds and let the worker fetch them live, so the store images show actual
// articles and real cover art rather than fixtures. That means these shots need
// a network connection and are not bit-for-bit reproducible; re-run when the
// listing needs a refresh.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { renderFramedShot } from './frame';
import {
  badgeText,
  openHeaderMenu,
  openNewTab,
  openPopup,
  tabIdForUrl,
  waitForDiscoveryRegistered,
} from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../docs/store');
const SIZE = { width: 1280, height: 800 } as const;
// The grid shots wait for at least this many real items to land before firing,
// so the page is comfortably full rather than half-loaded.
const MIN_ITEMS = 16;

/** A raw viewport capture, base64-encoded for embedding in the frame HTML. */
async function captureBase64(page: Page): Promise<string> {
  const buf = await page.screenshot();
  return buf.toString('base64');
}

test.describe('store screenshots', () => {
  // Only run under `pnpm screenshots`; a plain `pnpm test:e2e` skips the whole file.
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture store screenshots');
  // Fetching the real starter feeds over the network takes longer than a normal
  // test, so give each shot a generous budget.
  test.describe.configure({ timeout: 150_000 });

  test.beforeAll(() => mkdirSync(outDir, { recursive: true }));

  /**
   * Complete first-run onboarding the way a real user does: leave the curated
   * starter feeds checked and click "Start reading". The worker then fetches
   * them live, so the grid fills with real articles and real cover art.
   */
  async function onboardWithStarterFeeds(page: Page) {
    await expect(
      page.getByRole('button', { name: /Start reading/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Start reading/ }).click();
    await expect(
      page.getByRole('button', { name: 'Refresh feeds' }),
    ).toBeVisible({ timeout: 60_000 });
  }

  /**
   * Wait for a comfortably full grid, then let its covers settle. Real feeds
   * trickle in as the worker fetches them, and some covers 404 or hotlink-block;
   * `img.complete` flips true either way, and a failed cover falls back to the
   * generated placeholder, so nothing ever renders half-loaded.
   */
  async function waitForGrid(page: Page) {
    await expect
      .poll(() => page.locator('[data-slot="item-card"]').count(), {
        timeout: 60_000,
      })
      .toBeGreaterThanOrEqual(MIN_ITEMS);
    // Wait for covers to settle, but never block the shot on one hung request:
    // proceed once nearly all have finished, or after the budget elapses. A
    // cover that fails outright falls back to the placeholder anyway.
    await page
      .waitForFunction(
        () => {
          const imgs = [
            ...document.querySelectorAll<HTMLImageElement>(
              '[data-slot="item-card"] img',
            ),
          ];
          const done = imgs.filter((img) => img.complete).length;
          return imgs.length > 0 && done / imgs.length >= 0.95;
        },
        undefined,
        { timeout: 25_000 },
      )
      .catch(() => {});
    // A short settle so late covers, gradients, and text have painted.
    await page.waitForTimeout(1200);
  }

  test('01 + 02—populated grid, light and dark', async ({
    context,
    extensionId,
  }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await onboardWithStarterFeeds(page);
    await waitForGrid(page);

    await renderFramedShot(context, resolve(outDir, '01-newtab-light.png'), {
      innerPngBase64: await captureBase64(page),
      theme: 'light',
      headline: { base: 'Every new tab is', accent: 'your reading list' },
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await waitForGrid(page);
    await renderFramedShot(context, resolve(outDir, '02-newtab-dark.png'), {
      innerPngBase64: await captureBase64(page),
      theme: 'dark',
      headline: { base: 'Comfortable in', accent: 'light or dark' },
    });
  });

  test('03—first-run onboarding', async ({ context, extensionId }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(
      page.getByRole('heading', { name: 'Pick a few feeds to get started' }),
    ).toBeVisible();
    // Each row shows the source's favicon, fetched live from the site. Wait for
    // every one to finish loading (or exhaust its fallback chain) so the shot
    // isn't missing icons; the only <img>s on this screen are those favicons.
    await page
      .waitForFunction(
        () => {
          const imgs = [...document.querySelectorAll('img')];
          return imgs.length > 0 && imgs.every((img) => img.complete);
        },
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(500);

    await renderFramedShot(context, resolve(outDir, '03-onboarding.png'), {
      innerPngBase64: await captureBase64(page),
      theme: 'light',
      headline: { base: 'Start with', accent: 'a few good feeds' },
    });
  });

  test('04—feed discovery popup', async ({
    context,
    extensionId,
    background,
  }) => {
    await waitForDiscoveryRegistered(background);

    // Discover a feed on a real site so the popup shows a genuine source, not a
    // fixture. jvns.ca advertises an Atom feed in its <head>.
    const pageTab = await context.newPage();
    await pageTab.setViewportSize(SIZE);
    await pageTab.goto('https://jvns.ca/', { waitUntil: 'domcontentloaded' });
    const tabId = await tabIdForUrl(background, pageTab.url());

    // The action badge lights up once the content script has scanned the page
    // and registered its feed; wait for that so the popup opens populated.
    await expect
      .poll(() => badgeText(background, tabId), { timeout: 30_000 })
      .not.toBe('');

    const popup = await openPopup(context, extensionId, tabId);
    await popup.emulateMedia({ colorScheme: 'light' });
    await expect(popup.getByRole('button', { name: 'Subscribe' })).toBeVisible({
      timeout: 15_000,
    });
    await popup.waitForTimeout(400);

    // Capture the popup card on its own and the page behind it, then composite:
    // the page becomes a dimmed backdrop and the popup floats under the toolbar
    // icon, the way the extension actually presents it.
    const popupShot = (await popup.locator('#root > div').first().screenshot())
      .toString('base64');
    await pageTab.waitForTimeout(400);
    const backdrop = await captureBase64(pageTab);

    await renderFramedShot(context, resolve(outDir, '04-discovery.png'), {
      innerPngBase64: backdrop,
      overlayPngBase64: popupShot,
      theme: 'light',
      url: 'jvns.ca',
      headline: { base: 'Subscribe', accent: 'right from the page' },
    });
  });

  test('05—manage feeds dialog', async ({ context, extensionId }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await onboardWithStarterFeeds(page);
    await waitForGrid(page);

    await openHeaderMenu(page, 'Manage feeds');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Manage feeds' }),
    ).toBeVisible();
    await page.waitForTimeout(300);

    await renderFramedShot(context, resolve(outDir, '05-manage-feeds.png'), {
      innerPngBase64: await captureBase64(page),
      theme: 'light',
      headline: { base: 'Every feed', accent: 'under your control' },
    });
  });
});
