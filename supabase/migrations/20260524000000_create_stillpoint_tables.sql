create extension if not exists "pgcrypto";

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Journal',
  streak integer not null default 0,
  last_streak_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  entry_date date not null default current_date,
  tags text[] not null default '{}',
  saved_at timestamptz,
  user_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journals_user_id_updated_at_idx
  on public.journals(user_id, updated_at desc);

create index if not exists entries_user_id_journal_id_entry_date_idx
  on public.entries(user_id, journal_id, entry_date desc);

alter table public.journals enable row level security;
alter table public.entries enable row level security;

drop policy if exists "Users can read their journals" on public.journals;
drop policy if exists "Users can insert their journals" on public.journals;
drop policy if exists "Users can update their journals" on public.journals;
drop policy if exists "Users can delete their journals" on public.journals;

create policy "Users can read their journals"
  on public.journals for select
  using (auth.uid() = user_id);

create policy "Users can insert their journals"
  on public.journals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their journals"
  on public.journals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their journals"
  on public.journals for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their entries" on public.entries;
drop policy if exists "Users can insert their entries" on public.entries;
drop policy if exists "Users can update their entries" on public.entries;
drop policy if exists "Users can delete their entries" on public.entries;

create policy "Users can read their entries"
  on public.entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their entries"
  on public.entries for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.journals
      where journals.id = entries.journal_id
        and journals.user_id = auth.uid()
    )
  );

create policy "Users can update their entries"
  on public.entries for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.journals
      where journals.id = entries.journal_id
        and journals.user_id = auth.uid()
    )
  );

create policy "Users can delete their entries"
  on public.entries for delete
  using (auth.uid() = user_id);
