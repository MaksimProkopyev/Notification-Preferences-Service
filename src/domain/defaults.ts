import type { Channel, NotificationType } from './types.js';
import { isTransactional } from './types.js';

/**
 * Default enablement for a (type, channel) pair when the user has no explicit
 * override.
 *
 * Business rule:
 *   - transactional_* => enabled by default (the user expects them).
 *   - marketing_*      => disabled by default (opt-in only).
 *
 * Note this is a pure function of the type, but it takes the channel too so the
 * policy can be refined later (e.g. "marketing_push default-on") without
 * touching call sites.
 */
export function defaultEnabled(type: NotificationType, _channel: Channel): boolean {
  return isTransactional(type);
}
