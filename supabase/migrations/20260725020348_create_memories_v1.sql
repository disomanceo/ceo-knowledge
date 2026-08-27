create extension if not exists pgcrypto;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(trim(content)) > 0),
  category text not null default 'general',
  importance smallint not null default 3 check (importance between 1 and 5),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  source text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_category_idx on public.memories (category);
create index if not exists memories_importance_idx on public.memories (importance desc);
create index if not exists memories_created_at_idx on public.memories (created_at desc);
create index if not exists memories_tags_gin_idx on public.memories using gin (tags);
create index if not exists memories_metadata_gin_idx on public.memories using gin (metadata);
create index if not exists memories_content_fts_idx
  on public.memories
  using gin (to_tsvector('simple', content));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at
before update on public.memories
for each row
execute function public.set_updated_at();

alter table public.memories enable row level security;

comment on table public.memories is 'Structured memories selected by ChatGPT Maple for storage and retrieval.';
comment on column public.memories.content is 'Canonical memory text prepared by ChatGPT.';
comment on column public.memories.category is 'Application-defined category such as preference, person, project, fact, or reminder_context.';
comment on column public.memories.importance is 'Priority from 1 (low) to 5 (high).';
comment on column public.memories.metadata is 'Flexible structured attributes decided by ChatGPT.';;
