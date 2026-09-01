create table if not exists public.brickcheck_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username)),
  sets jsonb not null default '[]'::jsonb,
  api_key text not null default '',
  active_set_id text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.brickcheck_accounts enable row level security;

drop policy if exists "BrickCheck users can read their account" on public.brickcheck_accounts;
create policy "BrickCheck users can read their account"
on public.brickcheck_accounts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "BrickCheck users can create their account" on public.brickcheck_accounts;
create policy "BrickCheck users can create their account"
on public.brickcheck_accounts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "BrickCheck users can update their account" on public.brickcheck_accounts;
create policy "BrickCheck users can update their account"
on public.brickcheck_accounts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "BrickCheck users can delete their account" on public.brickcheck_accounts;
create policy "BrickCheck users can delete their account"
on public.brickcheck_accounts for delete
to authenticated
using ((select auth.uid()) = user_id);
