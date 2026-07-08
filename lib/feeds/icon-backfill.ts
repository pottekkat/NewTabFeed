// Favicon backfill pass—runs in the service worker.
//
// Icon resolution normally happens coupled to feed fetching (subscribe, and the
// `updated` branch of refreshFeed). That leaves gaps: a feed added before icon
// caching existed, or one whose single resolution attempt failed transiently
// under onboarding load, keeps an empty or remote `iconUrl` forever and shows a
// generic globe.
//
// This is a SEPARATE, budgeted pass invoked AFTER refresh/subscribe/import
// (never inside a per-feed refresh, which already nears the 30s SW-kill window).
// It picks a bounded batch of feeds still missing a cached `data:` icon and
// re-runs resolution for each. Because it runs every cycle, it self-heals:
// whatever it can't finish or resolve in one pass gets another shot next time.
//
// Best-effort throughout: `resolveAndCacheIcon` already self-bounds at ~6s and
// never throws, and one feed's failure never aborts the pass.

import { assertHostAccess, NoHostPermissionError } from '@/lib/permissions';
import { listFeeds, upsertFeed } from '@/lib/db';
import { resolveAndCacheIcon } from '@/lib/feeds/favicon';

/** Max feeds re-resolved per pass—keeps the batch well under the SW budget. */
const DEFAULT_MAX_FEEDS = 10;
/** Concurrent icon resolutions. */
const DEFAULT_CONCURRENCY = 4;

export interface IconBackfillOptions {
  /** Max feeds to re-resolve this pass. Default 10. */
  maxFeeds?: number;
  /** Max concurrent icon resolutions. Default 4. */
  concurrency?: number;
}

/**
 * Re-resolve icons for a bounded batch of feeds that still lack a cached `data:`
 * icon. No-ops (returns `changed:false`) when host access is missing or no feed
 * needs one. Returns `changed:true` only when at least one feed actually gained
 * a cached icon—so the caller can decide whether to re-broadcast. A single
 * feed's failure never aborts the pass.
 *
 * The bounds (10 feeds at concurrency 4 ≈ 3 waves, each resolution self-bounded
 * at ~6s) keep the whole pass safely under the 30s worker limit.
 */
export async function backfillFeedIcons(
  options: IconBackfillOptions = {},
): Promise<{ changed: boolean }> {
  const { maxFeeds = DEFAULT_MAX_FEEDS, concurrency = DEFAULT_CONCURRENCY } =
    options;

  try {
    await assertHostAccess();
  } catch (err) {
    if (err instanceof NoHostPermissionError) {
      // Backfill is best-effort—silently stand down when we can't fetch.
      return { changed: false };
    }
    throw err;
  }

  const feeds = await listFeeds();
  const candidates = feeds
    .filter((feed) => !feed.iconUrl?.startsWith('data:'))
    .slice(0, maxFeeds);
  if (candidates.length === 0) {
    return { changed: false };
  }

  let changed = false;

  // Bounded worker pool over the candidate array (no external deps). One feed's
  // failure is swallowed and never aborts the others.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const feed = candidates[next++];
      let iconUrl: string | undefined;
      try {
        iconUrl = await resolveAndCacheIcon({
          siteUrl: feed.siteUrl,
          feedIconUrl: feed.iconUrl,
        });
      } catch {
        // resolveAndCacheIcon is already best-effort, but stay defensive.
        iconUrl = undefined;
      }
      if (!iconUrl?.startsWith('data:')) {
        continue;
      }
      try {
        await upsertFeed({ ...feed, iconUrl });
        changed = true;
      } catch {
        // A single feed's DB write failing must not sink the pass.
        continue;
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
