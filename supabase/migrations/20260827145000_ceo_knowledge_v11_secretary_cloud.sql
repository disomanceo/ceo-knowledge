-- Ceo Knowledge V1.1 — Secretary Cloud foundation
-- ADDITIVE: only ceo_knowledge objects are created/changed.

create table if not exists ceo_knowledge.profiles (
  user_id uuid primary key default auth.uid(),
  display_name text not null default '',
  locale text not null default 'th-TH',
  timezone text not null default 'Asia/Bangkok',
  assistant_name text not null default 'Ceo',
  notification_preferences jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ceo_knowledge.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  event_id uuid references ceo_knowledge.events(id) on delete cascade,
  task_id uuid references ceo_knowledge.tasks(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'in_app' check (channel in ('in_app','web_push','email','device')),
  status text not null default 'pending' check (status in ('pending','sent','dismissed','cancelled','failed')),
  sent_at timestamptz,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((event_id is not null)::int + (task_id is not null)::int = 1)
);

create table if not exists ceo_knowledge.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  actor_type text not null default 'user' check (actor_type in ('user','mobile','worker','runtime','system','connector')),
  actor_id text not null default '',
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  outcome text not null default 'success' check (outcome in ('success','error','denied','cancelled')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ceo_knowledge_reminders_due_idx on ceo_knowledge.reminders(user_id, status, remind_at);
create index if not exists ceo_knowledge_audit_user_idx on ceo_knowledge.audit_logs(user_id, created_at desc);

create trigger profiles_set_updated_at before update on ceo_knowledge.profiles for each row execute function ceo_knowledge.set_updated_at();
create trigger reminders_set_updated_at before update on ceo_knowledge.reminders for each row execute function ceo_knowledge.set_updated_at();

alter table ceo_knowledge.profiles enable row level security;
alter table ceo_knowledge.reminders enable row level security;
alter table ceo_knowledge.audit_logs enable row level security;

create policy ceo_profiles_owner on ceo_knowledge.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_reminders_owner on ceo_knowledge.reminders for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ceo_audit_owner_read on ceo_knowledge.audit_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ceo_audit_owner_insert on ceo_knowledge.audit_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert, update on ceo_knowledge.profiles, ceo_knowledge.reminders to authenticated, service_role;
revoke update on ceo_knowledge.audit_logs from authenticated;
grant select, insert on ceo_knowledge.audit_logs to authenticated, service_role;
grant usage, select on sequence ceo_knowledge.audit_logs_id_seq to authenticated, service_role;

insert into ceo_knowledge.schema_meta(key, value)
values ('secretary_cloud_version', '1.1.0')
on conflict (key) do update set value = excluded.value, updated_at = now();
