create table if not exists public.oracle_film_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  portrait_url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'stitching', 'ready', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  chunk_count integer not null default 4,
  chunks jsonb not null default '[]'::jsonb,
  visual_slugs jsonb not null default '[]'::jsonb,
  runpod_job_id text,
  final_media_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oracle_film_jobs_session_idx
  on public.oracle_film_jobs (session_id, created_at desc);

alter table public.oracle_film_jobs enable row level security;

drop policy if exists "oracle film jobs are server owned" on public.oracle_film_jobs;
create policy "oracle film jobs are server owned"
  on public.oracle_film_jobs for all
  using (false)
  with check (false);