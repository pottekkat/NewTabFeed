import { describe, it, expect } from 'vitest';
import { firstContentImage } from '@/lib/feeds/content-image';

describe('firstContentImage', () => {
  it('returns the src of the first img in document order', () => {
    const html =
      '<p>Intro</p><img src="https://cdn.example.com/first.jpg">' +
      '<img src="https://cdn.example.com/second.jpg">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/first.jpg');
  });

  it('reads single-quoted and unquoted src values', () => {
    expect(firstContentImage("<img src='https://x.test/a.png'>")).toBe(
      'https://x.test/a.png',
    );
    expect(firstContentImage('<img src=https://x.test/b.png alt=hi>')).toBe(
      'https://x.test/b.png',
    );
  });

  it('returns a relative src verbatim (caller resolves it)', () => {
    expect(firstContentImage('<img src="/images/rel.jpg">')).toBe(
      '/images/rel.jpg',
    );
  });

  it('skips a data: URI then returns the next real image', () => {
    const html =
      '<img src="data:image/gif;base64,R0lGODlh">' +
      '<img src="https://cdn.example.com/real.jpg">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/real.jpg');
  });

  it('skips an SVG then returns the next real image', () => {
    const html =
      '<img src="https://cdn.example.com/logo.svg?v=2">' +
      '<img src="https://cdn.example.com/photo.png">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/photo.png');
  });

  it('skips a tracking pixel by filename then returns the next real image', () => {
    const html =
      '<img src="https://track.example.com/pixel.gif">' +
      '<img src="https://cdn.example.com/cover.jpg">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/cover.jpg');
  });

  it('skips a 1x1 spacer by width/height attributes', () => {
    const html =
      '<img src="https://track.example.com/beaconimg.gif" width="1" height="1">' +
      '<img src="https://cdn.example.com/hero.jpg">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/hero.jpg');
  });

  it('skips a zero-dimension image', () => {
    const html =
      '<img src="https://track.example.com/z.gif" width="0">' +
      '<img src="https://cdn.example.com/hero.jpg">';
    expect(firstContentImage(html)).toBe('https://cdn.example.com/hero.jpg');
  });

  it('reads src when it follows other attributes (alt before src)', () => {
    // Real-world Atom content shape: alt (with entity-encoded quotes) first,
    // src last, self-closing. getAttr locates src regardless of position.
    const html =
      '<img alt="A map of the world, it looks very &quot;good&quot;" ' +
      'src="https://static.example.net/world-map-ascii.png" />';
    expect(firstContentImage(html)).toBe(
      'https://static.example.net/world-map-ascii.png',
    );
  });

  it('returns undefined when there is no img', () => {
    expect(
      firstContentImage('<p>Just <em>text</em> here.</p>'),
    ).toBeUndefined();
  });

  it('returns undefined for undefined and empty input', () => {
    expect(firstContentImage(undefined)).toBeUndefined();
    expect(firstContentImage('')).toBeUndefined();
  });

  it('returns undefined when every img is unusable', () => {
    const html =
      '<img src="data:image/png;base64,AAAA">' +
      '<img src="https://track.example.com/spacer.gif">';
    expect(firstContentImage(html)).toBeUndefined();
  });
});
