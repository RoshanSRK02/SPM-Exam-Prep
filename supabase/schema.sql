create table if not exists public.revision_progress (
  sync_id text primary key check (sync_id ~ '^[a-f0-9]{64}$'),
  version integer not null default 1 check (version > 0),
  progress jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.revision_progress enable row level security;
revoke all on table public.revision_progress from anon, authenticated;
grant all on table public.revision_progress to service_role;
