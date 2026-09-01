-- Ceo Knowledge V2.1: bounded Remote Console controls
-- Forward-only. Changes remain isolated to ceo_knowledge.

create or replace function ceo_knowledge.device_set_access(p_device_id uuid, p_action text)
returns ceo_knowledge.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_device ceo_knowledge.devices;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_action not in ('disable','enable','revoke') then raise exception 'DEVICE_ACTION_INVALID'; end if;

  if v_action = 'disable' then
    update ceo_knowledge.devices
       set status='disabled', disabled_at=now()
     where id=p_device_id and user_id=v_user
     returning * into v_device;
  elsif v_action = 'enable' then
    update ceo_knowledge.devices
       set status='offline', disabled_at=null
     where id=p_device_id and user_id=v_user and trusted=true
     returning * into v_device;
    if v_device.id is null and exists(select 1 from ceo_knowledge.devices where id=p_device_id and user_id=v_user) then
      raise exception 'DEVICE_REPAIR_REQUIRED';
    end if;
  else
    update ceo_knowledge.devices
       set status='disabled', disabled_at=now(), trusted=false, paired_at=null
     where id=p_device_id and user_id=v_user
     returning * into v_device;
    update ceo_knowledge.device_pairings
       set cancelled_at=coalesce(cancelled_at,now())
     where device_id=p_device_id and user_id=v_user and claimed_at is null;
  end if;

  if v_device.id is null then raise exception 'DEVICE_NOT_FOUND'; end if;
  return v_device;
end;
$$;

create or replace function ceo_knowledge.runtime_job_set_approval(p_job_id uuid, p_decision text)
returns ceo_knowledge.runtime_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_job ceo_knowledge.runtime_jobs;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_decision not in ('approved','denied') then raise exception 'APPROVAL_DECISION_INVALID'; end if;

  update ceo_knowledge.runtime_jobs
     set approval_state=v_decision,
         status=case when v_decision='denied' then 'cancelled' else status end,
         finished_at=case when v_decision='denied' then now() else finished_at end
   where id=p_job_id and user_id=v_user and status='pending' and approval_state='pending' and expires_at>now()
   returning * into v_job;

  if v_job.id is null then raise exception 'APPROVAL_NOT_PENDING'; end if;
  return v_job;
end;
$$;

-- Re-pairing a revoked device must clear disabled_at as well as restoring trust.
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
  update ceo_knowledge.devices set trusted=true, paired_at=now(), status='online', disabled_at=null
   where id=v_pairing.device_id and user_id=v_user returning * into v_device;
  return v_device;
end;
$$;

-- Approval is enforced both when polling and claiming to prevent bypass.
create or replace function ceo_knowledge.device_runtime_jobs(
  p_device_id uuid, p_token_hash text, p_limit integer default 3
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
    and j.approval_state in ('not_required','approved')
  order by j.created_at asc
  limit greatest(1,least(coalesce(p_limit,3),10));
$$;

create or replace function ceo_knowledge.device_job_claim(p_job_id uuid,p_device_id uuid,p_token_hash text)
returns ceo_knowledge.runtime_jobs
language plpgsql security definer set search_path=''
as $$
declare v_job ceo_knowledge.runtime_jobs; begin
  if not exists(select 1 from ceo_knowledge.device_credentials c join ceo_knowledge.devices d on d.id=c.device_id where c.device_id=p_device_id and c.user_id=auth.uid() and c.token_hash=p_token_hash and d.trusted=true and d.disabled_at is null and d.status<>'disabled') then raise exception 'DEVICE_AUTH_FAILED'; end if;
  update ceo_knowledge.runtime_jobs set status='accepted',accepted_at=now()
    where id=p_job_id and user_id=auth.uid() and device_id=p_device_id and status='pending' and expires_at>now() and approval_state in ('not_required','approved')
    returning * into v_job;
  return v_job;
end; $$;

revoke all on function ceo_knowledge.device_set_access(uuid,text) from public, anon;
revoke all on function ceo_knowledge.runtime_job_set_approval(uuid,text) from public, anon;
grant execute on function ceo_knowledge.device_set_access(uuid,text) to authenticated, service_role;
grant execute on function ceo_knowledge.runtime_job_set_approval(uuid,text) to authenticated, service_role;

-- Preserve the existing device RPC grants after CREATE OR REPLACE.
revoke all on function ceo_knowledge.device_pairing_claim(text) from public;
revoke all on function ceo_knowledge.device_runtime_jobs(uuid,text,integer) from public;
revoke all on function ceo_knowledge.device_job_claim(uuid,uuid,text) from public;
grant execute on function ceo_knowledge.device_pairing_claim(text) to authenticated, service_role;
grant execute on function ceo_knowledge.device_runtime_jobs(uuid,text,integer) to authenticated, service_role;
grant execute on function ceo_knowledge.device_job_claim(uuid,uuid,text) to authenticated, service_role;
