import { defaultEnabled } from './defaults.js';
import {
  CHANNELS,
  NOTIFICATION_TYPES,
  type Channel,
  type NotificationType,
  type UserPreferences,
} from './types.js';

export interface EffectiveSetting {
  readonly notificationType: NotificationType;
  readonly channel: Channel;
  readonly enabled: boolean;
  /** Where the value came from: an explicit user override or the default. */
  readonly source: 'user' | 'default';
}

export interface EffectivePreferences {
  readonly userId: string;
  readonly settings: readonly EffectiveSetting[];
  readonly quietHours: UserPreferences['quietHours'];
}

/**
 * Expands the sparse set of user overrides into the full (type x channel) grid,
 * filling gaps with defaults. This is what `GET /users/:id/preferences`
 * returns: the *effective* view a caller can reason about without re-deriving
 * the default policy themselves.
 */
export function computeEffectivePreferences(prefs: UserPreferences): EffectivePreferences {
  const overrideMap = new Map<string, boolean>();
  for (const o of prefs.overrides) {
    overrideMap.set(`${o.notificationType}:${o.channel}`, o.enabled);
  }

  const settings: EffectiveSetting[] = [];
  for (const notificationType of NOTIFICATION_TYPES) {
    for (const channel of CHANNELS) {
      const override = overrideMap.get(`${notificationType}:${channel}`);
      if (override !== undefined) {
        settings.push({ notificationType, channel, enabled: override, source: 'user' });
      } else {
        settings.push({
          notificationType,
          channel,
          enabled: defaultEnabled(notificationType, channel),
          source: 'default',
        });
      }
    }
  }

  return { userId: prefs.userId, settings, quietHours: prefs.quietHours };
}
