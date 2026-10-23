-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).

create table if not exists public.games (
  id          text primary key,
  version     integer     not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

create index if not exists games_updated_at_idx on public.games (updated_at);

-- Lock the table down: with RLS on and no policies, the public (anon/publishable) key can't read
-- or write games at all. Only the server, using the secret key, can. This keeps racks private.
alter table public.games enable row level security;
