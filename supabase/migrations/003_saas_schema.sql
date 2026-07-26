-- Steam DLC Protection SDK — SaaS Schema v2
-- Multi-tenant architecture: developers → games → dlcs
-- Adds API key authentication, offline token support, and usage tracking

-- ── Developers (SaaS Accounts) ────────────────────────────────────────
create table if not exists public.developers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'enterprise')),
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── API Keys (one per developer, used in SDK calls) ───────────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  key_hash text not null unique,  -- SHA-256 of the API key (never store raw keys)
  label text default 'default',
  is_active boolean default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ── Games (registered per developer) ─────────────────────────────────
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  steam_app_id bigint not null,
  name text not null,
  offline_token_duration_hours int not null default 24,  -- How long offline tokens are valid
  is_active boolean default true,
  created_at timestamptz not null default now(),
  unique (developer_id, steam_app_id)
);

-- ── DLCs (per game) ──────────────────────────────────────────────────
create table if not exists public.dlcs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  steam_dlc_id bigint not null,
  aes_encryption_key text not null,
  bundle_name text,
  bundle_hash text,
  enabled boolean default true,
  created_at timestamptz not null default now(),
  unique (game_id, steam_dlc_id)
);

-- ── Usage Tracking (for billing / rate limiting) ─────────────────────
create table if not exists public.usage_log (
  id bigserial primary key,
  developer_id uuid not null references public.developers(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  steam_id text,
  dlc_id bigint,
  action text not null default 'verify-dlc',
  was_offline boolean default false,
  created_at timestamptz not null default now()
);

-- ── Offline Tokens (cache for player-side offline support) ───────────
-- Note: actual tokens are stored on the client. This is for revocation.
create table if not exists public.offline_tokens (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  steam_id text not null,
  dlc_id bigint not null,
  token_hash text not null,  -- SHA-256 of the token (for revocation checks)
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (game_id, steam_id, dlc_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────
create index if not exists idx_api_keys_key_hash on public.api_keys (key_hash);
create index if not exists idx_api_keys_developer on public.api_keys (developer_id);
create index if not exists idx_games_developer on public.games (developer_id);
create index if not exists idx_games_steam_app_id on public.games (steam_app_id);
create index if not exists idx_dlcs_steam_dlc_id on public.dlcs (steam_dlc_id);
create index if not exists idx_usage_developer on public.usage_log (developer_id, created_at);
create index if not exists idx_offline_tokens_lookup on public.offline_tokens (game_id, steam_id, dlc_id);

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.developers enable row level security;
alter table public.api_keys enable row level security;
alter table public.games enable row level security;
alter table public.dlcs enable row level security;
alter table public.usage_log enable row level security;
alter table public.offline_tokens enable row level security;

-- Block all public access — only service_role (Edge Function) can access
do $$ begin
  -- Developers
  drop policy if exists "developers_no_public" on public.developers;
  create policy "developers_no_public" on public.developers for all to anon, authenticated using (false) with check (false);
  drop policy if exists "developers_service_role" on public.developers;
  create policy "developers_service_role" on public.developers for all to service_role using (true) with check (true);

  -- API Keys
  drop policy if exists "api_keys_no_public" on public.api_keys;
  create policy "api_keys_no_public" on public.api_keys for all to anon, authenticated using (false) with check (false);
  drop policy if exists "api_keys_service_role" on public.api_keys;
  create policy "api_keys_service_role" on public.api_keys for all to service_role using (true) with check (true);

  -- Games
  drop policy if exists "games_no_public" on public.games;
  create policy "games_no_public" on public.games for all to anon, authenticated using (false) with check (false);
  drop policy if exists "games_service_role" on public.games;
  create policy "games_service_role" on public.games for all to service_role using (true) with check (true);

  -- DLCs
  drop policy if exists "dlcs_no_public" on public.dlcs;
  create policy "dlcs_no_public" on public.dlcs for all to anon, authenticated using (false) with check (false);
  drop policy if exists "dlcs_service_role" on public.dlcs;
  create policy "dlcs_service_role" on public.dlcs for all to service_role using (true) with check (true);

  -- Usage Log
  drop policy if exists "usage_log_no_public" on public.usage_log;
  create policy "usage_log_no_public" on public.usage_log for all to anon, authenticated using (false) with check (false);
  drop policy if exists "usage_log_service_role" on public.usage_log;
  create policy "usage_log_service_role" on public.usage_log for all to service_role using (true) with check (true);

  -- Offline Tokens
  drop policy if exists "offline_tokens_no_public" on public.offline_tokens;
  create policy "offline_tokens_no_public" on public.offline_tokens for all to anon, authenticated using (false) with check (false);
  drop policy if exists "offline_tokens_service_role" on public.offline_tokens;
  create policy "offline_tokens_service_role" on public.offline_tokens for all to service_role using (true) with check (true);
end $$;

-- Grant necessary permissions
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ── Test Data ────────────────────────────────────────────────────────
insert into public.developers (id, email, name, plan) values
  ('00000000-0000-0000-0000-000000000001', 'dev@spacewar.test', 'Spacewar Dev', 'pro')
on conflict (id) do nothing;

insert into public.api_keys (developer_id, key_hash, label) values
  ('00000000-0000-0000-0000-000000000001',
   encode(sha256('sk_test_dlc_protection_demo_key_2026'), 'hex'),
   'test-key')
on conflict (key_hash) do nothing;

insert into public.games (developer_id, steam_app_id, name, offline_token_duration_hours) values
  ('00000000-0000-0000-0000-000000000001', 480, 'Spacewar Test Game', 24)
on conflict (developer_id, steam_app_id) do nothing;

insert into public.dlcs (game_id, steam_dlc_id, aes_encryption_key, bundle_name)
select g.id, 123456, encode(decode(repeat('00', 32), 'hex'), 'base64'), 'test-dlc'
from public.games g
where g.steam_app_id = 480
on conflict (game_id, steam_dlc_id) do update
set aes_encryption_key = excluded.aes_encryption_key;