import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFeed, FeedFetchError } from '@/lib/feeds/fetch';
import { NoHostPermissionError } from '@/lib/permissions';

// Control host-access checks directly rather than driving fakeBrowser's
// permissions store; fetch behavior is what these tests exercise.
const hasAccess = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  return {
    ...actual,
    assertHostAccess: async () => {
      if (!(await hasAccess())) {
        throw new actual.NoHostPermissionError();
      }
    },
  };
});

// Minimal duck-typed Response — the real constructor rejects null-body statuses
// like 304, and fetchFeed only touches status/ok/headers.get/text.
function response(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(init.headers),
    text: async () => body,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  hasAccess.mockResolvedValue(true);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchFeed', () => {
  it('returns body and captures new ETag / Last-Modified on 200', async () => {
    fetchMock.mockResolvedValue(
      response('<rss/>', {
        headers: {
          etag: 'W/"abc"',
          'last-modified': 'Wed, 02 Oct 2024 13:00:00 GMT',
        },
      }),
    );
    const result = await fetchFeed('https://x.com/feed');
    expect(result).toEqual({
      status: 'ok',
      body: '<rss/>',
      etag: 'W/"abc"',
      lastModified: 'Wed, 02 Oct 2024 13:00:00 GMT',
    });
  });

  it('sends conditional-GET headers when validators are provided', async () => {
    fetchMock.mockResolvedValue(response('<rss/>'));
    await fetchFeed('https://x.com/feed', {
      etag: 'W/"abc"',
      lastModified: 'Wed, 02 Oct 2024 13:00:00 GMT',
    });
    const headers = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers['If-None-Match']).toBe('W/"abc"');
    expect(headers['If-Modified-Since']).toBe('Wed, 02 Oct 2024 13:00:00 GMT');
    expect(headers.Accept).toContain('application/rss+xml');
  });

  it('returns a not-modified marker on 304', async () => {
    fetchMock.mockResolvedValue(response('', { status: 304 }));
    expect(await fetchFeed('https://x.com/feed', { etag: 'W/"abc"' })).toEqual({
      status: 'not-modified',
    });
  });

  it('throws FeedFetchError with the status on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(response('nope', { status: 404 }));
    await expect(fetchFeed('https://x.com/feed')).rejects.toMatchObject({
      name: 'FeedFetchError',
      status: 404,
    });
  });

  it('wraps network errors in FeedFetchError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchFeed('https://x.com/feed')).rejects.toBeInstanceOf(
      FeedFetchError,
    );
  });

  it('propagates NoHostPermissionError without attempting a fetch', async () => {
    hasAccess.mockResolvedValue(false);
    await expect(fetchFeed('https://x.com/feed')).rejects.toBeInstanceOf(
      NoHostPermissionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts and throws after the timeout elapses', async () => {
    vi.useFakeTimers();
    // A fetch that only settles when its signal aborts.
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const promise = fetchFeed('https://x.com/feed', { timeoutMs: 20_000 });
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'FeedFetchError',
      message: expect.stringContaining('Timed out'),
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});
