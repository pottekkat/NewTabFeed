// Network fetch for feed documents — runs in the service worker only.
//
// MV3 hazards handled here:
// - A response that takes >30s kills the worker, so every request has an
//   AbortController timeout (default 20s).
// - Host access is optional and may be missing; we surface a distinguishable
//   NoHostPermissionError so the UI can prompt.
// - Conditional GET (ETag / Last-Modified) avoids re-downloading unchanged
//   feeds; a 304 short-circuits parsing entirely.
//
// A custom User-Agent is intentionally NOT set — extensions can't override it,
// and attempting to is a no-op.

import { assertHostAccess } from '@/lib/permissions';

const DEFAULT_TIMEOUT_MS = 20_000;

const ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7';

export interface FetchFeedOptions {
  /** Prior ETag for `If-None-Match`. */
  etag?: string;
  /** Prior Last-Modified for `If-Modified-Since`. */
  lastModified?: string;
  /** Abort signal to cancel externally (composed with the internal timeout). */
  signal?: AbortSignal;
  /** Override the request timeout. Default 20s. */
  timeoutMs?: number;
}

export type FetchFeedResult =
  | {
      /** Server said the feed is unchanged since our conditional headers. */
      status: 'not-modified';
    }
  | {
      status: 'ok';
      /** Raw response body (XML or JSON text) for the parser. */
      body: string;
      /** New ETag, if the server sent one. */
      etag?: string;
      /** New Last-Modified, if the server sent one. */
      lastModified?: string;
    };

/** Thrown for network failures and non-2xx (non-304) responses. */
export class FeedFetchError extends Error {
  /** HTTP status code, when the failure was an HTTP response. */
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FeedFetchError';
    this.status = status;
  }
}

/**
 * Fetch a feed with conditional-GET headers and a hard timeout.
 *
 * Requires host access (throws NoHostPermissionError otherwise). Returns a
 * `not-modified` marker on HTTP 304, or the body plus fresh validators on 2xx.
 */
export async function fetchFeed(
  url: string,
  options: FetchFeedOptions = {},
): Promise<FetchFeedResult> {
  await assertHostAccess();

  const {
    etag,
    lastModified,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Abort our request if the caller's signal fires.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const headers: Record<string, string> = { Accept: ACCEPT_HEADER };
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
      // Feeds are public documents; don't leak cookies/credentials.
      credentials: 'omit',
      cache: 'no-cache',
    });

    if (response.status === 304) {
      return { status: 'not-modified' };
    }
    if (!response.ok) {
      throw new FeedFetchError(
        `HTTP ${response.status} for ${url}`,
        response.status,
      );
    }
    const body = await response.text();
    return {
      status: 'ok',
      body,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    };
  } catch (err) {
    if (err instanceof FeedFetchError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FeedFetchError(
        `Timed out after ${timeoutMs}ms fetching ${url}`,
      );
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new FeedFetchError(`Network error fetching ${url}: ${reason}`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
