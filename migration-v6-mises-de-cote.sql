-- ============================================================
-- AJOUT DES MISES DE COTE
-- A executer dans Supabase SQL Editor
-- ============================================================

create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text default '💛',
  name text not null,
  amount numeric(12,2) not null default 0,
  target_amount numeric(12,2),
  date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.savings enable row level security;

drop policy if exists "Users can read own savings" on public.savings;
drop policy if exists "Users can insert own savings" on public.savings;
drop policy if exists "Users can update own savings" on public.savings;
drop policy if exists "Users can delete own savings" on public.savings;

create policy "Users can read own savings"
on public.savings for select
using (auth.uid() = user_id);

create policy "Users can insert own savings"
on public.savings for insert
with check (auth.uid() = user_id);

create policy "Users can update own savings"
on public.savings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own savings"
on public.savings for delete
using (auth.uid() = user_id);

notify pgrst, 'reload schema';
