-- ==============================================================================
-- ImmoAndTheBrain – CREATE TABLE: subscription
-- Depends on: personal_data (user_id)
-- ==============================================================================

CREATE TYPE subscription_model AS ENUM (
    'FREE',
    'BASIC',
    'PRO',
    'ENTERPRISE'
);

CREATE TABLE IF NOT EXISTS subscription (
    subscription_id     SERIAL              PRIMARY KEY,
    user_id             UUID                NOT NULL REFERENCES personal_data(user_id) ON DELETE CASCADE,

    subscription_model  subscription_model  NOT NULL,

    -- Validity window
    start_date          DATE                NOT NULL DEFAULT CURRENT_DATE,
    end_date            DATE,               -- NULL = active / open-ended

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_subscription_dates
        CHECK (end_date IS NULL OR end_date > start_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscription_user_id ON subscription (user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_model   ON subscription (subscription_model);

-- Comments
COMMENT ON TABLE  subscription                    IS 'Subscription plans per user. One user can have multiple subscriptions over time (1:n with personal_data).';
COMMENT ON COLUMN subscription.subscription_model IS 'Enum: FREE | BASIC | PRO | ENTERPRISE';
COMMENT ON COLUMN subscription.end_date           IS 'NULL = active / open-ended subscription.';

-- Enable Row Level Security
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscriptions
CREATE POLICY "Users can view own subscriptions"
    ON subscription FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own subscriptions"
    ON subscription FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions"
    ON subscription FOR UPDATE
    USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_updated_at
    BEFORE UPDATE ON subscription
    FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();