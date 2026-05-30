-- Create User Wallets Table for Onboarding Tracking
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE,
    ip_address TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    onboarding_status TEXT DEFAULT 'pending'
);

-- Index for quick IP lookups to handle return trips
CREATE INDEX IF NOT EXISTS idx_user_wallets_ip ON user_wallets(ip_address);
