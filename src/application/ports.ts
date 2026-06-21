import type {
  GlobalPolicy,
  PreferenceOverride,
  QuietHours,
  Region,
  UserPreferences,
} from '../domain/types.js';

/**
 * Repository ports (interfaces) owned by the application layer. Infrastructure
 * provides concrete implementations (Postgres for prod, in-memory for tests),
 * which keeps use-cases free of any persistence dependency.
 */

export interface UserRepository {
  /** Ensure a user row exists. Idempotent. Returns true if newly created. */
  ensureExists(userId: string): Promise<boolean>;
  exists(userId: string): Promise<boolean>;
}

export interface PreferencesRepository {
  /** Loads overrides + quiet hours. Returns an empty preference set if none. */
  getPreferences(userId: string): Promise<UserPreferences>;

  /**
   * Upserts the given overrides by (userId, type, channel). Idempotent — a
   * repeated call with identical data does not create duplicate rows.
   */
  upsertOverrides(userId: string, overrides: readonly PreferenceOverride[]): Promise<void>;

  /** Upserts (or clears, when null) the user's quiet hours. Idempotent. */
  setQuietHours(userId: string, quietHours: QuietHours | null): Promise<void>;
}

export interface PolicyRepository {
  /** All global policies applicable to a region. */
  findByRegion(region: Region): Promise<readonly GlobalPolicy[]>;
  create(policy: Omit<GlobalPolicy, 'id'>): Promise<GlobalPolicy>;
}

/** Structured logging port — keeps pino out of the application/domain layers. */
export interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Metrics port — a thin seam over whatever backend prod would wire in. */
export interface Metrics {
  increment(name: string, tags?: Record<string, string>): void;
  timing(name: string, ms: number, tags?: Record<string, string>): void;
}
