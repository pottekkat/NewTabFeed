import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
