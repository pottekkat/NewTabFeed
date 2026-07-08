// Dynamic content-script registration.
//
// The discovery content script is deliberately NOT declared in the manifest:
// a manifest `content_scripts` entry matching `<all_urls>` would demand host
// access at install and trigger the broad-host warning we avoid (see the
// permission model in TODO.md). Instead the script is registered at runtime via
// the scripting API, but only once the user has granted `<all_urls>` (which
// onboarding does). Result: no content script—and no host warning—until the
// user opts in; automatic discovery on every page thereafter.

import { browser } from 'wxt/browser';
import { hasHostAccess } from '@/lib/permissions';

/** Stable id for our single registered content script. */
export const DISCOVERY_SCRIPT_ID = 'feed-discovery';

/**
 * Path of the emitted content-script bundle, relative to the extension root.
 * `entrypoints/content.ts` is built as a runtime-registered content script, so
 * WXT emits it here (see `content-scripts` out dir) but does NOT list it in the
 * manifest. Keep this in sync with the emitted asset.
 */
export const DISCOVERY_SCRIPT_FILE = 'content-scripts/content.js';

const REGISTERED_SCRIPT = {
  id: DISCOVERY_SCRIPT_ID,
  matches: ['<all_urls>'],
  js: [DISCOVERY_SCRIPT_FILE],
  runAt: 'document_idle' as const,
  persistAcrossSessions: true,
};

/** True when our discovery script is currently registered. */
export async function isDiscoveryRegistered(): Promise<boolean> {
  try {
    const scripts = await browser.scripting.getRegisteredContentScripts({
      ids: [DISCOVERY_SCRIPT_ID],
    });
    return scripts.length > 0;
  } catch {
    return false;
  }
}

/** Register the discovery script if not already registered. Idempotent. */
export async function registerDiscoveryScript(): Promise<void> {
  if (await isDiscoveryRegistered()) {
    return;
  }
  try {
    await browser.scripting.registerContentScripts([REGISTERED_SCRIPT]);
  } catch (err) {
    // A concurrent register (e.g. onInstalled + permissions.onAdded racing) can
    // report a duplicate id—that's the desired end state, so swallow it.
    if (!isDuplicateError(err)) {
      throw err;
    }
  }
}

/** Unregister the discovery script if present. Idempotent. */
export async function unregisterDiscoveryScript(): Promise<void> {
  try {
    await browser.scripting.unregisterContentScripts({
      ids: [DISCOVERY_SCRIPT_ID],
    });
  } catch {
    // Not registered → nothing to remove.
  }
}

/**
 * Bring registration in line with current host access: registered iff the user
 * has granted `<all_urls>`. Call on startup/install and on permission changes.
 */
export async function syncDiscoveryRegistration(): Promise<void> {
  if (await hasHostAccess()) {
    await registerDiscoveryScript();
  } else {
    await unregisterDiscoveryScript();
  }
}

function isDuplicateError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate|already registered/i.test(message);
}
