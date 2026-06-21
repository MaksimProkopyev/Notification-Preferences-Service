import { describe, expect, it } from 'vitest';
import { isWithinQuietHours, parseHHmm } from '../../src/domain/quietHours.js';
import type { QuietHours } from '../../src/domain/types.js';

describe('parseHHmm', () => {
  it('parses valid times to minutes', () => {
    expect(parseHHmm('00:00')).toBe(0);
    expect(parseHHmm('22:30')).toBe(22 * 60 + 30);
    expect(parseHHmm('23:59')).toBe(23 * 60 + 59);
  });
  it('rejects invalid times', () => {
    expect(() => parseHHmm('24:00')).toThrow();
    expect(() => parseHHmm('7:5')).toThrow();
    expect(() => parseHHmm('nope')).toThrow();
  });
});

describe('isWithinQuietHours — midnight wrap + timezone', () => {
  const moscow: QuietHours = { start: '22:00', end: '08:00', timezone: 'Europe/Moscow' };

  it('is inside just after the start (in local tz)', () => {
    // 2026-05-21T19:30:00Z == 22:30 Moscow (UTC+3) -> inside
    expect(isWithinQuietHours(moscow, new Date('2026-05-21T19:30:00Z'))).toBe(true);
  });

  it('is inside in the early morning before end', () => {
    // 04:00 Moscow -> inside (wraps midnight)
    expect(isWithinQuietHours(moscow, new Date('2026-05-21T01:00:00Z'))).toBe(true);
  });

  it('is outside in the middle of the day', () => {
    // 15:00 Moscow -> outside
    expect(isWithinQuietHours(moscow, new Date('2026-05-21T12:00:00Z'))).toBe(false);
  });

  it('end is exclusive', () => {
    // exactly 08:00 Moscow == 05:00Z -> outside (half-open window)
    expect(isWithinQuietHours(moscow, new Date('2026-05-21T05:00:00Z'))).toBe(false);
  });

  it('handles non-wrapping windows', () => {
    const day: QuietHours = { start: '09:00', end: '17:00', timezone: 'UTC' };
    expect(isWithinQuietHours(day, new Date('2026-05-21T10:00:00Z'))).toBe(true);
    expect(isWithinQuietHours(day, new Date('2026-05-21T08:59:00Z'))).toBe(false);
  });
});
