import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractPreview,
  summaryIsThin,
  fetchLinkPreview,
} from '@/lib/feeds/link-preview';
import { NoHostPermissionError } from '@/lib/permissions';

const BASE = 'https://example.com/article';

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

describe('extractPreview', () => {
  it('reads og:image and og:description', () => {
    const html =
      '<meta property="og:image" content="https://cdn.example.com/cover.jpg">' +
      '<meta property="og:description" content="A fine article.">';
    expect(extractPreview(html, BASE)).toEqual({
      imageUrl: 'https://cdn.example.com/cover.jpg',
      description: 'A fine article.',
    });
  });

  it('falls back to twitter:image when og:image is absent', () => {
    const html =
      '<meta name="twitter:image" content="https://cdn.example.com/tw.png">';
    expect(extractPreview(html, BASE).imageUrl).toBe(
      'https://cdn.example.com/tw.png',
    );
  });

  it('prefers og:image over twitter:image', () => {
    const html =
      '<meta name="twitter:image" content="https://cdn.example.com/tw.png">' +
      '<meta property="og:image" content="https://cdn.example.com/og.jpg">';
    expect(extractPreview(html, BASE).imageUrl).toBe(
      'https://cdn.example.com/og.jpg',
    );
  });

  it('falls back to the plain description meta tag', () => {
    const html = '<meta name="description" content="Plain meta description.">';
    expect(extractPreview(html, BASE).description).toBe(
      'Plain meta description.',
    );
  });

  it('prefers og:description over twitter:description over description', () => {
    const html =
      '<meta name="description" content="plain">' +
      '<meta name="twitter:description" content="twitter">' +
      '<meta property="og:description" content="og">';
    expect(extractPreview(html, BASE).description).toBe('og');
  });

  it('reads content when it comes before property (attribute order varies)', () => {
    const html =
      '<meta content="https://cdn.example.com/first.jpg" property="og:image">';
    expect(extractPreview(html, BASE).imageUrl).toBe(
      'https://cdn.example.com/first.jpg',
    );
  });

  it('resolves a relative og:image against the base URL', () => {
    const html = '<meta property="og:image" content="/img/cover.jpg">';
    expect(extractPreview(html, BASE).imageUrl).toBe(
      'https://example.com/img/cover.jpg',
    );
  });

  it('decodes HTML entities in the description', () => {
    const html =
      '<meta property="og:description" content="Tom &amp; Jerry say &quot;hi&quot; &lt;3 &#39;n&#x27; &#128512;">';
    expect(extractPreview(html, BASE).description).toBe(
      'Tom & Jerry say "hi" <3 \'n\' 😀',
    );
  });

  it('decodes entities in the image URL query string', () => {
    const html =
      '<meta property="og:image" content="https://cdn.example.com/i?a=1&amp;b=2">';
    expect(extractPreview(html, BASE).imageUrl).toBe(
      'https://cdn.example.com/i?a=1&b=2',
    );
  });

  it('skips a data: image', () => {
    const html =
      '<meta property="og:image" content="data:image/gif;base64,R0lGODlh">';
    expect(extractPreview(html, BASE).imageUrl).toBeUndefined();
  });

  it('skips an SVG image', () => {
    const html =
      '<meta property="og:image" content="https://cdn.example.com/logo.svg">';
    expect(extractPreview(html, BASE).imageUrl).toBeUndefined();
  });

  it('returns {} when nothing usable is found', () => {
    expect(extractPreview('<meta charset="utf-8"><p>hi</p>', BASE)).toEqual({});
    expect(extractPreview('', BASE)).toEqual({});
  });
});

describe('summaryIsThin', () => {
  it('is thin for link-only markup (HN "Comments")', () => {
    expect(
      summaryIsThin(
        '<a href="https://news.ycombinator.com/item?id=1">Comments</a>',
      ),
    ).toBe(true);
  });

  it('is thin for short text', () => {
    expect(summaryIsThin('<p>Too short.</p>')).toBe(true);
  });

  it('is not thin for real prose', () => {
    expect(
      summaryIsThin(
        '<p>This is a genuinely substantial article summary worth showing.</p>',
      ),
    ).toBe(false);
  });

  it('is thin for undefined and empty', () => {
    expect(summaryIsThin(undefined)).toBe(true);
    expect(summaryIsThin('')).toBe(true);
    expect(summaryIsThin('   ')).toBe(true);
  });
});

// Minimal duck-typed Response — only status/ok/url/text are touched.
function response(body: string, init: { status?: number; url?: string } = {}) {
  const status = init.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    url: init.url ?? '',
    text: async () => body,
  };
}

const fetchMock = vi.fn();

describe('fetchLinkPreview', () => {
  beforeEach(() => {
    hasAccess.mockResolvedValue(true);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('parses metadata from a successful response', async () => {
    fetchMock.mockResolvedValue(
      response(
        '<meta property="og:image" content="https://cdn.example.com/c.jpg">' +
          '<meta property="og:description" content="Body text here.">',
        { url: 'https://example.com/final' },
      ),
    );
    expect(await fetchLinkPreview('https://example.com/a')).toEqual({
      imageUrl: 'https://cdn.example.com/c.jpg',
      description: 'Body text here.',
    });
  });

  it('resolves relative og:image against the final (redirected) URL', async () => {
    fetchMock.mockResolvedValue(
      response('<meta property="og:image" content="/cover.jpg">', {
        url: 'https://redirected.example.org/post',
      }),
    );
    expect((await fetchLinkPreview('https://example.com/a')).imageUrl).toBe(
      'https://redirected.example.org/cover.jpg',
    );
  });

  it('sends a Range header and omits credentials', async () => {
    fetchMock.mockResolvedValue(response(''));
    await fetchLinkPreview('https://example.com/a');
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Range).toBe('bytes=0-262143');
    expect(opts.credentials).toBe('omit');
    expect(opts.redirect).toBe('follow');
  });

  it('returns {} on a non-ok response', async () => {
    fetchMock.mockResolvedValue(response('nope', { status: 404 }));
    expect(await fetchLinkPreview('https://example.com/a')).toEqual({});
  });

  it('returns {} when the fetch throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await fetchLinkPreview('https://example.com/a')).toEqual({});
  });

  it('returns {} on timeout without throwing', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const promise = fetchLinkPreview('https://example.com/a', {
      timeoutMs: 6000,
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await promise).toEqual({});
  });

  it('propagates NoHostPermissionError without fetching', async () => {
    hasAccess.mockResolvedValue(false);
    await expect(
      fetchLinkPreview('https://example.com/a'),
    ).rejects.toBeInstanceOf(NoHostPermissionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
