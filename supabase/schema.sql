create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  source_name text,
  source_type text,
  original_text text not null,
  summary_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  parent_id uuid references public.nodes(id) on delete cascade,
  title text not null,
  content text not null,
  summary text not null,
  color text not null,
  depth integer not null default 0,
  order_index integer not null default 0,
  ai_generated boolean not null default false,
  importance_weight double precision not null default 0.5,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nodes
add column if not exists importance_weight double precision not null default 0.5;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  mime_type text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.revision_sets (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('flashcards', 'objective', 'subjective')),
  scope text not null check (scope in ('all', 'branch', 'node')),
  title text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_maps_user_id_updated_at on public.maps(user_id, updated_at desc);
create index if not exists idx_nodes_map_id_depth_order on public.nodes(map_id, depth, order_index);
create index if not exists idx_nodes_parent_id on public.nodes(parent_id);
create index if not exists idx_files_user_id_map_id on public.files(user_id, map_id);
create index if not exists idx_revision_sets_map_user_created_at on public.revision_sets(map_id, user_id, created_at desc);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute function public.handle_updated_at();

drop trigger if exists maps_set_updated_at on public.maps;
create trigger maps_set_updated_at
before update on public.maps
for each row
execute function public.handle_updated_at();

drop trigger if exists nodes_set_updated_at on public.nodes;
create trigger nodes_set_updated_at
before update on public.nodes
for each row
execute function public.handle_updated_at();

alter table public.users enable row level security;
alter table public.maps enable row level security;
alter table public.nodes enable row level security;
alter table public.files enable row level security;
alter table public.revision_sets enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users for select
using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
on public.users for update
using (auth.uid() = id);

drop policy if exists "maps_manage_own" on public.maps;
create policy "maps_manage_own"
on public.maps for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "nodes_manage_own" on public.nodes;
create policy "nodes_manage_own"
on public.nodes for all
using (
  exists (
    select 1 from public.maps
    where public.maps.id = public.nodes.map_id and public.maps.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.maps
    where public.maps.id = public.nodes.map_id and public.maps.user_id = auth.uid()
  )
);

drop policy if exists "files_manage_own" on public.files;
create policy "files_manage_own"
on public.files for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "revision_sets_manage_own" on public.revision_sets;
create policy "revision_sets_manage_own"
on public.revision_sets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_authenticated_upload" on storage.objects;
create policy "documents_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documents');

drop policy if exists "documents_authenticated_read" on storage.objects;
create policy "documents_authenticated_read"
on storage.objects for select
to authenticated
using (bucket_id = 'documents');
