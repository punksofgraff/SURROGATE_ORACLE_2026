-- Durable, server-owned character voice assets for story and reference-video work.
create table if not exists public.oracle_character_voice_tracks (
  id uuid primary key default gen_random_uuid(),
  track_key text not null,
  session_id text not null,
  story_key text not null,
  speaker text not null,
  source_voice text not null,
  voice_presentation text not null,
  post_process_version text not null,
  octave_shift double precision not null default 0,
  tuning_cents double precision not null default 0,
  transcript text not null,
  duration_seconds double precision not null,
  sample_rate_hz integer not null,
  content_sha256 text not null,
  storage_path text not null,
  public_url text not null,
  provider text not null default 'gemini-tts',
  model text not null,
  status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_key, speaker)
);

create index if not exists oracle_character_voice_tracks_session_idx
  on public.oracle_character_voice_tracks (session_id, story_key, created_at desc);

alter table public.oracle_character_voice_tracks enable row level security;

drop policy if exists "character voice tracks are server owned"
  on public.oracle_character_voice_tracks;
create policy "character voice tracks are server owned"
  on public.oracle_character_voice_tracks for all
  using (false)
  with check (false);