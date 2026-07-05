import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // `node` avoids the known WxtVitest + jsdom friction (wxt#1575). Component
    // tests (Phase 2) will run separately in Vitest browser mode.
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.output/**', '.wxt/**'],
  },
});
