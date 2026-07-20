-- Stores the complete message history and scope for each authenticated user's chat.
create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  state jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_at_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "Users can read their own conversations" on public.conversations;
create policy "Users can read their own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own conversations" on public.conversations;
create policy "Users can create their own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.conversations;
create policy "Users can update their own conversations"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
