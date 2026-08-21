-- One-time server challenges for wallet identity linking.
CREATE TABLE IF NOT EXISTS public.wallet_link_challenges (
  nonce TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  message TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wallet_link_challenges_ip
  ON public.wallet_link_challenges (ip_address, expires_at);

ALTER TABLE public.wallet_link_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_link_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.wallet_link_challenges FROM PUBLIC;