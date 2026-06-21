import type {
  PolicyRepository,
  PreferencesRepository,
  UserRepository,
} from '../../application/ports.js';
import type {
  GlobalPolicy,
  PreferenceOverride,
  QuietHours,
  Region,
  UserPreferences,
} from '../../domain/types.js';

/**
 * In-memory repository implementations. Used by unit/integration tests to
 * exercise the application layer without a real database, and as a reference
 * implementation of the port contracts. They preserve the same idempotency
 * semantics as the Postgres versions (upsert by key, no append-only growth).
 */

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Set<string>();

  async ensureExists(userId: string): Promise<boolean> {
    if (this.users.has(userId)) return false;
    this.users.add(userId);
    return true;
  }
  async exists(userId: string): Promise<boolean> {
    return this.users.has(userId);
  }
}

export class InMemoryPreferencesRepository implements PreferencesRepository {
  /** keyed by userId -> `${type}:${channel}` -> override */
  readonly overrides = new Map<string, Map<string, PreferenceOverride>>();
  readonly quietHours = new Map<string, QuietHours>();

  async getPreferences(userId: string): Promise<UserPreferences> {
    const map = this.overrides.get(userId);
    return {
      userId,
      overrides: map ? [...map.values()] : [],
      quietHours: this.quietHours.get(userId) ?? null,
    };
  }

  async upsertOverrides(
    userId: string,
    overrides: readonly PreferenceOverride[],
  ): Promise<void> {
    let map = this.overrides.get(userId);
    if (!map) {
      map = new Map();
      this.overrides.set(userId, map);
    }
    for (const o of overrides) {
      map.set(`${o.notificationType}:${o.channel}`, o);
    }
  }

  async setQuietHours(userId: string, quietHours: QuietHours | null): Promise<void> {
    if (quietHours === null) {
      this.quietHours.delete(userId);
    } else {
      this.quietHours.set(userId, quietHours);
    }
  }

  /** Test helper: total number of stored override rows for a user. */
  countOverrides(userId: string): number {
    return this.overrides.get(userId)?.size ?? 0;
  }
}

export class InMemoryPolicyRepository implements PolicyRepository {
  readonly policies: GlobalPolicy[] = [];
  private seq = 0;

  async findByRegion(region: Region): Promise<readonly GlobalPolicy[]> {
    return this.policies.filter((p) => p.region === region);
  }

  async create(policy: Omit<GlobalPolicy, 'id'>): Promise<GlobalPolicy> {
    const existing = this.policies.find(
      (p) =>
        p.notificationType === policy.notificationType &&
        p.channel === policy.channel &&
        p.region === policy.region,
    );
    if (existing) return existing;
    const created: GlobalPolicy = { id: `policy-${++this.seq}`, ...policy };
    this.policies.push(created);
    return created;
  }
}
