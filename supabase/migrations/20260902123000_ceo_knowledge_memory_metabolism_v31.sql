-- Ceo Knowledge V3.1 Memory Metabolism: lifecycle, supersession and retrieval evaluation.
-- Additive forward-fix only.

alter table ceo_knowledge.memory_nodes add column if not exists lifecycle_status text not null default 'current';
alter table ceo_knowledge.memory_nodes add column if not exists valid_from timestamptz;
alter table ceo_knowledge.memory_nodes add column if not exists valid_to timestamptz;
alter table ceo_knowledge.memory_nodes add column if not exists superseded_by text;
alter table ceo_knowledge.memory_nodes add column if not exists canonical_key text;
update ceo_knowledge.memory_nodes set valid_from=coalesce(valid_from,created_at) where valid_from is null;
update ceo_knowledge.memory_nodes set lifecycle_status='superseded',superseded_by=metadata->>'canonicalOf',valid_to=coalesce(valid_to,updated_at) where coalesce(metadata->>'canonicalOf','')<>'';
update ceo_knowledge.memory_nodes set lifecycle_status='refuted' where truth_status='refuted';
update ceo_knowledge.memory_nodes set lifecycle_status='conflicting' where evidence_status='conflicting' and lifecycle_status='current';
alter table ceo_knowledge.memory_nodes drop constraint if exists memory_nodes_lifecycle_status_check;
alter table ceo_knowledge.memory_nodes add constraint memory_nodes_lifecycle_status_check check (lifecycle_status in ('current','superseded','conflicting','stale','refuted'));
create index if not exists ceo_memory_nodes_lifecycle_idx on ceo_knowledge.memory_nodes(user_id,lifecycle_status,updated_at desc);
create index if not exists ceo_memory_nodes_canonical_key_idx on ceo_knowledge.memory_nodes(user_id,canonical_key) where canonical_key is not null;
create index if not exists ceo_memory_nodes_superseded_idx on ceo_knowledge.memory_nodes(user_id,superseded_by) where superseded_by is not null;

create table if not exists ceo_knowledge.retrieval_evaluations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), suite text not null default 'default',
  metrics jsonb not null default '{}'::jsonb, cases jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
alter table ceo_knowledge.retrieval_evaluations enable row level security;
drop policy if exists ceo_retrieval_eval_owner_select on ceo_knowledge.retrieval_evaluations;
create policy ceo_retrieval_eval_owner_select on ceo_knowledge.retrieval_evaluations for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists ceo_retrieval_eval_owner_insert on ceo_knowledge.retrieval_evaluations;
create policy ceo_retrieval_eval_owner_insert on ceo_knowledge.retrieval_evaluations for insert to authenticated with check ((select auth.uid())=user_id);
grant select,insert on ceo_knowledge.retrieval_evaluations to authenticated;
grant select,insert,update,delete on ceo_knowledge.retrieval_evaluations to service_role;

create or replace function ceo_knowledge.memory_metabolism_before_write() returns trigger
language plpgsql set search_path='' as $$
begin
  if coalesce(new.canonical_key,'')='' then new.canonical_key:=nullif(new.metadata->>'canonicalKey',''); end if;
  if coalesce(new.lifecycle_status,'')='' or new.lifecycle_status='current' then
    new.lifecycle_status:=coalesce(nullif(new.metadata->>'lifecycle',''),new.lifecycle_status,'current');
  end if;
  if new.valid_from is null then new.valid_from:=coalesce(nullif(new.metadata->>'validFrom','')::timestamptz,new.created_at,now()); end if;
  if new.valid_to is null and coalesce(new.metadata->>'validTo','')<>'' then new.valid_to:=(new.metadata->>'validTo')::timestamptz; end if;
  if new.superseded_by is null then new.superseded_by:=nullif(new.metadata->>'supersededBy',''); end if;
  return new;
end $$;
drop trigger if exists ceo_memory_metabolism_write on ceo_knowledge.memory_nodes;
create trigger ceo_memory_metabolism_write before insert or update on ceo_knowledge.memory_nodes for each row execute function ceo_knowledge.memory_metabolism_before_write();

create or replace function ceo_knowledge.memory_snapshot(p ceo_knowledge.memory_nodes)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'nodeId',p.node_id,'nodeType',p.node_type,'objectType',p.object_type,'objectId',p.object_id,
    'referencePath',p.reference_path,'title',p.title,'content',p.content,'projectId',p.project_ref,
    'memoryKind',p.memory_kind,'sourceKind',p.source_kind,'truthStatus',p.truth_status,'evidenceStatus',p.evidence_status,
    'importance',p.importance,'retentionPolicy',p.retention_policy,'tier',p.tier,'topicIds',p.topic_ids,
    'entityIds',p.entity_ids,'sourceRefs',p.source_refs,'derivedFrom',p.derived_from,'eventAt',p.event_at,
    'datePrecision',p.date_precision,'revision',p.revision,'contentHash',p.content_hash,'schemaVersion',p.schema_version,
    'canonicalKey',p.canonical_key,'lifecycleStatus',p.lifecycle_status,'validFrom',p.valid_from,'validTo',p.valid_to,'supersededBy',p.superseded_by,
    'originDeviceId',p.origin_device_id,'clientEventId',p.client_event_id,'metadata',p.metadata,'createdAt',p.created_at,'updatedAt',p.updated_at
  )
$$;
create or replace function ceo_knowledge.memory_supersede(p_old_node_id text,p_new_node_id text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_old ceo_knowledge.memory_nodes; v_new ceo_knowledge.memory_nodes;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_old from ceo_knowledge.memory_nodes where user_id=v_user and node_id=p_old_node_id for update;
 select * into v_new from ceo_knowledge.memory_nodes where user_id=v_user and node_id=p_new_node_id for update;
 if v_old.id is null or v_new.id is null then raise exception 'MEMORY_NODE_NOT_FOUND'; end if;
 if v_old.node_id=v_new.node_id then raise exception 'MEMORY_SUPERSEDE_SELF'; end if;
 update ceo_knowledge.memory_nodes set lifecycle_status='superseded',valid_to=coalesce(valid_to,now()),superseded_by=v_new.node_id,revision=revision+1,
   metadata=metadata||jsonb_build_object('supersededAt',now(),'supersedeReason',coalesce(p_reason,'')) where id=v_old.id returning * into v_old;
 update ceo_knowledge.memory_nodes set lifecycle_status='current',valid_from=coalesce(valid_from,now()),revision=revision+1,
   derived_from=(select coalesce(array_agg(distinct x),'{}'::text[]) from unnest(coalesce(derived_from,'{}'::text[])||array[v_old.node_id]) x),
   metadata=metadata||jsonb_build_object('supersedes',v_old.node_id,'canonical',true) where id=v_new.id returning * into v_new;
 insert into ceo_knowledge.memory_provenance(user_id,node_id,relation,source_ref,metadata) values(v_user,v_new.node_id,'DERIVED_FROM',v_old.node_id,jsonb_build_object('kind','supersession')) on conflict do nothing;
 return jsonb_build_object('old',ceo_knowledge.memory_snapshot(v_old),'current',ceo_knowledge.memory_snapshot(v_new));
end $$;
revoke all on function ceo_knowledge.memory_supersede(text,text,text) from public;
grant execute on function ceo_knowledge.memory_supersede(text,text,text) to authenticated,service_role;

insert into ceo_knowledge.schema_meta(key,value) values('schema_version','3.1.0') on conflict(key) do update set value=excluded.value,updated_at=now();
