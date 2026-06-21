import { computeEffectivePreferences, type EffectivePreferences } from '../domain/effective.js';
import type { PreferencesRepository, UserRepository } from './ports.js';

/**
 * Returns the effective preferences for a user.
 *
 * Lazy-init policy: an unknown user is created on first access with defaults
 * (no rows are written for defaults — they are computed). This is documented in
 * the README; we chose lazy-create over 404 so the evaluate path never fails
 * for a brand-new user.
 */
export class GetUserPreferences {
  constructor(
    private readonly users: UserRepository,
    private readonly prefs: PreferencesRepository,
  ) {}

  async execute(userId: string): Promise<EffectivePreferences> {
    await this.users.ensureExists(userId);
    const preferences = await this.prefs.getPreferences(userId);
    return computeEffectivePreferences(preferences);
  }
}
