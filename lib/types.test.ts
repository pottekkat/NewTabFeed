import { describe, it, expect } from 'vitest';
import { isPersistentError, type Feed } from '@/lib/types';

// A minimal healthy feed; individual tests override `error`.
function makeFeed(error: Feed['error']): Feed {
  return {
    id: 'https://example.com/feed.xml',
    url: 'https://example.com/feed.xml',
    title: 'Example',
    addedAt: 0,
    error,
  };
}

describe('isPersistentError', () => {
  it('is false when the feed has no error', () => {
    expect(isPersistentError(makeFeed(null))).toBe(false);
    expect(isPersistentError(makeFeed(undefined))).toBe(false);
  });

  it('is false after a single (likely transient) failure', () => {
    expect(
      isPersistentError(makeFeed({ message: 'boom', failCount: 1, since: 0 })),
    ).toBe(false);
  });

  it('is true once the feed has failed at least twice in a row', () => {
    expect(
      isPersistentError(makeFeed({ message: 'boom', failCount: 2, since: 0 })),
    ).toBe(true);
    expect(
      isPersistentError(makeFeed({ message: 'boom', failCount: 5, since: 0 })),
    ).toBe(true);
  });
});
