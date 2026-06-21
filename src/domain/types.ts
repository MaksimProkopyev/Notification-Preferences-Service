/**
 * Domain types. This module has ZERO dependencies on Fastify, Postgres, or any
 * other infrastructure concern — it only models the business vocabulary and
 * rules so it can be unit-tested in complete isolation.
 */

/**
 * The kinds of notifications the platform can send.
 *
 * Convention: `transactional_*` types are *critical* — they must bypass quiet
 * hours (see {@link isTransactional}). This is encoded explicitly as a domain
 * predicate rather than scattered string checks, so the rule lives in one place.
 */
export const NOTIFICATION_TYPES = [
  'transactional_email',
  'transactional_push',
  'marketing_email',
  'marketing_sms',
  'marketing_push',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CHANNELS = ['email', 'sms', 'push', 'messenger'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Region code, e.g. "EU", "US", "RU". Kept as a plain string by design. */
export type Region = string;

/**
 * A single per-(type, channel) toggle. `enabled === false` means the user
 * explicitly opted out; `true` means explicitly opted in. Absence of an
 * override means "fall back to the default policy" (see defaults.ts).
 */
export interface PreferenceOverride {
  readonly notificationType: NotificationType;
  readonly channel: Channel;
  readonly enabled: boolean;
}

export interface QuietHours {
  /** Local wall-clock start, "HH:mm" (24h). */
  readonly start: string;
  /** Local wall-clock end, "HH:mm" (24h). May be < start (wraps past midnight). */
  readonly end: string;
  /** IANA timezone, e.g. "Europe/Moscow". */
  readonly timezone: string;
}

/**
 * The complete, resolved view of a user's preferences: the explicit overrides
 * plus optional quiet hours. Defaults are *not* baked in here — they are
 * applied during evaluation and when rendering the effective GET response.
 */
export interface UserPreferences {
  readonly userId: string;
  readonly overrides: readonly PreferenceOverride[];
  readonly quietHours: QuietHours | null;
}

/**
 * A global policy that forbids a notification type (optionally narrowed to a
 * channel) within a region. A `null` channel is a wildcard: the policy applies
 * to every channel for that (type, region).
 */
export interface GlobalPolicy {
  readonly id: string;
  readonly notificationType: NotificationType;
  /** `null` => applies to all channels. */
  readonly channel: Channel | null;
  readonly region: Region;
}

/** Returns true for critical types that must bypass quiet hours. */
export function isTransactional(type: NotificationType): boolean {
  return type.startsWith('transactional_');
}
