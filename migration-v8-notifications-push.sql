-- ============================================================
-- Avant la Paie - v8
-- Notifications push Firebase Cloud Messaging
-- ============================================================

-- Securite: les dates sont necessaires pour les rappels.
alter table public.envelopes
  add column if not exists date date;

alter table public.savings
  add column if not exists date date;

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  token text not null unique,
  platform text not null default 'web',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can manage own push tokens" on public.push_tokens;
create policy "Users can manage own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens(user_id);

create index if not exists push_tokens_enabled_idx
  on public.push_tokens(enabled);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  notify_for_date date not null,
  created_at timestamptz not null default now(),
  unique(user_id, item_type, item_id, notify_for_date)
);

alter table public.notification_logs enable row level security;

create index if not exists notification_logs_user_date_idx
  on public.notification_logs(user_id, notify_for_date);
