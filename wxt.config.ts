import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Build into a conventional, visible `dist/` (WXT defaults to hidden
  // `.output/`). Per-target builds land in `dist/chrome-mv3`; `wxt zip`
  // writes the package to `dist/`.
  outDir: 'dist',
  // Auto-imports are disabled deliberately: we use explicit imports from
  // '#imports' everywhere. It keeps the lint/typecheck story simple and makes
  // every dependency visible at the top of each file.
  imports: false,
  manifest: {
    name: 'NewTabFeed',
    description:
      'A local-first RSS reader in your new tab. Your feeds, on your device — no accounts, no cloud, no ads.',
    // `scripting` is needed to register the feed-discovery content script at
    // runtime (see lib/discovery/registration.ts). `<all_urls>` stays OPTIONAL
    // (below), granted once at onboarding — never required at install.
    permissions: [
      'storage',
      'alarms',
      'unlimitedStorage',
      'favicon',
      'tabs',
      'scripting',
    ],
    optional_host_permissions: ['<all_urls>'],
    action: {},
  },
  hooks: {
    // The discovery content script uses `registration: 'runtime'`, which makes
    // WXT add its `<all_urls>` match to `host_permissions` (a REQUIRED host
    // permission → install-time host warning). Our permission model keeps host
    // access optional and runtime-requested, so drop any required host
    // permissions WXT injected. `optional_host_permissions` is untouched.
    'build:manifestGenerated'(_wxt, manifest) {
      delete manifest.host_permissions;

      // E2E-only escape hatch. Playwright cannot click Chrome's native
      // optional-permission dialog, so the test build grants `<all_urls>` at
      // install time instead — letting the service worker fetch fixture feeds
      // and register the discovery content script without a runtime prompt.
      // Guarded by WXT_E2E so PRODUCTION builds keep host access optional and
      // runtime-requested (no host_permissions, no install-time host warning).
      // Re-added AFTER the delete above so it survives the neutralization.
      //
      // The overlapping `optional_host_permissions` must be dropped too: Chrome
      // treats a pattern listed as optional as ungranted-until-requested even
      // when it also appears in required `host_permissions`, so leaving it would
      // keep `<all_urls>` ungranted at install and defeat the whole point.
      if (process.env.WXT_E2E === 'true') {
        manifest.host_permissions = ['<all_urls>'];
        delete manifest.optional_host_permissions;
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
