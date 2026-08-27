-- Ceo Knowledge V2.0 — ingestion, semantic search, graph and connector foundation
-- ADDITIVE: only ceo_knowledge objects plus the optional vector extension are created/changed.

create extension if not exists vector with schema extensions;

alter table ceo_knowledge.sources
  add column if not exists external_provider text,
  add column if not exists external_id text;

alter table ceo_knowledge.events
  add column if not exists external_provider text,
  add column if not exists external_id text;

create unique index if not exists ceo_sources_external_unique
  on ceo_knowledge.sources(user_id, external_provider, external_id)
  where external_provider is not null and external_id is not null;
create unique index if not exists ceo_events_external_unique
  on ceo_knowledge.events(user_id, external_provider, external_id)
  where external_provider is not null and external_id is not null;

create table if not exists ceo_knowledge.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','reading','extracting','saving','embedding','completed','failed','cancelled')),
  engine text not null default 'runtime',
  model text not null default '',
  bytes_read bigint not null default 0 check (bytes_read >= 0),
  extracted_entities integer not null default 0 check (extracted_entities >= 0),
  detail jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ceo_knowledge.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  knowledge_id uuid not null references ceo_knowledge.knowledge_entries(id) on delete cascade,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  ordinal integer not null check (ordinal >= 0),
  content text not null check (char_length(trim(content)) > 0),
  content_hash text not null,
  token_estimate integer not null default 0 check (token_estimate >= 0),
  embedding_model text,
  embedding extensions.vector(768),
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_id, ordinal, content_hash)
);

create table if not exists ceo_knowledge.knowledge_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  from_knowledge_id uuid not null references ceo_knowledge.knowledge_entries(id) on delete cascade,
  to_knowledge_id uuid not null references ceo_knowledge.knowledge_entries(id) on delete cascade,
  relation text not null default 'related_to',
  weight numeric(6,5) not null default 1 check (weight between 0 and 1),
  source text not null default 'manual' check (source in ('manual','ingest','semantic','connector','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, from_knowledge_id, to_knowledge_id, relation),
  check (from_knowledge_id <> to_knowledge_id)
);

create table if not exists ceo_knowledge.knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  knowledge_id uuid not null references ceo_knowledge.knowledge_entries(id) on delete cascade,
  revision integer not null check (revision > 0),
  title text not null,
  summary text not null default '',
  content text not null,
  status text not null,
  reason text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (knowledge_id, revision)
);

create table if not exists ceo_knowledge.connector_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null check (provider in ('google','obsidian','custom')),
  account_key text not null,
  display_name text not null default '',
  token_ciphertext text,
  token_nonce text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, account_key)
);

create table if not exists ceo_knowledge.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  connector_id uuid references ceo_knowledge.connector_accounts(id) on delete set null,
  provider text not null,
  sync_type text not null,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  imported integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  error jsonb,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ceo_ingest_runs_user_idx on ceo_knowledge.ingest_runs(user_id, created_at desc);
create index if not exists ceo_chunks_entry_idx on ceo_knowledge.knowledge_chunks(user_id, knowledge_id, ordinal);
create index if not exists ceo_chunks_hash_idx on ceo_knowledge.knowledge_chunks(user_id, content_hash);
create index if not exists ceo_chunks_embedding_idx on ceo_knowledge.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;
create index if not exists ceo_links_from_idx on ceo_knowledge.knowledge_links(user_id, from_knowledge_id);
create index if not exists ceo_links_to_idx on ceo_knowledge.knowledge_links(user_id, to_knowledge_id);
create index if not exists ceo_revisions_knowledge_idx on ceo_knowledge.knowledge_revisions(user_id, knowledge_id, revision desc);
create index if not exists ceo_sync_runs_user_idx on ceo_knowledge.sync_runs(user_id, created_at desc);

create trigger ingest_runs_set_updated_at before update on ceo_knowledge.ingest_runs for each row execute function ceo_knowledge.set_updated_at();
create trigger knowledge_chunks_set_updated_at before update on ceo_knowledge.knowledge_chunks for each row execute function ceo_knowledge.set_updated_at();
create trigger connector_accounts_set_updated_at before update on ceo_knowledge.connector_accounts for each row execute function ceo_knowledge.set_updated_at();

alter table ceo_knowledge.ingest_runs enable row level security;
alter table ceo_knowledge.knowledge_chunks enable row level security;
alter table ceo_knowledge.knowledge_links enable row level security;
alter table ceo_knowledge.knowledge_revisions enable row level security;
alter table ceo_knowledge.connector_accounts enable row level security;
alter table ceo_knowledge.sync_runs enable row level security;

create policy ceo_ingest_runs_owner on ceo_knowledge.ingest_runs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_chunks_owner on ceo_knowledge.knowledge_chunks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_links_owner on ceo_knowledge.knowledge_links for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_revisions_owner on ceo_knowledge.knowledge_revisions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_sync_runs_owner on ceo_knowledge.sync_runs for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update on ceo_knowledge.ingest_runs, ceo_knowledge.knowledge_chunks, ceo_knowledge.knowledge_links, ceo_knowledge.knowledge_revisions to authenticated, service_role;
revoke all on ceo_knowledge.connector_accounts from authenticated;
revoke insert, update on ceo_knowledge.sync_runs from authenticated;
grant select on ceo_knowledge.sync_runs to authenticated;
grant select, insert, update on ceo_knowledge.sync_runs to service_role;
grant select, insert, update, delete on ceo_knowledge.connector_accounts to service_role;

create or replace function ceo_knowledge.match_knowledge_chunks(
  p_embedding extensions.vector(768),
  p_limit integer default 10,
  p_min_similarity double precision default 0.55
)
returns table (
  chunk_id uuid,
  knowledge_id uuid,
  title text,
  chunk_content text,
  similarity double precision,
  source_id uuid,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.knowledge_id,
    k.title,
    c.content,
    (1 - (c.embedding operator(extensions.<=>) p_embedding))::double precision as similarity,
    c.source_id,
    c.metadata
  from ceo_knowledge.knowledge_chunks c
  join ceo_knowledge.knowledge_entries k on k.id = c.knowledge_id
  where c.user_id = auth.uid()
    and k.user_id = auth.uid()
    and c.status = 'active'
    and k.status = 'active'
    and c.embedding is not null
    and (1 - (c.embedding operator(extensions.<=>) p_embedding)) >= p_min_similarity
  order by c.embedding operator(extensions.<=>) p_embedding
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function ceo_knowledge.match_knowledge_chunks(extensions.vector, integer, double precision) to authenticated, service_role;

insert into ceo_knowledge.schema_meta(key, value)
values ('knowledge_expansion_version', '2.0.0')
on conflict (key) do update set value = excluded.value, updated_at = now();
