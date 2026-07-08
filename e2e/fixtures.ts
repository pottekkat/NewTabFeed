import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer, type FixtureServer } from './server';

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, '../dist/chrome-mv3');

// Chrome/Edge removed the extension-loading flags, so e2e depends on
// Playwright's bundled Chromium (`channel: 'chromium'`) plus a persistent
// context. `pnpm test:e2e` runs the WXT_E2E build first to produce the directory
// below (that build grants `<all_urls>` at install so the worker can fetch feeds
// and the discovery script registers without a native permission prompt, which
// Playwright can't drive).
//
// Fixtures are test-scoped, so every test gets a brand-new persistent profile —
// a clean IndexedDB and unset settings (onboarding starts fresh)—and its own
// fixture server on a fresh port.
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  background: Worker;
  server: FixtureServer;
}>({
  context: async ({}, use) => {
    if (!existsSync(extensionPath)) {
      throw new Error(
        `Built extension not found at ${extensionPath}. Run \`pnpm build:e2e\` first (\`pnpm test:e2e\` does this automatically).`,
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
  background: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    await use(worker);
  },
  extensionId: async ({ background }, use) => {
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
  server: async ({}, use) => {
    const server = await startFixtureServer();
    await use(server);
    await server.close();
  },
});

export const expect = test.expect;
