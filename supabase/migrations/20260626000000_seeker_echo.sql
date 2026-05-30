-- Seeker Echo Table — greenfield persistence for the Returning Seeker (design §I.5)
-- Keyed by wallet_address or IP. Read on entry, written on session end.
-- Does NOT alter user_wallets. Totem ladder (§I.3) reads/writes totem_level here.
CREATE TABLE IF NOT EXISTS seeker_echo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seeker_key TEXT UNIQUE,                 -- wallet_address or ip
    name TEXT,
    last_archetype TEXT,
    totem_level INT DEFAULT 0,
    last_cost TEXT,
    alignment TEXT,
    irl_context TEXT,                       -- web-grounded IRL dossier (seeker-define)
    visit_count INT DEFAULT 1,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Forward-safe if the table predates the irl_context column.
ALTER TABLE seeker_echo ADD COLUMN IF NOT EXISTS irl_context TEXT;

-- Index for fast lookups on return trips (mirrors idx_user_wallets_ip)
CREATE INDEX IF NOT EXISTS idx_seeker_echo_key ON seeker_echo(seeker_key);
