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
    permissions: ['storage', 'alarms', 'unlimitedStorage', 'favicon', 'tabs'],
    optional_host_permissions: ['<all_urls>'],
    action: {},
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
