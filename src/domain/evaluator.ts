import { defaultEnabled } from './defaults.js';
import { isWithinQuietHours } from './quietHours.js';
import {
  isTransactional,
  type Channel,
  type GlobalPolicy,
  type NotificationType,
  type Region,
  type UserPreferences,
} from './types.js';

export type Decision = 'allow' | 'deny';

export type DecisionReason =
  | 'blocked_by_global_policy'
  | 'blocked_by_quiet_hours'
  | 'blocked_by_user_preference'
  | 'allowed_by_user_preference'
  | 'allowed_by_default';

export interface EvaluationResult {
  readonly decision: Decision;
  readonly reason: DecisionReason;
}

export interface EvaluationInput {
  readonly notificationType: NotificationType;
  readonly channel: Channel;
  readonly region: Region;
  /** The instant at which the notification would be sent (UTC). */
  readonly instantUtc: Date;
  readonly preferences: UserPreferences;
  readonly policies: readonly GlobalPolicy[];
}

/** True if a global policy forbids this (type, channel, region). */
function isBlockedByPolicy(input: EvaluationInput): boolean {
  return input.policies.some(
    (p) =>
      p.notificationType === input.notificationType &&
      p.region === input.region &&
      // null channel is a wildcard matching every channel.
      (p.channel === null || p.channel === input.channel),
  );
}

function findUserOverride(input: EvaluationInput): boolean | undefined {
  const match = input.preferences.overrides.find(
    (o) => o.notificationType === input.notificationType && o.channel === input.channel,
  );
  return match?.enabled;
}

/**
 * The evaluation pipeline. Rules are applied as an ordered chain of guards,
 * highest priority first; the first guard that produces a decision wins. This
 * keeps the priority order explicit and auditable rather than buried in nested
 * conditionals.
 *
 * Priority (high -> low):
 *   1. Global policy deny        -> blocked_by_global_policy
 *   2. Quiet hours (non-critical)-> blocked_by_quiet_hours
 *   3. User opt-out              -> blocked_by_user_preference
 *   4. User opt-in               -> allowed_by_user_preference
 *   5. Default                   -> allowed_by_default / blocked_by_user_preference*
 *
 * (*) When no override exists and the default is "disabled", the result is a
 * deny attributed to user preference space (the absence of an opt-in). We model
 * that as `blocked_by_user_preference` because, semantically, the user has not
 * consented to this marketing type.
 */
export function evaluate(input: EvaluationInput): EvaluationResult {
  // 1. Global policy — overrides everything, including explicit user opt-in.
  if (isBlockedByPolicy(input)) {
    return { decision: 'deny', reason: 'blocked_by_global_policy' };
  }

  // 2. Quiet hours — transactional/critical types are exempt.
  const qh = input.preferences.quietHours;
  if (qh !== null && !isTransactional(input.notificationType)) {
    if (isWithinQuietHours(qh, input.instantUtc)) {
      return { decision: 'deny', reason: 'blocked_by_quiet_hours' };
    }
  }

  // 3 & 4. Explicit user preference, if any.
  const override = findUserOverride(input);
  if (override === false) {
    return { decision: 'deny', reason: 'blocked_by_user_preference' };
  }
  if (override === true) {
    return { decision: 'allow', reason: 'allowed_by_user_preference' };
  }

  // 5. Fall back to defaults.
  if (defaultEnabled(input.notificationType, input.channel)) {
    return { decision: 'allow', reason: 'allowed_by_default' };
  }
  return { decision: 'deny', reason: 'blocked_by_user_preference' };
}
