import { DateTime } from 'luxon';
import type { QuietHours } from './types.js';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validates an "HH:mm" string and returns minutes-since-midnight. */
export function parseHHmm(value: string): number {
  const m = HHMM.exec(value);
  if (!m) {
    throw new Error(`Invalid HH:mm time: "${value}"`);
  }
  // m[1]/m[2] are guaranteed present by the regex match.
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True if `tz` is a valid IANA timezone identifier. */
export function isValidTimezone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/**
 * Determines whether `instantUtc` (a UTC instant) falls inside the user's quiet
 * hours, evaluated in the user's own timezone.
 *
 * Correctly handles windows that wrap past midnight (e.g. 22:00–08:00):
 *   - non-wrapping (start < end): inside iff start <= now < end
 *   - wrapping     (start >= end): inside iff now >= start OR now < end
 *
 * The window is treated as half-open [start, end) so a single instant can never
 * belong to two adjacent windows.
 */
export function isWithinQuietHours(quietHours: QuietHours, instantUtc: Date): boolean {
  const start = parseHHmm(quietHours.start);
  const end = parseHHmm(quietHours.end);

  const local = DateTime.fromJSDate(instantUtc, { zone: 'utc' }).setZone(quietHours.timezone);
  if (!local.isValid) {
    throw new Error(`Invalid timezone: "${quietHours.timezone}"`);
  }
  const nowMinutes = local.hour * 60 + local.minute;

  if (start === end) {
    // Degenerate window of zero length => never inside.
    return false;
  }
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  // Wraps past midnight.
  return nowMinutes >= start || nowMinutes < end;
}
