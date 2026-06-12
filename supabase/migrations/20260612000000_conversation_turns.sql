-- conversation_turns: server-side transcript persistence
-- Lets the Oracle recover context across key switches, browser refreshes, and new devices.
create table if not exists conversation_turns (
  id          uuid primary key default gen_random_uuid(),
  session_id  text    not null,
  role        text    not null check (role in ('user', 'oracle')),
  content     text    not null,
  turn_index  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists conversation_turns_session_idx
  on conversation_turns (session_id, turn_index);

alter table conversation_turns enable row level security;

-- Anon clients can insert and read their own session turns
create policy "anon_insert" on conversation_turns
  for insert to anon with check (true);

create policy "anon_select" on conversation_turns
  for select to anon using (true);
