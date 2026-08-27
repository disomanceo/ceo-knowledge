-- Ceo Knowledge V1.2 — Remote Runtime foundation
-- ADDITIVE: only ceo_knowledge objects are created/changed.
-- Device credentials are intentionally stored in a private table with no authenticated grants.

alter table ceo_knowledge.devices
  add column if not exists trusted boolean not null default false,
  add column if not exists paired_at timestamptz,
  add column if not exists disabled_at timestamptz;

create table if not exists ceo_knowledge.device_credentials (
  device_id uuid primary key references ceo_knowledge.devices(id) on delete cascade,
  user_id uuid not null,
  token_hash text not null,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token_hash)
);

create table if not exists ceo_knowledge.device_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null references ceo_knowledge.devices(id) on delete cascade,
  code_hash text not null,
  code_hint text not null default '',
  expires_at timestamptz not null,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create table if not exists ceo_knowledge.runtime_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  device_id uuid not null references ceo_knowledge.devices(id) on delete cascade,
  tool text not null,
  arguments jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','running','completed','failed','cancelled','expired')),
  approval_state text not null default 'not_required' check (approval_state in ('not_required','pending','approved','denied')),
  origin text not null default 'mobile' check (origin in ('mobile','web','worker','system')),
  idempotency_key text,
  result jsonb,
  error jsonb,
  accepted_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists ceo_device_pairings_device_idx on ceo_knowledge.device_pairings(user_id, device_id, expires_at desc);
create index if not exists ceo_runtime_jobs_device_pending_idx on ceo_knowledge.runtime_jobs(user_id, device_id, status, created_at);
create index if not exists ceo_runtime_jobs_user_idx on ceo_knowledge.runtime_jobs(user_id, created_at desc);

create trigger runtime_jobs_set_updated_at before update on ceo_knowledge.runtime_jobs for each row execute function ceo_knowledge.set_updated_at();

alter table ceo_knowledge.device_credentials enable row level security;
alter table ceo_knowledge.device_pairings enable row level security;
alter table ceo_knowledge.runtime_jobs enable row level security;

-- No authenticated policy/grant is created for device_credentials or device_pairings.
-- Access is only through security-definer routines below that bind every operation to auth.uid().
create policy ceo_runtime_jobs_owner on ceo_knowledge.runtime_jobs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke insert, update on ceo_knowledge.devices from authenticated;
grant select on ceo_knowledge.devices to authenticated;
revoke all on ceo_knowledge.device_credentials, ceo_knowledge.device_pairings from authenticated;
revoke update on ceo_knowledge.runtime_jobs from authenticated;
grant select, insert on ceo_knowledge.runtime_jobs to authenticated;
grant select, insert, update on ceo_knowledge.runtime_jobs to service_role;
grant all on ceo_knowledge.device_credentials, ceo_knowledge.device_pairings to service_role;

create or replace function ceo_knowledge.device_register(
  p_device_key text,
  p_device_name text,
  p_device_type text,
  p_runtime_id text,
  p_capabilities jsonb,
  p_token_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns ceo_knowledge.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_device ceo_knowledge.devices;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(length(trim(p_device_key)),0) = 0 or coalesce(length(trim(p_device_name)),0) = 0 or coalesce(length(trim(p_token_hash)),0) < 32 then
    raise exception 'DEVICE_REGISTRATION_INVALID';
  end if;

  insert into ceo_knowledge.devices(user_id,device_key,device_name,device_type,runtime_id,status,capabilities,last_seen_at,metadata)
  values(v_user,trim(p_device_key),trim(p_device_name),coalesce(nullif(trim(p_device_type),''),'windows'),nullif(trim(p_runtime_id),''),'online',coalesce(p_capabilities,'{}'::jsonb),now(),coalesce(p_metadata,'{}'::jsonb))
  on conflict(user_id,device_key) do update set
    device_name=excluded.device_name,
    device_type=excluded.device_type,
    runtime_id=excluded.runtime_id,
    status=case when ceo_knowledge.devices.status='disabled' then 'disabled' else 'online' end,
    capabilities=excluded.capabilities,
    last_seen_at=now(),
    metadata=excluded.metadata
  returning * into v_device;

  insert into ceo_knowledge.device_credentials(device_id,user_id,token_hash,rotated_at)
  values(v_device.id,v_user,trim(p_token_hash),now())
  on conflict(device_id) do update set token_hash=excluded.token_hash, rotated_at=now();

  return v_device;
end;
$$;

create or replace function ceo_knowledge.device_heartbeat(
  p_device_id uuid,
  p_token_hash text,
  p_runtime_id text,
  p_capabilities jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns ceo_knowledge.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_device ceo_knowledge.devices;
begin
  if not exists(select 1 from ceo_knowledge.device_credentials c where c.device_id=p_device_id and c.user_id=v_user and c.token_hash=p_token_hash) then
    raise exception 'DEVICE_AUTH_FAILED';
  end if;
  update ceo_knowledge.devices d set
    runtime_id=coalesce(nullif(trim(p_runtime_id),''),d.runtime_id),
    status=case when d.status='disabled' then 'disabled' else 'online' end,
    capabilities=coalesce(p_capabilities,d.capabilities),
    last_seen_at=now(),
    metadata=coalesce(p_metadata,d.metadata)
  where d.id=p_device_id and d.user_id=v_user
  returning * into v_device;
  if v_device.id is null then raise exception 'DEVICE_NOT_FOUND'; end if;
  return v_device;
end;
$$;

create or replace function ceo_knowledge.device_pairing_create(
  p_device_id uuid,
  p_token_hash text,
  p_code_hash text,
  p_code_hint text,
  p_expires_at timestamptz
)
returns ceo_knowledge.device_pairings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pairing ceo_knowledge.device_pairings;
begin
  if not exists(select 1 from ceo_knowledge.device_credentials c where c.device_id=p_device_id and c.user_id=v_user and c.token_hash=p_token_hash) then
    raise exception 'DEVICE_AUTH_FAILED';
  end if;
  update ceo_knowledge.device_pairings set cancelled_at=now()
    where user_id=v_user and device_id=p_device_id and claimed_at is null and cancelled_at is null;
  insert into ceo_knowledge.device_pairings(user_id,device_id,code_hash,code_hint,expires_at)
  values(v_user,p_device_id,p_code_hash,coalesce(p_code_hint,''),p_expires_at)
  returning * into v_pairing;
  return v_pairing;
end;
$$;

create or replace function ceo_knowledge.device_pairing_claim(p_code_hash text)
returns ceo_knowledge.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_pairing ceo_knowledge.device_pairings;
  v_device ceo_knowledge.devices;
begin
  select * into v_pairing from ceo_knowledge.device_pairings
   where user_id=v_user and code_hash=p_code_hash and claimed_at is null and cancelled_at is null and expires_at>now()
   order by created_at desc limit 1 for update;
  if v_pairing.id is null then raise exception 'PAIRING_CODE_INVALID_OR_EXPIRED'; end if;
  update ceo_knowledge.device_pairings set claimed_at=now() where id=v_pairing.id;
  update ceo_knowledge.devices set trusted=true, paired_at=now(), status='online'
   where id=v_pairing.device_id and user_id=v_user returning * into v_device;
  return v_device;
end;
$$;

create or replace function ceo_knowledge.device_runtime_jobs(
  p_device_id uuid,
  p_token_hash text,
  p_limit integer default 3
)
returns setof ceo_knowledge.runtime_jobs
language sql
security definer
set search_path = ''
as $$
  select j.* from ceo_knowledge.runtime_jobs j
  join ceo_knowledge.devices d on d.id=j.device_id and d.user_id=j.user_id
  join ceo_knowledge.device_credentials c on c.device_id=d.id and c.user_id=d.user_id
  where j.user_id=auth.uid() and j.device_id=p_device_id and c.token_hash=p_token_hash
    and d.trusted=true and d.disabled_at is null and d.status<>'disabled'
    and j.status='pending' and j.expires_at>now()
  order by j.created_at asc
  limit greatest(1,least(coalesce(p_limit,3),10));
$$;

create or replace function ceo_knowledge.device_job_claim(p_job_id uuid,p_device_id uuid,p_token_hash text)
returns ceo_knowledge.runtime_jobs
language plpgsql security definer set search_path=''
as $$
declare v_job ceo_knowledge.runtime_jobs; begin
  if not exists(select 1 from ceo_knowledge.device_credentials c join ceo_knowledge.devices d on d.id=c.device_id where c.device_id=p_device_id and c.user_id=auth.uid() and c.token_hash=p_token_hash and d.trusted=true and d.status<>'disabled') then raise exception 'DEVICE_AUTH_FAILED'; end if;
  update ceo_knowledge.runtime_jobs set status='accepted',accepted_at=now()
    where id=p_job_id and user_id=auth.uid() and device_id=p_device_id and status='pending' and expires_at>now()
    returning * into v_job;
  return v_job;
end; $$;

create or replace function ceo_knowledge.device_job_start(p_job_id uuid,p_device_id uuid,p_token_hash text)
returns ceo_knowledge.runtime_jobs
language plpgsql security definer set search_path=''
as $$
declare v_job ceo_knowledge.runtime_jobs; begin
  if not exists(select 1 from ceo_knowledge.device_credentials c where c.device_id=p_device_id and c.user_id=auth.uid() and c.token_hash=p_token_hash) then raise exception 'DEVICE_AUTH_FAILED'; end if;
  update ceo_knowledge.runtime_jobs set status='running',started_at=now()
    where id=p_job_id and user_id=auth.uid() and device_id=p_device_id and status='accepted'
    returning * into v_job;
  return v_job;
end; $$;

create or replace function ceo_knowledge.device_job_finish(p_job_id uuid,p_device_id uuid,p_token_hash text,p_ok boolean,p_result jsonb default null,p_error jsonb default null)
returns ceo_knowledge.runtime_jobs
language plpgsql security definer set search_path=''
as $$
declare v_job ceo_knowledge.runtime_jobs; begin
  if not exists(select 1 from ceo_knowledge.device_credentials c where c.device_id=p_device_id and c.user_id=auth.uid() and c.token_hash=p_token_hash) then raise exception 'DEVICE_AUTH_FAILED'; end if;
  update ceo_knowledge.runtime_jobs set status=case when p_ok then 'completed' else 'failed' end,result=case when p_ok then p_result else null end,error=case when p_ok then null else p_error end,finished_at=now()
    where id=p_job_id and user_id=auth.uid() and device_id=p_device_id and status in ('accepted','running')
    returning * into v_job;
  return v_job;
end; $$;

revoke all on function ceo_knowledge.device_register(text,text,text,text,jsonb,text,jsonb) from public;
revoke all on function ceo_knowledge.device_heartbeat(uuid,text,text,jsonb,jsonb) from public;
revoke all on function ceo_knowledge.device_pairing_create(uuid,text,text,text,timestamptz) from public;
revoke all on function ceo_knowledge.device_pairing_claim(text) from public;
revoke all on function ceo_knowledge.device_runtime_jobs(uuid,text,integer) from public;
revoke all on function ceo_knowledge.device_job_claim(uuid,uuid,text) from public;
revoke all on function ceo_knowledge.device_job_start(uuid,uuid,text) from public;
revoke all on function ceo_knowledge.device_job_finish(uuid,uuid,text,boolean,jsonb,jsonb) from public;

grant execute on function ceo_knowledge.device_register(text,text,text,text,jsonb,text,jsonb) to authenticated, service_role;
grant execute on function ceo_knowledge.device_heartbeat(uuid,text,text,jsonb,jsonb) to authenticated, service_role;
grant execute on function ceo_knowledge.device_pairing_create(uuid,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function ceo_knowledge.device_pairing_claim(text) to authenticated, service_role;
grant execute on function ceo_knowledge.device_runtime_jobs(uuid,text,integer) to authenticated, service_role;
grant execute on function ceo_knowledge.device_job_claim(uuid,uuid,text) to authenticated, service_role;
grant execute on function ceo_knowledge.device_job_start(uuid,uuid,text) to authenticated, service_role;
grant execute on function ceo_knowledge.device_job_finish(uuid,uuid,text,boolean,jsonb,jsonb) to authenticated, service_role;

insert into ceo_knowledge.schema_meta(key, value)
values ('remote_runtime_version', '1.2.0')
on conflict (key) do update set value = excluded.value, updated_at = now();
