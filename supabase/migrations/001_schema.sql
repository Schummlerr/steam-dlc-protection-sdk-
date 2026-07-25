-- Steam DLC Protection SDK — Database Schema
-- Run in Supabase SQL Editor or via: supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  dev_id uuid references auth.users(id) on delete set null,
  steam_app_id bigint not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dlcs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  steam_dlc_id bigint not null,
  aes_encryption_key text not null,
  created_at timestamptz not null default now(),
  unique (game_id, steam_dlc_id)
);

create index if not exists idx_games_steam_app_id on public.games (steam_app_id);
create index if not exists idx_dlcs_steam_dlc_id on public.dlcs (steam_dlc_id);

alter table public.games enable row level security;
alter table public.dlcs enable row level security;

drop policy if exists "games_no_public_access" on public.games;
create policy "games_no_public_access"
  on public.games
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "dlcs_no_public_access" on public.dlcs;
create policy "dlcs_no_public_access"
  on public.dlcs
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Test data (AES-256 key = 32 zero bytes, base64-encoded — replace in production)
insert into public.games (steam_app_id, name)
values (480, 'Spacewar Test Game')
on conflict (steam_app_id) do nothing;

insert into public.dlcs (game_id, steam_dlc_id, aes_encryption_key)
select g.id, 123456, encode(decode(repeat('00', 32), 'hex'), 'base64')
from public.games g
where g.steam_app_id = 480
on conflict (game_id, steam_dlc_id) do update
set aes_encryption_key = excluded.aes_encryption_key;
