import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAndCacheIcon } from '@/lib/feeds/favicon';

// Favicon resolution runs entirely in the worker and only ever touches the
// network via `fetch`. These tests stub the global `fetch` and never hit the
// real network.

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A successful image response carrying `bytes` under `mime`. */
function imageResponse(mime: string, bytes: Uint8Array) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': mime }),
    text: async () => '',
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

/** A successful HTML page (the homepage) carrying `html`. */
function htmlResponse(html: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => html,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** A 404 for anything not explicitly served. */
function notFound() {
  return {
    ok: false,
    status: 404,
    headers: new Headers(),
    text: async () => 'not found',
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** Base64 of the given bytes, computed the same way the module does. */
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('resolveAndCacheIcon', () => {
  it('parses an apple-touch-icon from the homepage and caches its bytes', async () => {
    const png = new Uint8Array([1, 2, 3, 4]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com') {
        return htmlResponse(
          `<head>
             <link rel="icon" href="/favicon-16.png">
             <link rel="apple-touch-icon" href="/touch.png">
           </head>`,
        );
      }
      if (url === 'https://example.com/touch.png') {
        return imageResponse('image/png', png);
      }
      return notFound();
    });

    const result = await resolveAndCacheIcon({
      siteUrl: 'https://example.com',
    });
    // apple-touch-icon is preferred over the plain icon.
    expect(result).toBe(`data:image/png;base64,${b64(png)}`);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/touch.png',
      expect.anything(),
    );
  });

  it('uses feedIconUrl first and skips the homepage fetch when it succeeds', async () => {
    const png = new Uint8Array([9, 8, 7]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://cdn.example.com/icon.png') {
        return imageResponse('image/png', png);
      }
      return notFound();
    });

    const result = await resolveAndCacheIcon({
      siteUrl: 'https://example.com',
      feedIconUrl: 'https://cdn.example.com/icon.png',
    });

    expect(result).toBe(`data:image/png;base64,${b64(png)}`);
    // The homepage HTML was never fetched — only the declared icon.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://example.com',
      expect.anything(),
    );
  });

  it('falls back to /favicon.ico when no other source resolves', async () => {
    const ico = new Uint8Array([0, 0, 1, 0]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/favicon.ico') {
        // Some servers mislabel .ico; accepted via the URL extension.
        return imageResponse('application/octet-stream', ico);
      }
      return notFound(); // homepage 404, no <link>s
    });

    const result = await resolveAndCacheIcon({
      siteUrl: 'https://example.com',
    });
    expect(result).toBe(`data:image/x-icon;base64,${b64(ico)}`);
  });

  it('returns undefined when every source fails', async () => {
    fetchMock.mockResolvedValue(notFound());
    const result = await resolveAndCacheIcon({
      siteUrl: 'https://example.com',
      feedIconUrl: 'https://example.com/icon.png',
    });
    expect(result).toBeUndefined();
  });

  it('skips an oversized image and returns undefined when nothing else fits', async () => {
    const big = new Uint8Array(150 * 1024 + 1);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/big.png') {
        return imageResponse('image/png', big);
      }
      return notFound(); // homepage + favicon.ico both 404
    });

    const result = await resolveAndCacheIcon({
      siteUrl: 'https://example.com',
      feedIconUrl: 'https://example.com/big.png',
    });
    expect(result).toBeUndefined();
  });

  it('never throws when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      resolveAndCacheIcon({
        siteUrl: 'https://example.com',
        feedIconUrl: 'https://example.com/icon.png',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns undefined once the total budget elapses on slow sources', async () => {
    vi.useFakeTimers();
    try {
      // Every source hangs until its request signal aborts (per-request timeout
      // or the shared total budget). With fake timers this never resolves on its
      // own, so if resolution completes it can only be because the budget bounded
      // it — proving a slow host can't run past the ~6s cap into the SW limit.
      fetchMock.mockImplementation(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            const abort = () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            if (signal?.aborted) {
              abort();
              return;
            }
            signal?.addEventListener('abort', abort, { once: true });
          }),
      );

      const promise = resolveAndCacheIcon({
        siteUrl: 'https://slow.example.com',
        feedIconUrl: 'https://slow.example.com/icon.png',
      });

      // Advance past the 6s total budget; the budget's abort must unwind every
      // pending/queued fetch and resolve to undefined.
      await vi.advanceTimersByTimeAsync(6_000);
      await expect(promise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
