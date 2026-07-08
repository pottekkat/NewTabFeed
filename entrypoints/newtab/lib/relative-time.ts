// Compact relative-time formatting ("just now", "5m", "3h", "2d", "4w").
//
// Deliberately tiny and dependency-free—a full date library is overkill for a
// handful of coarse buckets, and the new tab is rendered dozens of times a day
// so we keep the render path cheap. Future timestamps (clock skew between the
// user's machine and a feed) collapse to "just now" rather than showing "-3m".

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Format an epoch-ms timestamp as a short relative label, relative to `now`
 * (defaults to the current time). Anything older than ~a year is shown as a
 * plain year count ("2y").
 */
export function relativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diff = now - timestamp;

  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  if (diff < 52 * WEEK) return `${Math.floor(diff / WEEK)}w`;
  return `${Math.floor(diff / (52 * WEEK))}y`;
}

/**
 * A fuller, human-readable timestamp for tooltips (e.g. the card's `title`
 * attribute), using the user's locale.
 */
export function absoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
