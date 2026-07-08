// Chrome Web Store screenshot capture. This is not a normal test—it drives the
// real built extension through the e2e harness and saves 1280×800 PNGs into
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

    await page.screenshot({ path: resolve(outDir, '01-newtab-light.png') });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await waitForGrid(page);
    await page.screenshot({ path: resolve(outDir, '02-newtab-dark.png') });
  });

  test('03—first-run onboarding', async ({ context, extensionId }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(
      page.getByRole('heading', { name: 'Pick a few feeds to get started' }),
    ).toBeVisible();
    // Favicons load best-effort; give them a moment, then shoot.
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(outDir, '03-onboarding.png') });
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
    await pageTab.goto('https://jvns.ca/', { waitUntil: 'domcontentloaded' });
    const tabId = await tabIdForUrl(background, pageTab.url());

    // The action badge lights up once the content script has scanned the page
    // and registered its feed; wait for that so the popup opens populated.
    await expect
      .poll(() => badgeText(background, tabId), { timeout: 30_000 })
      .not.toBe('');

    const popup = await openPopup(context, extensionId, tabId);
    await popup.setViewportSize(SIZE);
    await popup.emulateMedia({ colorScheme: 'light' });
    await expect(popup.getByRole('button', { name: 'Subscribe' })).toBeVisible({
      timeout: 15_000,
    });

    // The popup renders at its native 360px width. Center it on a soft branded
    // backdrop so the store shot reads as an intentional frame, not a stray
    // panel floating in the corner. This only restyles the surrounding
    // page—the popup UI itself is the real, unmodified extension popup.
    await popup.addStyleTag({
      content: `
        html, body { height: 100%; }
        body {
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 28% 22%, rgba(249,115,22,0.14), transparent 55%),
            radial-gradient(circle at 82% 80%, rgba(249,115,22,0.10), transparent 55%),
            var(--background, #ffffff);
        }
        #root > div {
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
          border: 1px solid rgba(15, 23, 42, 0.08);
        }
      `,
    });
    await popup.waitForTimeout(300);
    await popup.screenshot({ path: resolve(outDir, '04-discovery.png') });
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
    await page.screenshot({ path: resolve(outDir, '05-manage-feeds.png') });
  });
});
