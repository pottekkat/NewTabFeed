// OPML import/export via feedsmith's OPML functions.
//
// OPML is how users own their data—export to leave, import to arrive. We
// flatten nested folders on import (NewTabFeed has no folder concept) and dedupe
// by canonical feed URL. Export produces a flat OPML 2.0 document.

import { generateOpml, parseOpml } from 'feedsmith';
import type { Feed } from '@/lib/types';
import { canonicalizeUrl, resolveUrl } from '@/lib/url';
import {
  subscribe,
  AlreadySubscribedError,
  type SubscribeResult,
} from '@/lib/feeds/refresh';

/** A subscription parsed out of an OPML document. */
export interface OpmlEntry {
  /** Canonical feed URL (xmlUrl). */
  url: string;
  /** Display title, when the OPML provides one. */
  title?: string;
  /** Site/home URL (htmlUrl), when present. */
  siteUrl?: string;
}

/**
 * Serialize feeds to an OPML 2.0 document string. Each feed becomes an
 * `<outline type="rss">` with `xmlUrl`, `htmlUrl`, `title`, and `text`.
 */
export function exportOpml(feeds: Feed[]): string {
  return generateOpml(
    {
      head: { title: 'NewTabFeed subscriptions' },
      body: {
        outlines: feeds.map((feed) => {
          const label = feed.customTitle?.trim() || feed.title;
          return {
            text: label,
            title: label,
            type: 'rss',
            xmlUrl: feed.url,
            ...(feed.siteUrl ? { htmlUrl: feed.siteUrl } : {}),
          };
        }),
      },
    },
    // Lenient mode accepts our partial outline objects and string dates.
    { lenient: true },
  );
}

/**
 * Parse an OPML document into a flat, deduped list of subscriptions. Nested
 * folders are flattened; outlines without an `xmlUrl` (pure folders, comments)
 * are dropped. URLs are canonicalized so duplicates collapse. Throws if the
 * document can't be parsed as OPML.
 */
export function parseOpmlDocument(xml: string): OpmlEntry[] {
  const doc = parseOpml(xml);
  const seen = new Set<string>();
  const out: OpmlEntry[] = [];

  type OutlineLike = {
    xmlUrl?: string;
    htmlUrl?: string;
    title?: string;
    text?: string;
    outlines?: OutlineLike[];
  };

  const walk = (outlines: OutlineLike[] | undefined): void => {
    for (const outline of outlines ?? []) {
      if (outline.xmlUrl) {
        let url: string;
        try {
          url = canonicalizeUrl(outline.xmlUrl);
        } catch {
          continue; // Skip malformed URLs rather than aborting the whole import.
        }
        if (!seen.has(url)) {
          seen.add(url);
          out.push({
            url,
            title: outline.title ?? outline.text,
            siteUrl: resolveUrl(outline.htmlUrl, url),
          });
        }
      }
      // Folders can nest arbitrarily deep—recurse regardless.
      walk(outline.outlines);
    }
  };

  walk(doc.body?.outlines as OutlineLike[] | undefined);
  return out;
}

export interface ImportOpmlResult {
  /** Feeds successfully subscribed. */
  added: SubscribeResult[];
  /** Feeds that were already subscribed (canonical URL match). */
  skippedDuplicates: OpmlEntry[];
  /** Feeds that failed to subscribe, with the reason. */
  failed: Array<{ entry: OpmlEntry; message: string }>;
}

/**
 * Import an OPML document: subscribe to every feed it lists, tolerant of
 * individual failures. Already-subscribed feeds are counted as duplicates, not
 * errors. Runs sequentially to keep the (network-bound) work gentle and its
 * accounting simple.
 */
export async function importOpml(xml: string): Promise<ImportOpmlResult> {
  const entries = parseOpmlDocument(xml);
  const result: ImportOpmlResult = {
    added: [],
    skippedDuplicates: [],
    failed: [],
  };

  for (const entry of entries) {
    try {
      result.added.push(await subscribe(entry.url));
    } catch (err) {
      if (err instanceof AlreadySubscribedError) {
        result.skippedDuplicates.push(entry);
      } else {
        result.failed.push({
          entry,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return result;
}
