import { computeEffectivePreferences, type EffectivePreferences } from '../domain/effective.js';
import type { PreferenceOverride, QuietHours } from '../domain/types.js';
import type { Logger, PreferencesRepository, UserRepository } from './ports.js';

export interface UpdatePreferencesCommand {
  readonly userId: string;
  readonly updates: readonly PreferenceOverride[];
  /**
   * `undefined` => leave quiet hours untouched.
   * `null`      => explicitly clear quiet hours.
   * object      => set quiet hours.
   */
  readonly quietHours?: QuietHours | null;
}

/**
 * Applies preference updates idempotently. Overrides are upserted by
 * (userId, type, channel) and quiet hours are upserted by userId, so repeating
 * the same command is a no-op with respect to row count and final state.
 */
export class UpdateUserPreferences {
  constructor(
    private readonly users: UserRepository,
    private readonly prefs: PreferencesRepository,
    private readonly logger: Logger,
  ) {}

  async execute(cmd: UpdatePreferencesCommand): Promise<EffectivePreferences> {
    await this.users.ensureExists(cmd.userId);

    if (cmd.updates.length > 0) {
      await this.prefs.upsertOverrides(cmd.userId, cmd.updates);
    }
    if (cmd.quietHours !== undefined) {
      await this.prefs.setQuietHours(cmd.userId, cmd.quietHours);
    }

    this.logger.info(
      {
        userId: cmd.userId,
        changedOverrides: cmd.updates.map((u) => ({
          notificationType: u.notificationType,
          channel: u.channel,
          enabled: u.enabled,
        })),
        quietHoursChanged: cmd.quietHours !== undefined,
      },
      'user_preferences_updated',
    );

    const preferences = await this.prefs.getPreferences(cmd.userId);
    return computeEffectivePreferences(preferences);
  }
}
