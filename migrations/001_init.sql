-- Notification Preferences Service — initial schema.

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    channel           TEXT NOT NULL,
    enabled           BOOLEAN NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Unique constraint is what makes POST /preferences idempotent via upsert.
    CONSTRAINT user_notification_preferences_pkey
        PRIMARY KEY (user_id, notification_type, channel)
);

CREATE TABLE IF NOT EXISTS user_quiet_hours (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    timezone    TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS global_policies (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL,
    channel           TEXT,            -- NULL = wildcard (applies to all channels)
    region            TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_policies_region ON global_policies(region);

-- Prevent duplicate logically-identical policies. COALESCE handles the NULL
-- (wildcard) channel so ('marketing_sms', NULL, 'EU') can only exist once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_policies
    ON global_policies(notification_type, COALESCE(channel, '*'), region);
