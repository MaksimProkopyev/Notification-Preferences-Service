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
import type { DB } from '../db/connection.js';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: DB) {}

  async ensureExists(userId: string): Promise<boolean> {
    const res = await this.db
      .insertInto('users')
      .values({ id: userId })
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst();
    return (res.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async exists(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }
}

export class PostgresPreferencesRepository implements PreferencesRepository {
  constructor(private readonly db: DB) {}

  async getPreferences(userId: string): Promise<UserPreferences> {
    const [overrides, qh] = await Promise.all([
      this.db
        .selectFrom('user_notification_preferences')
        .select(['notification_type', 'channel', 'enabled'])
        .where('user_id', '=', userId)
        .execute(),
      this.db
        .selectFrom('user_quiet_hours')
        .select(['start_time', 'end_time', 'timezone'])
        .where('user_id', '=', userId)
        .executeTakeFirst(),
    ]);

    return {
      userId,
      overrides: overrides.map((o) => ({
        notificationType: o.notification_type,
        channel: o.channel,
        enabled: o.enabled,
      })),
      quietHours: qh
        ? {
            // TIME may come back as "HH:mm:ss"; normalise to "HH:mm".
            start: qh.start_time.slice(0, 5),
            end: qh.end_time.slice(0, 5),
            timezone: qh.timezone,
          }
        : null,
    };
  }

  async upsertOverrides(
    userId: string,
    overrides: readonly PreferenceOverride[],
  ): Promise<void> {
    if (overrides.length === 0) return;
    await this.db
      .insertInto('user_notification_preferences')
      .values(
        overrides.map((o) => ({
          user_id: userId,
          notification_type: o.notificationType,
          channel: o.channel,
          enabled: o.enabled,
          updated_at: new Date(),
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(['user_id', 'notification_type', 'channel'])
          .doUpdateSet((eb) => ({
            enabled: eb.ref('excluded.enabled'),
            updated_at: new Date(),
          })),
      )
      .execute();
  }

  async setQuietHours(userId: string, quietHours: QuietHours | null): Promise<void> {
    if (quietHours === null) {
      await this.db.deleteFrom('user_quiet_hours').where('user_id', '=', userId).execute();
      return;
    }
    await this.db
      .insertInto('user_quiet_hours')
      .values({
        user_id: userId,
        start_time: quietHours.start,
        end_time: quietHours.end,
        timezone: quietHours.timezone,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          start_time: eb.ref('excluded.start_time'),
          end_time: eb.ref('excluded.end_time'),
          timezone: eb.ref('excluded.timezone'),
          updated_at: new Date(),
        })),
      )
      .execute();
  }
}

export class PostgresPolicyRepository implements PolicyRepository {
  constructor(private readonly db: DB) {}

  async findByRegion(region: Region): Promise<readonly GlobalPolicy[]> {
    const rows = await this.db
      .selectFrom('global_policies')
      .select(['id', 'notification_type', 'channel', 'region'])
      .where('region', '=', region)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      notificationType: r.notification_type,
      channel: r.channel,
      region: r.region,
    }));
  }

  async create(policy: Omit<GlobalPolicy, 'id'>): Promise<GlobalPolicy> {
    const row = await this.db
      .insertInto('global_policies')
      .values({
        notification_type: policy.notificationType,
        channel: policy.channel,
        region: policy.region,
      })
      .onConflict((oc) => oc.doNothing())
      .returning(['id', 'notification_type', 'channel', 'region'])
      .executeTakeFirst();

    if (row) {
      return {
        id: row.id,
        notificationType: row.notification_type,
        channel: row.channel,
        region: row.region,
      };
    }
    // Conflict: an identical policy already exists — return it (idempotent).
    const existing = await this.db
      .selectFrom('global_policies')
      .select(['id', 'notification_type', 'channel', 'region'])
      .where('notification_type', '=', policy.notificationType)
      .where('region', '=', policy.region)
      .where((eb) =>
        policy.channel === null
          ? eb('channel', 'is', null)
          : eb('channel', '=', policy.channel),
      )
      .executeTakeFirstOrThrow();
    return {
      id: existing.id,
      notificationType: existing.notification_type,
      channel: existing.channel,
      region: existing.region,
    };
  }
}
