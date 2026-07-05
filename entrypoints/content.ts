import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import { scanForFeeds } from '@/lib/discovery/scan';
import type { FeedsFoundMessage } from '@/lib/messages';

// Feed autodiscovery content script.
//
// Registration is 'runtime', NOT manifest: WXT emits this as a standalone
// bundle and the background worker registers it via the scripting API only after
// the user grants host access (see lib/discovery/registration.ts). That keeps
// `<all_urls>` an optional permission and avoids the install-time host warning.
//
// This script only READS the DOM (link[rel=alternate] feed tags) and messages
// the worker — it never fetches (page CORS would block it; the worker fetches
// with host access). The worker keys results by sender.tab.id and lights up the
// action badge.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    const feeds = scanForFeeds(document, location.href);
    const message: FeedsFoundMessage = {
      type: 'feeds-found',
      feeds,
      pageUrl: location.href,
    };
    // Fire-and-forget. Rejects only if the worker is unreachable (e.g. extension
    // reloading) — harmless to ignore.
    void browser.runtime.sendMessage(message).catch(() => {});
  },
});
