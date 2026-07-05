// Host-permission helpers.
//
// Per the product's permission model, `<all_urls>` is an OPTIONAL host
// permission, requested ONCE at runtime the first time the user adds a feed
// (a single clean prompt) rather than demanded at install. Feeds are fetched
// from the service worker, which needs host access to bypass CORS.
//
// IMPORTANT: `browser.permissions.request()` must be called from a user gesture
// in a UI page (newtab/popup) — it will reject if called from the service
// worker or without a gesture. So `requestHostAccess()` is exported for Phase 2
// UI to call on the "add feed" click. The worker only ever *checks* access and
// surfaces a `NoHostPermissionError` when it's missing.

import { browser } from 'wxt/browser';

const HOST_PERMISSIONS = {
  origins: ['<all_urls>'],
};

/** Distinguishable error so the UI can prompt for host access instead of showing a generic failure. */
export class NoHostPermissionError extends Error {
  constructor(message = 'Host permission not granted') {
    super(message);
    this.name = 'NoHostPermissionError';
  }
}

/** True when the extension currently holds `<all_urls>` host access. */
export async function hasHostAccess(): Promise<boolean> {
  return browser.permissions.contains(HOST_PERMISSIONS);
}

/**
 * Request `<all_urls>` host access. MUST be called from a UI page during a user
 * gesture. Resolves to whether access was granted.
 */
export async function requestHostAccess(): Promise<boolean> {
  return browser.permissions.request(HOST_PERMISSIONS);
}

/** Throw `NoHostPermissionError` unless host access is currently granted. */
export async function assertHostAccess(): Promise<void> {
  if (!(await hasHostAccess())) {
    throw new NoHostPermissionError();
  }
}
