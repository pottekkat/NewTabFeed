import { describe, it, expect } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = Date.UTC(2026, 6, 5, 12, 0, 0);
const ago = (ms: number) => NOW - ms;

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('relativeTime', () => {
  it('shows "just now" under a minute', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(59 * SEC), NOW)).toBe('just now');
  });

  it('shows minutes', () => {
    expect(relativeTime(ago(MIN), NOW)).toBe('1m');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59m');
  });

  it('shows hours', () => {
    expect(relativeTime(ago(2 * HOUR), NOW)).toBe('2h');
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe('23h');
  });

  it('shows days', () => {
    expect(relativeTime(ago(DAY), NOW)).toBe('1d');
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3d');
  });

  it('shows weeks', () => {
    expect(relativeTime(ago(WEEK), NOW)).toBe('1w');
    expect(relativeTime(ago(4 * WEEK), NOW)).toBe('4w');
  });

  it('shows years past ~52 weeks', () => {
    expect(relativeTime(ago(52 * WEEK), NOW)).toBe('1y');
    expect(relativeTime(ago(120 * WEEK), NOW)).toBe('2y');
  });

  it('collapses future timestamps (clock skew) to "just now"', () => {
    expect(relativeTime(NOW + 5 * MIN, NOW)).toBe('just now');
  });
});
