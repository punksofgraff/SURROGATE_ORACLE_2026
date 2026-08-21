-- Subscription state is written by the service-role webhook only.  The
-- integration function can read it, but browser clients cannot forge rows.
create table if not exists public.revenuecat_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  event_id text not null,
  event_type text not null,
  product_id text,
  store text,
  environment text,
  status text not null,
  premium_access boolean not null default false,
  purchased_at timestamptz,
  expiration_at timestamptz,
  country_code text,
  currency text,
  price numeric,
  subscriber_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revenuecat_subscriptions_event_id_key unique (event_id)
);

alter table public.revenuecat_subscriptions enable row level security;

drop policy if exists "No client writes to RevenueCat subscriptions"
  on public.revenuecat_subscriptions;
create policy "No client writes to RevenueCat subscriptions"
  on public.revenuecat_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists revenuecat_subscriptions_user_status_idx
  on public.revenuecat_subscriptions (user_id, status, updated_at desc);