-- ChainFuelz Ghost Infrastructure Migration

-- Add wallet tracking to the Culture Crew
ALTER TABLE culture_crew ADD COLUMN IF NOT EXISTS chainfuelz_wallet_address text;

-- Add transaction tracking to sessions so we know what was paid out
ALTER TABLE surrogate_sessions ADD COLUMN IF NOT EXISTS on_chain_tx_hash text;
ALTER TABLE surrogate_sessions ADD COLUMN IF NOT EXISTS culture_coins_minted numeric DEFAULT 0;

-- Optionally, index the wallet address for faster lookups
CREATE INDEX IF NOT EXISTS idx_culture_crew_wallet ON culture_crew(chainfuelz_wallet_address);
