import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';

// Smoke test: proves the WxtVitest + fakeBrowser harness is wired up and that
// extension storage behaves. Real domain tests land in Phase 1.
describe('browser.storage.local', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips a value', async () => {
    await browser.storage.local.set({ hello: 'world' });
    const result = await browser.storage.local.get('hello');
    expect(result).toEqual({ hello: 'world' });
  });

  it('is empty after reset', async () => {
    await browser.storage.local.set({ leftover: true });
    fakeBrowser.reset();
    const all = await browser.storage.local.get(null);
    expect(all).toEqual({});
  });
});
