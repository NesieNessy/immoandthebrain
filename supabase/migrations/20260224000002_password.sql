-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: password
-- Depends on: personal_data (user_id)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS password (
    password_id     SERIAL          PRIMARY KEY,
    user_id         UUID            NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,

    password_hash   BYTEA           NOT NULL,

    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT uq_password_user UNIQUE (user_id)   -- 1:1 with personal_data
);

-- Index
CREATE INDEX IF NOT EXISTS idx_password_user_id ON password (user_id);

-- Comments
COMMENT ON TABLE  password              IS 'Stores hashed passwords. One record per user (1:1 with personal_data).';
COMMENT ON COLUMN password.password_hash IS 'bcrypt / argon2 hash — never store plaintext.';

-- Enable Row Level Security
ALTER TABLE password ENABLE ROW LEVEL SECURITY;

-- Users can only read their own password record
CREATE POLICY "Users can view own password"
    ON password FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own password record
CREATE POLICY "Users can insert own password"
    ON password FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own password record
CREATE POLICY "Users can update own password"
    ON password FOR UPDATE
    USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_password_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER password_updated_at
    BEFORE UPDATE ON password
    FOR EACH ROW EXECUTE FUNCTION update_password_updated_at();