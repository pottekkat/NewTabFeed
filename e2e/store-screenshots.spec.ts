// Chrome Web Store screenshot capture. This is not a normal test—it drives the
// real built extension through the e2e harness and saves 1280×800 PNGs into
// `docs/store/`. It stays out of CI: every test skips unless CAPTURE=1 is set.
//
// Run it with `pnpm screenshots` (builds the e2e extension first, then captures).
// The images use the local fixture feeds under `/capture/*`—no real sites are
// ever fetched, so the grid is reproducible and safe to commit.

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  openHeaderMenu,
  openNewTab,
  openPopup,
  tabIdForUrl,
  waitForDiscoveryRegistered,
} from './helpers';
import { CAPTURE_FEEDS } from './server';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../docs/store');
const SIZE = { width: 1280, height: 800 } as const;
const TOTAL_ITEMS = CAPTURE_FEEDS.reduce((n, f) => n + f.items.length, 0);

test.describe('store screenshots', () => {
  // Only run under `pnpm screenshots`; a plain `pnpm test:e2e` skips the whole file.
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to capture store screenshots');

  test.beforeAll(() => mkdirSync(outDir, { recursive: true }));

  /**
   * Complete onboarding subscribing to every capture feed: uncheck the starter
   * feeds (so no real site is fetched), add each fixture URL, start reading.
   */
  async function onboardWithCaptureFeeds(page: Page, base: string) {
    const checked = page.locator('input[type="checkbox"]:checked');
    await expect(checked).not.toHaveCount(0);
    while ((await checked.count()) > 0) await checked.first().uncheck();

    for (const feed of CAPTURE_FEEDS) {
      await page
        .getByLabel('Add your own feed URL')
        .fill(`${base}${feed.path}`);
      await page.getByRole('button', { name: 'Add' }).click();
    }
    await page.getByRole('button', { name: /Start reading/ }).click();
    await expect(
      page.getByRole('button', { name: 'Refresh feeds' }),
    ).toBeVisible({ timeout: 30_000 });
  }

  /** Wait until every card image (covers) has finished loading. */
  async function waitForCovers(page: Page) {
    await expect(page.locator('[data-slot="item-card"]')).toHaveCount(
      TOTAL_ITEMS,
      { timeout: 30_000 },
    );
    await page.waitForFunction(() => {
      const imgs = [
        ...document.querySelectorAll<HTMLImageElement>(
          '[data-slot="item-card"] img',
        ),
      ];
      return imgs.length > 0 && imgs.every((img) => img.complete);
    });
    // A short settle so gradients and text have painted before the shot.
    await page.waitForTimeout(400);
  }

  test('01 + 02—populated grid, light and dark', async ({
    context,
    extensionId,
    server,
  }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await onboardWithCaptureFeeds(page, server.url);
    await waitForCovers(page);

    await page.screenshot({ path: resolve(outDir, '01-newtab-light.png') });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await waitForCovers(page);
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
    server,
  }) => {
    await waitForDiscoveryRegistered(background);

    const pageUrl = `${server.url}/page-with-feed.html`;
    const pageTab = await context.newPage();
    await pageTab.goto(pageUrl);
    const tabId = await tabIdForUrl(background, pageUrl);

    const popup = await openPopup(context, extensionId, tabId);
    await popup.setViewportSize(SIZE);
    await popup.emulateMedia({ colorScheme: 'light' });
    await expect(popup.getByText('E2E Fixture Feed')).toBeVisible();
    await expect(
      popup.getByRole('button', { name: 'Subscribe' }),
    ).toBeVisible();

    // The popup renders at its native 360px width. Center it on a soft branded
    // backdrop so the store shot reads as an intentional frame, not a stray
    // panel floating in the corner. This only restyles the surrounding page —
    // the popup UI itself is the real, unmodified extension popup.
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

  test('05—manage feeds dialog', async ({ context, extensionId, server }) => {
    const page = await openNewTab(context, extensionId);
    await page.setViewportSize(SIZE);
    await page.emulateMedia({ colorScheme: 'light' });
    await onboardWithCaptureFeeds(page, server.url);
    await waitForCovers(page);

    await openHeaderMenu(page, 'Manage feeds');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Manage feeds' }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(outDir, '05-manage-feeds.png') });
  });
});
