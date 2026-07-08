// Small, dependency-free, deterministic string hash.
//
// Used to derive stable item ids. This is NOT cryptographic—it only needs to
// be stable across runs and well-distributed enough to avoid collisions within
// a single user's feed archive. It is synchronous (crypto.subtle is async and
// overkill here) and runs identically in the service worker and page contexts.

/**
 * cyrb53—a fast 53-bit hash by bryc (public domain).
 * Returns a zero-padded hex string.
 */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

/**
 * Compute a stable item id from its owning feed and its identity string
 * (guid or link). Newline separator avoids ambiguity between the two parts.
 */
export function itemId(feedId: string, guidOrLink: string): string {
  return hashString(`${feedId}\n${guidOrLink}`);
}
