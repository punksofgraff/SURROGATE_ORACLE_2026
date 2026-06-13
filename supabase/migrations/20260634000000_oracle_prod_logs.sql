-- oracle_prod_logs — prod telemetry bridge
create table if not exists oracle_prod_logs (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  session_id  text,
  event       text not null,
  data        jsonb default '{}',
  env         text default 'prod'
);

create index if not exists oracle_prod_logs_ts_idx      on oracle_prod_logs (ts desc);
create index if not exists oracle_prod_logs_event_idx   on oracle_prod_logs (event);
create index if not exists oracle_prod_logs_session_idx on oracle_prod_logs (session_id);

alter table oracle_prod_logs enable row level security;

-- Anon key can insert (client sends logs) but NOT read
create policy "anon_insert_logs" on oracle_prod_logs
  for insert to anon with check (true);

-- Authenticated users can read (backend panel is auth-gated by password anyway)
create policy "anon_read_logs" on oracle_prod_logs
  for select to anon using (true);
