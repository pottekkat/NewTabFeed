import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, resolveUrl, originOf } from '@/lib/url';

describe('canonicalizeUrl', () => {
  it('trims whitespace', () => {
    expect(canonicalizeUrl('  https://example.com/feed  ')).toBe(
      'https://example.com/feed',
    );
  });

  it('adds https:// when the scheme is missing', () => {
    expect(canonicalizeUrl('example.com/feed')).toBe(
      'https://example.com/feed',
    );
  });

  it('preserves an explicit http:// scheme', () => {
    expect(canonicalizeUrl('http://example.com/feed')).toBe(
      'http://example.com/feed',
    );
  });

  it('strips the fragment', () => {
    expect(canonicalizeUrl('https://example.com/feed#top')).toBe(
      'https://example.com/feed',
    );
  });

  it('lower-cases the host but not the path', () => {
    expect(canonicalizeUrl('https://Example.COM/Feed')).toBe(
      'https://example.com/Feed',
    );
  });

  it('collapses a bare trailing slash so host and host/ match', () => {
    expect(canonicalizeUrl('https://example.com/')).toBe(
      canonicalizeUrl('https://example.com'),
    );
  });

  it('throws on empty input', () => {
    expect(() => canonicalizeUrl('   ')).toThrow();
  });

  it('throws on a non-http(s) scheme', () => {
    expect(() => canonicalizeUrl('ftp://example.com/feed')).toThrow(/scheme/i);
  });
});

describe('resolveUrl', () => {
  it('returns an already-absolute URL unchanged', () => {
    expect(resolveUrl('https://a.com/x', 'https://b.com')).toBe(
      'https://a.com/x',
    );
  });

  it('resolves an absolute path against the base origin', () => {
    expect(resolveUrl('/posts/1', 'https://a.com/blog/')).toBe(
      'https://a.com/posts/1',
    );
  });

  it('resolves a relative path against the base path', () => {
    expect(resolveUrl('second', 'https://a.com/blog/')).toBe(
      'https://a.com/blog/second',
    );
  });

  it('falls back to the next base when the first is missing', () => {
    expect(resolveUrl('/x', undefined, 'https://b.com')).toBe(
      'https://b.com/x',
    );
  });

  it('returns undefined for empty href', () => {
    expect(resolveUrl(undefined, 'https://a.com')).toBeUndefined();
    expect(resolveUrl('', 'https://a.com')).toBeUndefined();
  });

  it('returns undefined when nothing resolves', () => {
    expect(resolveUrl('/x')).toBeUndefined();
  });
});

describe('originOf', () => {
  it('extracts the origin', () => {
    expect(originOf('https://a.com/blog/post?x=1')).toBe('https://a.com');
  });
  it('returns undefined for junk', () => {
    expect(originOf('not a url')).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
  });
});
