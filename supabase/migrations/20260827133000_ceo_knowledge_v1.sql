-- Ceo Knowledge v1.0 / Secretary Brain
-- ADDITIVE ONLY: this migration creates objects inside ceo_knowledge and does not
-- alter/drop/update existing application tables in public/auth/storage.

create schema if not exists ceo_knowledge;

comment on schema ceo_knowledge is
  'Ceo Knowledge isolated secretary-brain data. Existing Ceo/Personal MCP schemas are intentionally untouched.';

create or replace function ceo_knowledge.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table ceo_knowledge.schema_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into ceo_knowledge.schema_meta(key, value)
values ('schema_version', '1.0.0')
on conflict (key) do nothing;

create table ceo_knowledge.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(trim(name)) > 0),
  description text not null default '',
  project_key text not null,
  status text not null default 'active' check (status in ('active','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_key)
);

create table ceo_knowledge.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  device_key text not null,
  device_name text not null,
  device_type text not null default 'windows',
  runtime_id text,
  status text not null default 'offline' check (status in ('online','offline','disabled')),
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create table ceo_knowledge.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  device_id uuid references ceo_knowledge.devices(id) on delete set null,
  source_type text not null default 'manual' check (source_type in ('manual','chat','file','web','email','calendar','tool')),
  name text not null check (char_length(trim(name)) > 0),
  local_path text,
  url text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  sha256 text,
  availability text not null default 'unknown' check (availability in ('online','offline','missing','unknown')),
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ceo_knowledge.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  title text not null default '',
  content text not null check (char_length(trim(content)) > 0),
  memory_type text not null default 'fact' check (memory_type in ('fact','preference','rule','decision','context','note')),
  importance smallint not null default 2 check (importance between 0 and 3),
  scope text not null default 'global' check (scope in ('global','project','session')),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active','outdated','archived','forgotten','superseded')),
  tags text[] not null default '{}',
  fingerprint text not null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table ceo_knowledge.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  event_type text not null default 'meeting' check (event_type in ('meeting','appointment','deadline','reminder','activity','other')),
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  timezone text not null default 'Asia/Bangkok',
  location text not null default '',
  status text not null default 'planned' check (status in ('planned','completed','cancelled','overdue','snoozed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  remind_at timestamptz,
  completed_at timestamptz,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create table ceo_knowledge.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','waiting','completed','cancelled','overdue','suggested')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  waiting_for text not null default '',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ceo_knowledge.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) > 0),
  nickname text not null default '',
  position text not null default '',
  organization text not null default '',
  relationship text not null default '',
  notes text not null default '',
  aliases text[] not null default '{}',
  tags text[] not null default '{}',
  importance smallint not null default 2 check (importance between 0 and 3),
  status text not null default 'active' check (status in ('active','archived','forgotten')),
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table ceo_knowledge.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  supersedes_id uuid references ceo_knowledge.decisions(id) on delete set null,
  title text not null default '',
  content text not null check (char_length(trim(content)) > 0),
  rationale text not null default '',
  importance smallint not null default 3 check (importance between 0 and 3),
  status text not null default 'active' check (status in ('active','superseded','archived','forgotten')),
  tags text[] not null default '{}',
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table ceo_knowledge.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  conversation_key text not null,
  title text not null default '',
  summary text not null check (char_length(trim(summary)) > 0),
  decisions text[] not null default '{}',
  open_loops text[] not null default '{}',
  facts text[] not null default '{}',
  status text not null default 'active' check (status in ('active','archived','forgotten')),
  fingerprint text not null,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, conversation_key)
);

create table ceo_knowledge.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references ceo_knowledge.projects(id) on delete set null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  summary text not null default '',
  content text not null check (char_length(trim(content)) > 0),
  knowledge_type text not null default 'fact' check (knowledge_type in ('fact','concept','procedure','project','reference','note')),
  topic text not null default '',
  importance smallint not null default 2 check (importance between 0 and 3),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  status text not null default 'active' check (status in ('active','outdated','archived','forgotten','superseded')),
  tags text[] not null default '{}',
  fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

-- Search/filter indexes. V1 intentionally uses normal PostgreSQL search, not pgvector.
create index ceo_knowledge_projects_user_status_idx on ceo_knowledge.projects(user_id, status, updated_at desc);
create index ceo_knowledge_devices_user_status_idx on ceo_knowledge.devices(user_id, status, last_seen_at desc);
create index ceo_knowledge_sources_user_idx on ceo_knowledge.sources(user_id, created_at desc);
create index ceo_knowledge_sources_sha_idx on ceo_knowledge.sources(user_id, sha256) where sha256 is not null;
create index ceo_knowledge_memories_user_status_idx on ceo_knowledge.memories(user_id, status, importance desc, updated_at desc);
create index ceo_knowledge_memories_project_idx on ceo_knowledge.memories(user_id, project_id, updated_at desc);
create index ceo_knowledge_memories_tags_idx on ceo_knowledge.memories using gin(tags);
create index ceo_knowledge_memories_fts_idx on ceo_knowledge.memories using gin(to_tsvector('simple', coalesce(title,'') || ' ' || content));
create index ceo_knowledge_events_user_start_idx on ceo_knowledge.events(user_id, start_at, status);
create index ceo_knowledge_tasks_user_status_idx on ceo_knowledge.tasks(user_id, status, due_at, priority);
create index ceo_knowledge_people_user_status_idx on ceo_knowledge.people(user_id, status, updated_at desc);
create index ceo_knowledge_people_fts_idx on ceo_knowledge.people using gin(to_tsvector('simple', full_name || ' ' || organization || ' ' || notes));
create index ceo_knowledge_decisions_user_status_idx on ceo_knowledge.decisions(user_id, status, decided_at desc);
create index ceo_knowledge_decisions_fts_idx on ceo_knowledge.decisions using gin(to_tsvector('simple', coalesce(title,'') || ' ' || content || ' ' || rationale));
create index ceo_knowledge_conversations_user_idx on ceo_knowledge.conversation_summaries(user_id, updated_at desc);
create index ceo_knowledge_conversations_fts_idx on ceo_knowledge.conversation_summaries using gin(to_tsvector('simple', coalesce(title,'') || ' ' || summary));
create index ceo_knowledge_entries_user_status_idx on ceo_knowledge.knowledge_entries(user_id, status, importance desc, updated_at desc);
create index ceo_knowledge_entries_tags_idx on ceo_knowledge.knowledge_entries using gin(tags);
create index ceo_knowledge_entries_fts_idx on ceo_knowledge.knowledge_entries using gin(to_tsvector('simple', title || ' ' || summary || ' ' || content));

-- Keep updated_at deterministic without relying on public helper functions.
create trigger projects_set_updated_at before update on ceo_knowledge.projects for each row execute function ceo_knowledge.set_updated_at();
create trigger devices_set_updated_at before update on ceo_knowledge.devices for each row execute function ceo_knowledge.set_updated_at();
create trigger sources_set_updated_at before update on ceo_knowledge.sources for each row execute function ceo_knowledge.set_updated_at();
create trigger memories_set_updated_at before update on ceo_knowledge.memories for each row execute function ceo_knowledge.set_updated_at();
create trigger events_set_updated_at before update on ceo_knowledge.events for each row execute function ceo_knowledge.set_updated_at();
create trigger tasks_set_updated_at before update on ceo_knowledge.tasks for each row execute function ceo_knowledge.set_updated_at();
create trigger people_set_updated_at before update on ceo_knowledge.people for each row execute function ceo_knowledge.set_updated_at();
create trigger decisions_set_updated_at before update on ceo_knowledge.decisions for each row execute function ceo_knowledge.set_updated_at();
create trigger conversation_summaries_set_updated_at before update on ceo_knowledge.conversation_summaries for each row execute function ceo_knowledge.set_updated_at();
create trigger knowledge_entries_set_updated_at before update on ceo_knowledge.knowledge_entries for each row execute function ceo_knowledge.set_updated_at();

-- RLS: every user can access only rows owned by their auth.uid().
alter table ceo_knowledge.projects enable row level security;
alter table ceo_knowledge.devices enable row level security;
alter table ceo_knowledge.sources enable row level security;
alter table ceo_knowledge.memories enable row level security;
alter table ceo_knowledge.events enable row level security;
alter table ceo_knowledge.tasks enable row level security;
alter table ceo_knowledge.people enable row level security;
alter table ceo_knowledge.decisions enable row level security;
alter table ceo_knowledge.conversation_summaries enable row level security;
alter table ceo_knowledge.knowledge_entries enable row level security;

create policy ceo_projects_owner on ceo_knowledge.projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_devices_owner on ceo_knowledge.devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_sources_owner on ceo_knowledge.sources for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_memories_owner on ceo_knowledge.memories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_events_owner on ceo_knowledge.events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_tasks_owner on ceo_knowledge.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_people_owner on ceo_knowledge.people for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_decisions_owner on ceo_knowledge.decisions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_conversations_owner on ceo_knowledge.conversation_summaries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_entries_owner on ceo_knowledge.knowledge_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- schema_meta contains no user data. Authenticated users may read version only.
alter table ceo_knowledge.schema_meta enable row level security;
create policy ceo_schema_meta_read on ceo_knowledge.schema_meta for select to authenticated using (true);

-- Explicit Data API grants. The schema itself must also be added to the project's
-- Data API "Exposed schemas" setting; this is handled separately so this migration
-- never overrides Maple's existing PostgREST schema configuration.
grant usage on schema ceo_knowledge to authenticated, service_role;
grant select on ceo_knowledge.schema_meta to authenticated, service_role;
grant select, insert, update on
  ceo_knowledge.projects,
  ceo_knowledge.devices,
  ceo_knowledge.sources,
  ceo_knowledge.memories,
  ceo_knowledge.events,
  ceo_knowledge.tasks,
  ceo_knowledge.people,
  ceo_knowledge.decisions,
  ceo_knowledge.conversation_summaries,
  ceo_knowledge.knowledge_entries
  to authenticated, service_role;
grant usage on schema ceo_knowledge to postgres;
grant all privileges on all tables in schema ceo_knowledge to postgres;
grant execute on function ceo_knowledge.set_updated_at() to authenticated, service_role;

alter default privileges for role postgres in schema ceo_knowledge grant select, insert, update on tables to authenticated, service_role;
alter default privileges for role postgres in schema ceo_knowledge grant execute on routines to authenticated, service_role;

comment on table ceo_knowledge.memories is 'Long-lived Ceo Secretary memory selected from conversations or explicit remember commands.';
comment on table ceo_knowledge.events is 'Appointments, meetings, deadlines and reminders for Ceo Secretary.';
comment on table ceo_knowledge.tasks is 'Actionable work and open-loop follow-up state.';
comment on table ceo_knowledge.people is 'People context for the signed-in Ceo user; secrets must never be stored here.';
comment on table ceo_knowledge.decisions is 'Explicit project/workflow decisions with supersession support.';
comment on table ceo_knowledge.conversation_summaries is 'Compact rolling summaries, decisions and open loops; not raw transcripts.';
comment on table ceo_knowledge.knowledge_entries is 'General structured knowledge. V1 uses PostgreSQL search; vectors are deferred.';
comment on table ceo_knowledge.sources is 'Metadata pointing to local/web source material. Binary files remain outside Supabase by design.';
