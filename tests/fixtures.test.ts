import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFeed } from '@/lib/feeds/parse';
import { fixture } from '@/tests/helpers';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Every feed-document fixture (excluding OPML and the intentionally-broken one)
// must parse without throwing and yield at least one item. This is the phase's
// "parse all fixtures" acceptance sanity check.
const feedFixtures = readdirSync(fixturesDir).filter(
  (name) =>
    (name.endsWith('.xml') || name.endsWith('.json')) &&
    name !== 'malformed.xml' &&
    !name.endsWith('.opml'),
);

describe('all feed fixtures parse', () => {
  it('found the expected fixtures', () => {
    // Guardrail: if fixtures get renamed/removed, this list flags it.
    expect(feedFixtures.length).toBeGreaterThanOrEqual(5);
  });

  it.each(feedFixtures)('parses %s without throwing', (name) => {
    const parsed = parseFeed(fixture(name));
    expect(parsed.items.length).toBeGreaterThan(0);
    for (const item of parsed.items) {
      expect(typeof item.guid).toBe('string');
      expect(item.guid.length).toBeGreaterThan(0);
      expect(typeof item.title).toBe('string');
    }
  });
});
