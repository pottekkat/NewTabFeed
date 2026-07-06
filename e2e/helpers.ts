// Shared e2e actions and small utilities, kept out of the specs so each spec
// reads as a flow rather than a pile of selectors.

import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect } from './fixtures';

/** Open the extension's new tab page. */
export async function openNewTab(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);
  return page;
}

/** Open the discovery popup as a regular tab, optionally bound to a page tab. */
export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  tabId?: number,
): Promise<Page> {
  const page = await context.newPage();
  const suffix = tabId === undefined ? '' : `?tabId=${tabId}`;
  await page.goto(`chrome-extension://${extensionId}/popup.html${suffix}`);
  return page;
}

/**
 * Complete onboarding by subscribing to exactly `feedUrl`: unchecks the
 * pre-selected starter feeds (so we don't fetch real sites), types the fixture
 * URL, and clicks "Start reading". Host access is pre-granted by the e2e build,
 * so no permission dialog appears. Resolves once the main view is showing.
 */
export async function onboardWithFeed(
  page: Page,
  feedUrl: string,
): Promise<void> {
  // Uncheck every pre-selected starter feed so onboarding only subscribes to the
  // fixture (never a real site). First wait for onboarding to hydrate with its
  // pre-checked starters — counting before they render would uncheck nothing and
  // leave real feeds selected. Re-query the shrinking `:checked` set each loop.
  const checked = page.locator('input[type="checkbox"]:checked');
  await expect(checked).not.toHaveCount(0);
  while ((await checked.count()) > 0) {
    await checked.first().uncheck();
  }

  await page.getByLabel('Add your own feed URL').fill(feedUrl);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: /Start reading/ }).click();

  // Onboarding gives way to the main view's header once feeds are stored. Allow
  // extra time: the first onboarding in a cold browser waits on the service
  // worker waking to handle the subscribe (host access + first fetch).
  await expect(page.getByRole('button', { name: 'Refresh feeds' })).toBeVisible(
    {
      timeout: 20_000,
    },
  );
}

/** Find the Chrome tab id for an open page by its URL, via the service worker. */
export async function tabIdForUrl(
  background: Worker,
  url: string,
): Promise<number> {
  const id = await background.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === u)?.id;
  }, url);
  if (id === undefined) throw new Error(`No tab found for ${url}`);
  return id;
}

/** Read the action badge text for a tab, via the service worker. */
export function badgeText(background: Worker, tabId: number): Promise<string> {
  return background.evaluate(
    (id) => chrome.action.getBadgeText({ tabId: id }),
    tabId,
  );
}

/**
 * Wait until the discovery content script is registered. The background worker
 * registers it on install (host access is present in the e2e build), but that's
 * async — pages opened before it lands won't be scanned.
 */
export async function waitForDiscoveryRegistered(
  background: Worker,
): Promise<void> {
  await expect
    .poll(
      () =>
        background.evaluate(() =>
          chrome.scripting
            .getRegisteredContentScripts()
            .then((scripts) => scripts.map((s) => s.id)),
        ),
      { timeout: 15_000 },
    )
    .toContain('feed-discovery');
}

/** Open the header "More options" menu and pick an item by its accessible name. */
export async function openHeaderMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
