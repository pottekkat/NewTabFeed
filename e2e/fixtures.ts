import { test as base, chromium, type BrowserContext } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../.output/chrome-mv3');

// Chrome/Edge removed the extension-loading flags, so e2e depends on
// Playwright's bundled Chromium (`channel: 'chromium'`) plus a persistent
// context. `pnpm test:e2e` runs `wxt build` first to produce the directory
// below.
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    if (!existsSync(extensionPath)) {
      throw new Error(
        `Built extension not found at ${extensionPath}. Run \`pnpm build\` first (\`pnpm test:e2e\` does this automatically).`,
      );
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    const extensionId = worker.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
