import type { Generated } from 'kysely';
import type { Channel, NotificationType } from '../../domain/types.js';

/** Kysely table interfaces — the typed shape of the Postgres schema. */

export interface UsersTable {
  id: string;
  created_at: Generated<Date>;
}

export interface UserNotificationPreferencesTable {
  user_id: string;
  notification_type: NotificationType;
  channel: Channel;
  enabled: boolean;
  updated_at: Generated<Date>;
}

export interface UserQuietHoursTable {
  user_id: string;
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  timezone: string;
  updated_at: Generated<Date>;
}

export interface GlobalPoliciesTable {
  id: Generated<string>;
  notification_type: NotificationType;
  channel: Channel | null;
  region: string;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  user_notification_preferences: UserNotificationPreferencesTable;
  user_quiet_hours: UserQuietHoursTable;
  global_policies: GlobalPoliciesTable;
}
