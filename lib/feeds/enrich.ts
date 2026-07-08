// Link-preview enrichment pass — runs in the service worker.
//
// A SEPARATE, budgeted pass invoked AFTER refresh/subscribe (never inside a
// per-feed refresh, which already nears the 30s SW-kill window). It picks a
// bounded batch of items that lack a cover and/or a usable excerpt, fetches
// each linked article once, and fills the gaps from its Open Graph / Twitter
// Card metadata. Every attempted item is stamped `previewFetchedAt` so it is
// never retried, whether or not anything was found.

import { fetchLinkPreviews } from '@/lib/settings';
import { assertHostAccess, NoHostPermissionError } from '@/lib/permissions';
import { itemsNeedingPreview, applyPreview } from '@/lib/db';
import {
  fetchLinkPreview,
  summaryIsThin,
  type LinkPreview,
} from '@/lib/feeds/link-preview';

/** Max items enriched per pass — keeps the batch well under the SW budget. */
const DEFAULT_MAX_ITEMS = 16;
/** Concurrent article fetches. */
const DEFAULT_CONCURRENCY = 4;
/** Per-article fetch timeout. */
const DEFAULT_TIMEOUT_MS = 6000;

export interface EnrichOptions {
  /** Max items to enrich this pass. Default 16. */
  maxItems?: number;
  /** Max concurrent article fetches. Default 4. */
  concurrency?: number;
  /** Per-article fetch timeout in ms. Default 6000. */
  timeoutMs?: number;
}

/**
 * Enrich a bounded batch of items that need a cover and/or a real excerpt.
 * No-ops (returns `changed:false`) when the feature is off or host access is
 * missing. Returns `changed:true` only when at least one item actually GAINED a
 * thumbnail or summary — so the caller can decide whether to re-broadcast. A
 * single fetch's failure never aborts the pass.
 */
export async function enrichPendingPreviews(
  options: EnrichOptions = {},
): Promise<{ changed: boolean }> {
  const {
    maxItems = DEFAULT_MAX_ITEMS,
    concurrency = DEFAULT_CONCURRENCY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  if (!(await fetchLinkPreviews.getValue())) {
    return { changed: false };
  }

  try {
    await assertHostAccess();
  } catch (err) {
    if (err instanceof NoHostPermissionError) {
      // Enrichment is best-effort — silently stand down when we can't fetch.
      return { changed: false };
    }
    throw err;
  }

  const candidates = await itemsNeedingPreview(maxItems);
  if (candidates.length === 0) {
    return { changed: false };
  }

  let changed = false;

  // Bounded worker pool over the candidate array (no external deps). One fetch's
  // failure resolves to `{}` and never aborts the others.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const item = candidates[next++];
      let preview: LinkPreview;
      try {
        preview = await fetchLinkPreview(item.url, { timeoutMs });
      } catch {
        preview = {};
      }
      try {
        await applyPreview(item.id, {
          thumbnailUrl: preview.imageUrl,
          summaryHtml: preview.description,
          previewFetchedAt: Date.now(),
        });
      } catch {
        // A single item's DB write failing must not sink the pass.
        continue;
      }
      // "Gained" mirrors applyPreview's own fill rules against the pre-fetch snapshot.
      const gainedThumb = !item.thumbnailUrl && Boolean(preview.imageUrl);
      const gainedSummary =
        summaryIsThin(item.summaryHtml) && Boolean(preview.description);
      if (gainedThumb || gainedSummary) {
        changed = true;
      }
    }
  };

  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), candidates.length) },
    () => worker(),
  );
  await Promise.all(runners);

  return { changed };
}
