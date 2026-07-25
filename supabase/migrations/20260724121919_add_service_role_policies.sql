-- Add service_role access policies for Edge Function
-- First disable RLS for service_role operations
alter table public.games enable row level security;
alter table public.dlcs enable row level security;

drop policy if exists "games_service_role_access" on public.games;
create policy "games_service_role_access"
  on public.games
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "dlcs_service_role_access" on public.dlcs;
create policy "dlcs_service_role_access"
  on public.dlcs
  for all
  to service_role
  using (true)
  with check (true);

-- Grant necessary permissions
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

