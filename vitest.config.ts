import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';

// Repo root, for the `@` path alias in the browser project (which doesn't run
// the WXT plugin—see below).
const repoRoot = fileURLToPath(new URL('.', import.meta.url)).replace(
  /\/$/,
  '',
);

// Resolve WXT's `#imports` virtual module to an inert stub in the browser
// project. Component tests mock the modules that actually use extension storage,
// so `#imports` is never executed there—but Vite still pre-transforms files
// that reference it (reached via type-only imports), which would otherwise log a
// resolve error. The stub just needs to resolve; its contents never run.
const STUB_ID = '\0wxt-imports-stub';
function stubWxtImports() {
  return {
    name: 'stub-wxt-imports',
    resolveId(id: string) {
      return id === '#imports' ? STUB_ID : null;
    },
    load(id: string) {
      if (id !== STUB_ID) return null;
      return `export const storage = { defineItem: () => ({
        getValue: async () => undefined,
        setValue: async () => {},
        watch: () => () => {},
      }) };`;
    },
  };
}

// Two projects:
//
// - `node` —the fast, headless default (`pnpm test`, CI). Pure logic and
//   worker-side domain tests, with the WXT test plugin (fakeBrowser, `#imports`,
//   aliases). `node` env avoids the WxtVitest + jsdom friction (wxt#1575).
//   Browser-only specs (`*.browser.test.*`) are excluded here.
//
// - `browser`—React component tests + the DOMPurify-backed excerpt util, in
//   real Chromium via Playwright (`pnpm test:components`). WxtVitest's setup
//   module can't load in browser mode, so this project omits it and instead
//   provides the `@` alias directly; component tests mock the few modules that
//   reach for extension APIs (`wxt/browser`, `#imports`) at their boundaries.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [WxtVitest()],
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.{test,spec}.{ts,tsx}'],
          exclude: [
            'e2e/**',
            'node_modules/**',
            'dist/**',
            '.wxt/**',
            '**/*.browser.test.{ts,tsx}',
          ],
        },
      },
      {
        plugins: [stubWxtImports()],
        resolve: {
          alias: { '@': repoRoot },
          // Force a single React instance so components, lucide-react, and the
          // test renderer share one hook dispatcher (avoids "useContext of null").
          dedupe: ['react', 'react-dom'],
        },
        // vitest-browser-react hooks into the live Vitest runner via its `vitest`
        // import; pre-bundling it would snapshot a different instance and break
        // the runner lookup. Keep it un-optimized, but pre-bundle react-dom so
        // its CJS default export is interop-synthesized for the un-optimized
        // consumer.
        optimizeDeps: {
          exclude: ['vitest-browser-react'],
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
          ],
        },
        test: {
          name: 'browser',
          include: ['**/*.browser.test.{ts,tsx}'],
          exclude: ['node_modules/**', 'dist/**', '.wxt/**'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
