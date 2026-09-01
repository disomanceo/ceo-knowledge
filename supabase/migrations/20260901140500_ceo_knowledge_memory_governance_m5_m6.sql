-- Ceo Knowledge Memory Governance M5-M6: maintenance runs and safe node management.
-- Additive only. No hard delete is exposed.

create table if not exists ceo_knowledge.memory_maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  mode text not null check (mode in ('preview','apply')),
  status text not null default 'completed' check (status in ('completed','partial','failed')),
  plan jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ceo_memory_maintenance_runs_user_idx on ceo_knowledge.memory_maintenance_runs(user_id,created_at desc);
alter table ceo_knowledge.memory_maintenance_runs enable row level security;
create policy ceo_memory_maintenance_owner_select on ceo_knowledge.memory_maintenance_runs for select to authenticated using ((select auth.uid())=user_id);
create policy ceo_memory_maintenance_owner_insert on ceo_knowledge.memory_maintenance_runs for insert to authenticated with check ((select auth.uid())=user_id);
grant select,insert on ceo_knowledge.memory_maintenance_runs to authenticated;
grant select,insert,update,delete on ceo_knowledge.memory_maintenance_runs to service_role;

create or replace function ceo_knowledge.memory_node_manage(
  p_node_id text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_row ceo_knowledge.memory_nodes;
  v_tier text;
  v_reason text := trim(coalesce(p_payload->>'reason',''));
  v_canonical text := trim(coalesce(p_payload->>'canonicalOf',''));
  v_refs text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'derivedFrom','[]'::jsonb))),'{}'::text[]);
  v_event_id text := 'mem_manage_' || replace(gen_random_uuid()::text,'-','');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('set_tier','archive','restore','mark_canonical','link_duplicate','touch') then raise exception 'MEMORY_MANAGE_ACTION_INVALID'; end if;
  select * into v_row from ceo_knowledge.memory_nodes where user_id=v_user and node_id=p_node_id for update;
  if v_row.id is null then raise exception 'MEMORY_NODE_NOT_FOUND'; end if;

  if p_action='set_tier' then
    v_tier := trim(coalesce(p_payload->>'tier',''));
    if v_tier not in ('hot','warm','cold','pinned') then raise exception 'MEMORY_TIER_INVALID'; end if;
    if v_row.tier='pinned' and v_tier<>'pinned' and coalesce((p_payload->>'force')::boolean,false)=false then raise exception 'MEMORY_PINNED_PROTECTED'; end if;
    update ceo_knowledge.memory_nodes set tier=v_tier,revision=revision+1,metadata=metadata||coalesce(p_payload->'metadata','{}'::jsonb) where id=v_row.id returning * into v_row;
  elsif p_action='archive' then
    if (v_row.tier='pinned' or v_row.retention_policy='permanent') and coalesce((p_payload->>'force')::boolean,false)=false then raise exception 'MEMORY_PERMANENT_PROTECTED'; end if;
    update ceo_knowledge.memory_nodes set tier='cold',revision=revision+1,metadata=metadata||jsonb_build_object('archived',true,'archivedAt',now(),'archiveReason',coalesce(nullif(v_reason,''),'housekeeping')) where id=v_row.id returning * into v_row;
  elsif p_action='restore' then
    update ceo_knowledge.memory_nodes set tier=case when tier='pinned' then 'pinned' else 'hot' end,revision=revision+1,metadata=(metadata-'archived'-'archivedAt'-'archiveReason'-'canonicalOf')||coalesce(p_payload->'metadata','{}'::jsonb) where id=v_row.id returning * into v_row;
  elsif p_action='mark_canonical' then
    update ceo_knowledge.memory_nodes set
      revision=revision+1,
      derived_from=(select coalesce(array_agg(distinct x),'{}'::text[]) from unnest(coalesce(derived_from,'{}'::text[])||v_refs) x),
      metadata=metadata||jsonb_build_object('canonical',true,'canonicalUpdatedAt',now())||coalesce(p_payload->'metadata','{}'::jsonb)
      where id=v_row.id returning * into v_row;
  elsif p_action='link_duplicate' then
    if v_canonical='' then raise exception 'MEMORY_CANONICAL_REQUIRED'; end if;
    if (v_row.tier='pinned' or v_row.retention_policy='permanent') and coalesce((p_payload->>'force')::boolean,false)=false then raise exception 'MEMORY_PERMANENT_PROTECTED'; end if;
    update ceo_knowledge.memory_nodes set tier='cold',revision=revision+1,metadata=metadata||jsonb_build_object('archived',true,'archivedAt',now(),'archiveReason','duplicate','canonicalOf',v_canonical) where id=v_row.id returning * into v_row;
  else
    update ceo_knowledge.memory_nodes set revision=revision+1,metadata=metadata||coalesce(p_payload->'metadata','{}'::jsonb) where id=v_row.id returning * into v_row;
  end if;

  perform ceo_knowledge.memory_sync_provenance(v_user,v_row.node_id,v_row.source_refs,v_row.derived_from);
  insert into ceo_knowledge.memory_sync_events(user_id,client_event_id,node_id,direction,base_revision,revision,content_hash,status,detail)
  values(v_user,v_event_id,v_row.node_id,'resolution',greatest(0,v_row.revision-1),v_row.revision,v_row.content_hash,'resolved',jsonb_build_object('action',p_action,'payload',coalesce(p_payload,'{}'::jsonb)));
  return ceo_knowledge.memory_snapshot(v_row);
end $$;

revoke all on function ceo_knowledge.memory_node_manage(text,text,jsonb) from public;
grant execute on function ceo_knowledge.memory_node_manage(text,text,jsonb) to authenticated,service_role;

insert into ceo_knowledge.schema_meta(key,value) values('schema_version','2.3.0')
on conflict(key) do update set value=excluded.value,updated_at=now();
