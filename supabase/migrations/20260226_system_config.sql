-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: system_config
-- Key/value configuration table — replaces single-row SystemData
-- ==============================================================================

CREATE TABLE IF NOT EXISTS system_config (
    config_id       SERIAL                      PRIMARY KEY,
    config_key      VARCHAR(100)                NOT NULL,
    config_value    TEXT                        NOT NULL,
    description     TEXT,

    created_at      TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE    DEFAULT NOW(),

    CONSTRAINT uq_system_config_key UNIQUE (config_key)
);

COMMENT ON TABLE  system_config             IS 'Global key/value config. e.g. current_year, afa_rate_new_build.';
COMMENT ON COLUMN system_config.config_key  IS 'Unique key identifying the config entry, e.g. ''current_year''.';
COMMENT ON COLUMN system_config.config_value IS 'Value stored as TEXT — cast to required type in application layer.';

-- Seed default values
INSERT INTO system_config (config_key, config_value, description)
VALUES
    ('current_year',         EXTRACT(YEAR FROM NOW())::TEXT, 'Current fiscal year used in AfA calculations'),
    ('afa_rate_new_build',   '0.03',  'AfA rate for new builds post-2023 (3%)'),
    ('afa_rate_existing',    '0.02',  'AfA rate for existing buildings (2%)')
ON CONFLICT (config_key) DO NOTHING;

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system config"
    ON system_config FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER system_config_updated_at BEFORE UPDATE ON system_config FOR EACH ROW EXECUTE FUNCTION update_system_config_updated_at();


-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: notifications
-- Depends on: personal_data (user_id), property (property_id)
-- ==============================================================================

CREATE TYPE notification_type AS ENUM (
    'INFO',
    'WARNING',
    'ACTION'
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id     SERIAL                      PRIMARY KEY,
    user_id             UUID                        NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,
    property_id         INT                         REFERENCES property(property_id) ON DELETE SET NULL,

    type                notification_type      NOT NULL,
    message             TEXT                        NOT NULL,
    tradesperson        VARCHAR(255),
    financial_broker    VARCHAR(255),
    read_at             TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_property_id ON notifications (property_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at     ON notifications (read_at) WHERE read_at IS NULL;

COMMENT ON TABLE  notifications             IS 'User-owned notifications. read_at IS NULL = unread.';
COMMENT ON COLUMN notifications.read_at     IS 'NULL = unread. Set to NOW() when user views the notification.';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
    ON notifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);
