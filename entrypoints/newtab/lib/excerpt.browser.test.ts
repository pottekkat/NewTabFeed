import { describe, it, expect } from 'vitest';
import { excerpt } from './excerpt';

// Runs in the browser project — DOMPurify needs a real DOM.
describe('excerpt', () => {
  it('returns empty string for missing input', () => {
    expect(excerpt(undefined)).toBe('');
    expect(excerpt('')).toBe('');
  });

  it('strips all HTML tags, keeping text', () => {
    expect(excerpt('<p>Hello <b>bold</b> world</p>')).toBe('Hello bold world');
  });

  it('removes script/style content, not just tags', () => {
    const out = excerpt('<p>Safe</p><script>alert(1)</script>');
    expect(out).not.toContain('alert');
    expect(out).toContain('Safe');
  });

  it('decodes HTML entities', () => {
    expect(excerpt('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3');
  });

  it('collapses whitespace runs', () => {
    expect(excerpt('a\n\n  b\t c')).toBe('a b c');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'word '.repeat(100);
    const out = excerpt(long, 40);
    expect(out.length).toBeLessThanOrEqual(41); // 40 + ellipsis
    expect(out.endsWith('…')).toBe(true);
  });

  it('does not truncate text within the limit', () => {
    expect(excerpt('short and sweet', 100)).toBe('short and sweet');
  });

  it('never emits angle brackets from markup', () => {
    const out = excerpt('<img src=x onerror=alert(1)><div>text</div>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });
});
