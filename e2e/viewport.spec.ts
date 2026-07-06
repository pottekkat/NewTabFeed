import { test, expect } from './fixtures';
import { openNewTab, onboardWithFeed } from './helpers';

/** Count cards sharing the topmost row — i.e. the grid's column count. */
function firstRowColumns(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-slot="item-grid"]');
    if (!grid) return 0;
    const cards = [
      ...grid.querySelectorAll<HTMLElement>('[data-slot="item-card"]'),
    ];
    if (cards.length === 0) return 0;
    const top = Math.min(...cards.map((c) => c.offsetTop));
    return cards.filter((c) => c.offsetTop === top).length;
  });
}

test('the grid reflows across the viewport matrix', async ({
  context,
  extensionId,
  server,
}, testInfo) => {
  const page = await openNewTab(context, extensionId);
  await onboardWithFeed(page, `${server.url}/rss.xml`);
  await expect(page.locator('[data-slot="item-card"]')).toHaveCount(10);

  const widths = [1920, 1280, 768, 375] as const;
  const columns: Record<number, number> = {};
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    columns[width] = await firstRowColumns(page);
    await page.screenshot({
      path: testInfo.outputPath(`viewport-${width}.png`),
      fullPage: false,
    });
  }

  // Wider viewports fit strictly more columns; the narrowest is a single column.
  expect(columns[1920]).toBeGreaterThan(columns[1280]);
  expect(columns[1280]).toBeGreaterThan(columns[768]);
  expect(columns[768]).toBeGreaterThan(columns[375]);
  expect(columns[375]).toBe(1);
});
