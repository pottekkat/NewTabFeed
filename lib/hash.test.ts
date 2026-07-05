import { describe, it, expect } from 'vitest';
import { hashString, itemId } from '@/lib/hash';

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('differs for different inputs', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('returns a hex string', () => {
    expect(hashString('anything')).toMatch(/^[0-9a-f]+$/);
  });
});

describe('itemId', () => {
  it('is stable for the same feed + guid', () => {
    expect(itemId('feed-1', 'guid-a')).toBe(itemId('feed-1', 'guid-a'));
  });

  it('separates the feed and guid so concatenation collisions are avoided', () => {
    // "ab" + "c" must not collide with "a" + "bc".
    expect(itemId('ab', 'c')).not.toBe(itemId('a', 'bc'));
  });

  it('differs across feeds for the same guid', () => {
    expect(itemId('feed-1', 'shared')).not.toBe(itemId('feed-2', 'shared'));
  });
});
