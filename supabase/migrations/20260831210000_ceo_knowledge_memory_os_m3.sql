-- Ceo Knowledge Memory OS M3: Local <-> Cloud replica, conflict and provenance
-- ADDITIVE ONLY. Existing domain tables and primary keys remain unchanged.

create table if not exists ceo_knowledge.memory_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  node_id text not null,
  node_type text not null check (node_type in ('topic','memory','event','task','person','project','place','decision','document','source','summary','claim','conversation')),
  object_type text,
  object_id uuid,
  reference_path text not null default '',
  title text not null default '',
  content text not null default '',
  project_ref text not null default '',
  memory_kind text check (memory_kind is null or memory_kind in ('episodic','semantic','procedural','prospective','derived','summary')),
  source_kind text not null default 'user' check (source_kind in ('user','conversation','document','external_api','web','device','ai_derived','system')),
  truth_status text not null default 'reported' check (truth_status in ('observed','reported','forecast','inferred','refuted')),
  evidence_status text not null default 'unverified' check (evidence_status in ('unverified','single_source','confirmed','conflicting','refuted')),
  importance smallint not null default 2 check (importance between 0 and 3),
  retention_policy text not null default 'standard' check (retention_policy in ('standard','permanent','temporary')),
  tier text not null default 'hot' check (tier in ('hot','warm','cold','pinned')),
  topic_ids text[] not null default '{}',
  entity_ids text[] not null default '{}',
  source_refs text[] not null default '{}',
  derived_from text[] not null default '{}',
  event_at timestamptz,
  date_precision text,
  revision integer not null default 1 check (revision > 0),
  content_hash text not null,
  schema_version integer not null default 2 check (schema_version > 0),
  origin_device_id uuid references ceo_knowledge.devices(id) on delete set null,
  client_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, node_id)
);

create index if not exists ceo_memory_nodes_user_updated_idx on ceo_knowledge.memory_nodes(user_id, updated_at desc);
create index if not exists ceo_memory_nodes_project_idx on ceo_knowledge.memory_nodes(user_id, project_ref, updated_at desc);
create index if not exists ceo_memory_nodes_type_idx on ceo_knowledge.memory_nodes(user_id, node_type, updated_at desc);
create index if not exists ceo_memory_nodes_event_idx on ceo_knowledge.memory_nodes(user_id, event_at) where event_at is not null;
create index if not exists ceo_memory_nodes_topics_gin on ceo_knowledge.memory_nodes using gin(topic_ids);
create index if not exists ceo_memory_nodes_entities_gin on ceo_knowledge.memory_nodes using gin(entity_ids);

create table if not exists ceo_knowledge.memory_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  client_event_id text not null,
  node_id text not null,
  direction text not null default 'local_to_cloud' check (direction in ('local_to_cloud','cloud_to_local','resolution')),
  base_revision integer not null default 0 check (base_revision >= 0),
  revision integer not null check (revision > 0),
  content_hash text not null,
  status text not null check (status in ('accepted','duplicate','no_change','conflict','resolved')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);
create index if not exists ceo_memory_sync_events_node_idx on ceo_knowledge.memory_sync_events(user_id,node_id,created_at desc);

create table if not exists ceo_knowledge.memory_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  node_id text not null,
  client_event_id text not null,
  base_revision integer not null check (base_revision >= 0),
  local_revision integer not null check (local_revision > 0),
  cloud_revision integer not null check (cloud_revision > 0),
  local_snapshot jsonb not null,
  cloud_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','resolved','superseded')),
  resolution text check (resolution is null or resolution in ('local','cloud','merge')),
  resolution_snapshot jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, client_event_id)
);
create index if not exists ceo_memory_conflicts_pending_idx on ceo_knowledge.memory_conflicts(user_id,status,created_at desc);
create index if not exists ceo_memory_conflicts_node_idx on ceo_knowledge.memory_conflicts(user_id,node_id,created_at desc);

create table if not exists ceo_knowledge.memory_provenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  node_id text not null,
  relation text not null check (relation in ('SOURCE','DERIVED_FROM','SUPPORTED_BY','CONTRADICTS')),
  source_ref text not null,
  source_id uuid references ceo_knowledge.sources(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id,node_id,relation,source_ref)
);
create index if not exists ceo_memory_provenance_node_idx on ceo_knowledge.memory_provenance(user_id,node_id,created_at);
create index if not exists ceo_memory_provenance_source_idx on ceo_knowledge.memory_provenance(user_id,source_ref);

create trigger memory_nodes_set_updated_at before update on ceo_knowledge.memory_nodes
for each row execute function ceo_knowledge.set_updated_at();

alter table ceo_knowledge.memory_nodes enable row level security;
alter table ceo_knowledge.memory_sync_events enable row level security;
alter table ceo_knowledge.memory_conflicts enable row level security;
alter table ceo_knowledge.memory_provenance enable row level security;

create policy ceo_memory_nodes_owner_select on ceo_knowledge.memory_nodes for select to authenticated using ((select auth.uid())=user_id);
create policy ceo_memory_sync_events_owner_select on ceo_knowledge.memory_sync_events for select to authenticated using ((select auth.uid())=user_id);
create policy ceo_memory_conflicts_owner_select on ceo_knowledge.memory_conflicts for select to authenticated using ((select auth.uid())=user_id);
create policy ceo_memory_provenance_owner_select on ceo_knowledge.memory_provenance for select to authenticated using ((select auth.uid())=user_id);

revoke insert, update, delete on ceo_knowledge.memory_nodes, ceo_knowledge.memory_sync_events, ceo_knowledge.memory_conflicts, ceo_knowledge.memory_provenance from authenticated;
grant select on ceo_knowledge.memory_nodes, ceo_knowledge.memory_sync_events, ceo_knowledge.memory_conflicts, ceo_knowledge.memory_provenance to authenticated;
grant select, insert, update, delete on ceo_knowledge.memory_nodes, ceo_knowledge.memory_sync_events, ceo_knowledge.memory_conflicts, ceo_knowledge.memory_provenance to service_role;

create or replace function ceo_knowledge.memory_snapshot(p ceo_knowledge.memory_nodes)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'nodeId',p.node_id,'nodeType',p.node_type,'objectType',p.object_type,'objectId',p.object_id,
    'referencePath',p.reference_path,'title',p.title,'content',p.content,'projectId',p.project_ref,
    'memoryKind',p.memory_kind,'sourceKind',p.source_kind,'truthStatus',p.truth_status,'evidenceStatus',p.evidence_status,
    'importance',p.importance,'retentionPolicy',p.retention_policy,'tier',p.tier,'topicIds',p.topic_ids,
    'entityIds',p.entity_ids,'sourceRefs',p.source_refs,'derivedFrom',p.derived_from,'eventAt',p.event_at,
    'datePrecision',p.date_precision,'revision',p.revision,'contentHash',p.content_hash,'schemaVersion',p.schema_version,
    'originDeviceId',p.origin_device_id,'clientEventId',p.client_event_id,'metadata',p.metadata,
    'createdAt',p.created_at,'updatedAt',p.updated_at
  )
$$;

create or replace function ceo_knowledge.memory_sync_provenance(
  p_user_id uuid,
  p_node_id text,
  p_source_refs text[],
  p_derived_from text[]
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_ref text; v_source uuid;
begin
  delete from ceo_knowledge.memory_provenance where user_id=p_user_id and node_id=p_node_id and relation in ('SOURCE','DERIVED_FROM');
  foreach v_ref in array coalesce(p_source_refs,'{}'::text[]) loop
    v_source := null;
    if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select s.id into v_source from ceo_knowledge.sources s where s.user_id=p_user_id and s.id=v_ref::uuid limit 1;
    end if;
    insert into ceo_knowledge.memory_provenance(user_id,node_id,relation,source_ref,source_id)
    values(p_user_id,p_node_id,'SOURCE',v_ref,v_source)
    on conflict(user_id,node_id,relation,source_ref) do update set source_id=excluded.source_id;
  end loop;
  foreach v_ref in array coalesce(p_derived_from,'{}'::text[]) loop
    insert into ceo_knowledge.memory_provenance(user_id,node_id,relation,source_ref)
    values(p_user_id,p_node_id,'DERIVED_FROM',v_ref)
    on conflict(user_id,node_id,relation,source_ref) do nothing;
  end loop;
end $$;

create or replace function ceo_knowledge.memory_replica_apply(
  p_snapshot jsonb,
  p_base_revision integer,
  p_client_event_id text,
  p_device_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_node_id text := trim(coalesce(p_snapshot->>'nodeId',''));
  v_revision integer := coalesce((p_snapshot->>'revision')::integer,0);
  v_hash text := trim(coalesce(p_snapshot->>'contentHash',''));
  v_existing ceo_knowledge.memory_nodes;
  v_event ceo_knowledge.memory_sync_events;
  v_conflict ceo_knowledge.memory_conflicts;
  v_result ceo_knowledge.memory_nodes;
  v_device_ok boolean := true;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_node_id !~ '^(topic|mem|evt|task|person|project|place|decision|doc|src|summary|claim|conv)_[A-Za-z0-9_-]{8,80}$' then raise exception 'MEMORY_NODE_ID_INVALID'; end if;
  if trim(coalesce(p_client_event_id,''))='' or char_length(p_client_event_id)>160 then raise exception 'CLIENT_EVENT_ID_INVALID'; end if;
  if p_base_revision is null or p_base_revision<0 or v_revision<>p_base_revision+1 then raise exception 'MEMORY_REVISION_INVALID'; end if;
  if v_hash='' or char_length(v_hash)>128 then raise exception 'CONTENT_HASH_INVALID'; end if;
  if p_device_id is not null then
    select exists(select 1 from ceo_knowledge.devices d where d.id=p_device_id and d.user_id=v_user and d.trusted=true and d.status<>'disabled') into v_device_ok;
    if not v_device_ok then raise exception 'DEVICE_NOT_TRUSTED'; end if;
  end if;

  select * into v_event from ceo_knowledge.memory_sync_events where user_id=v_user and client_event_id=p_client_event_id;
  if found then
    select * into v_existing from ceo_knowledge.memory_nodes where user_id=v_user and node_id=v_event.node_id;
    return jsonb_build_object('outcome','duplicate','eventId',v_event.id,'nodeId',v_event.node_id,'revision',v_event.revision,'snapshot',case when v_existing.id is null then null else ceo_knowledge.memory_snapshot(v_existing) end);
  end if;

  select * into v_existing from ceo_knowledge.memory_nodes where user_id=v_user and node_id=v_node_id for update;
  if v_existing.id is not null and v_existing.content_hash=v_hash then
    insert into ceo_knowledge.memory_sync_events(user_id,client_event_id,node_id,base_revision,revision,content_hash,status,detail)
    values(v_user,p_client_event_id,v_node_id,p_base_revision,v_existing.revision,v_hash,'no_change',jsonb_build_object('incomingRevision',v_revision)) returning * into v_event;
    return jsonb_build_object('outcome','no_change','eventId',v_event.id,'nodeId',v_node_id,'revision',v_existing.revision,'snapshot',ceo_knowledge.memory_snapshot(v_existing));
  end if;

  if v_existing.id is not null and v_existing.revision<>p_base_revision then
    insert into ceo_knowledge.memory_conflicts(user_id,node_id,client_event_id,base_revision,local_revision,cloud_revision,local_snapshot,cloud_snapshot)
    values(v_user,v_node_id,p_client_event_id,p_base_revision,v_revision,v_existing.revision,p_snapshot,ceo_knowledge.memory_snapshot(v_existing)) returning * into v_conflict;
    insert into ceo_knowledge.memory_sync_events(user_id,client_event_id,node_id,base_revision,revision,content_hash,status,detail)
    values(v_user,p_client_event_id,v_node_id,p_base_revision,v_revision,v_hash,'conflict',jsonb_build_object('conflictId',v_conflict.id,'cloudRevision',v_existing.revision));
    return jsonb_build_object('outcome','conflict','conflictId',v_conflict.id,'nodeId',v_node_id,'revision',v_existing.revision,'snapshot',ceo_knowledge.memory_snapshot(v_existing),'localSnapshot',p_snapshot);
  end if;

  insert into ceo_knowledge.memory_nodes(
    user_id,node_id,node_type,object_type,object_id,reference_path,title,content,project_ref,memory_kind,source_kind,truth_status,evidence_status,
    importance,retention_policy,tier,topic_ids,entity_ids,source_refs,derived_from,event_at,date_precision,revision,content_hash,schema_version,origin_device_id,client_event_id,metadata
  ) values (
    v_user,v_node_id,coalesce(nullif(p_snapshot->>'nodeType',''),'memory'),nullif(p_snapshot->>'objectType',''),nullif(p_snapshot->>'objectId','')::uuid,
    coalesce(p_snapshot->>'referencePath',''),coalesce(p_snapshot->>'title',''),coalesce(p_snapshot->>'content',''),coalesce(p_snapshot->>'projectId',''),nullif(p_snapshot->>'memoryKind',''),
    coalesce(nullif(p_snapshot->>'sourceKind',''),'user'),coalesce(nullif(p_snapshot->>'truthStatus',''),'reported'),coalesce(nullif(p_snapshot->>'evidenceStatus',''),'unverified'),
    least(3,greatest(0,coalesce((p_snapshot->>'importance')::integer,2))),coalesce(nullif(p_snapshot->>'retentionPolicy',''),'standard'),coalesce(nullif(p_snapshot->>'tier',''),'hot'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'topicIds','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'entityIds','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'sourceRefs','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'derivedFrom','[]'::jsonb))),'{}'::text[]),
    nullif(p_snapshot->>'eventAt','')::timestamptz,nullif(p_snapshot->>'datePrecision',''),v_revision,v_hash,coalesce((p_snapshot->>'schemaVersion')::integer,2),p_device_id,p_client_event_id,
    coalesce(p_snapshot->'metadata','{}'::jsonb)
  ) on conflict(user_id,node_id) do update set
    node_type=excluded.node_type,object_type=excluded.object_type,object_id=excluded.object_id,reference_path=excluded.reference_path,title=excluded.title,content=excluded.content,
    project_ref=excluded.project_ref,memory_kind=excluded.memory_kind,source_kind=excluded.source_kind,truth_status=excluded.truth_status,evidence_status=excluded.evidence_status,
    importance=excluded.importance,retention_policy=excluded.retention_policy,tier=excluded.tier,topic_ids=excluded.topic_ids,entity_ids=excluded.entity_ids,source_refs=excluded.source_refs,
    derived_from=excluded.derived_from,event_at=excluded.event_at,date_precision=excluded.date_precision,revision=excluded.revision,content_hash=excluded.content_hash,
    schema_version=excluded.schema_version,origin_device_id=excluded.origin_device_id,client_event_id=excluded.client_event_id,metadata=excluded.metadata
  returning * into v_result;

  perform ceo_knowledge.memory_sync_provenance(v_user,v_node_id,v_result.source_refs,v_result.derived_from);
  insert into ceo_knowledge.memory_sync_events(user_id,client_event_id,node_id,base_revision,revision,content_hash,status,detail)
  values(v_user,p_client_event_id,v_node_id,p_base_revision,v_result.revision,v_hash,'accepted','{}'::jsonb) returning * into v_event;
  return jsonb_build_object('outcome','accepted','eventId',v_event.id,'nodeId',v_node_id,'revision',v_result.revision,'snapshot',ceo_knowledge.memory_snapshot(v_result));
end $$;

create or replace function ceo_knowledge.memory_replica_pull(
  p_after timestamptz default '1970-01-01T00:00:00Z'::timestamptz,
  p_limit integer default 200
) returns setof ceo_knowledge.memory_nodes
language sql
security invoker
set search_path=''
as $$
  select n.* from ceo_knowledge.memory_nodes n
  where n.user_id=auth.uid() and n.updated_at>coalesce(p_after,'1970-01-01T00:00:00Z'::timestamptz)
  order by n.updated_at asc,n.node_id asc
  limit least(500,greatest(1,coalesce(p_limit,200)))
$$;

create or replace function ceo_knowledge.memory_conflict_resolve(
  p_conflict_id uuid,
  p_resolution text,
  p_snapshot jsonb default null,
  p_client_event_id text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_conflict ceo_knowledge.memory_conflicts;
  v_current ceo_knowledge.memory_nodes;
  v_result ceo_knowledge.memory_nodes;
  v_hash text;
  v_revision integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_resolution not in ('local','cloud','merge') then raise exception 'CONFLICT_RESOLUTION_INVALID'; end if;
  select * into v_conflict from ceo_knowledge.memory_conflicts where id=p_conflict_id and user_id=v_user for update;
  if v_conflict.id is null then raise exception 'CONFLICT_NOT_FOUND'; end if;
  select * into v_current from ceo_knowledge.memory_nodes where user_id=v_user and node_id=v_conflict.node_id for update;
  if p_resolution='cloud' then
    update ceo_knowledge.memory_conflicts set status='resolved',resolution='cloud',resolution_snapshot=ceo_knowledge.memory_snapshot(v_current),resolved_at=now() where id=v_conflict.id;
    return jsonb_build_object('outcome','resolved','resolution','cloud','conflictId',v_conflict.id,'snapshot',ceo_knowledge.memory_snapshot(v_current));
  end if;
  if p_snapshot is null then raise exception 'RESOLUTION_SNAPSHOT_REQUIRED'; end if;
  if trim(coalesce(p_client_event_id,''))='' then raise exception 'CLIENT_EVENT_ID_INVALID'; end if;
  v_revision := v_current.revision+1;
  v_hash := trim(coalesce(p_snapshot->>'contentHash',''));
  if v_hash='' then raise exception 'CONTENT_HASH_INVALID'; end if;
  p_snapshot := jsonb_set(jsonb_set(p_snapshot,'{revision}',to_jsonb(v_revision),true),'{nodeId}',to_jsonb(v_conflict.node_id),true);
  select * into v_result from ceo_knowledge.memory_nodes where user_id=v_user and node_id=v_conflict.node_id;
  update ceo_knowledge.memory_nodes set
    node_type=coalesce(nullif(p_snapshot->>'nodeType',''),node_type), reference_path=coalesce(p_snapshot->>'referencePath',reference_path), title=coalesce(p_snapshot->>'title',title),
    content=coalesce(p_snapshot->>'content',content), project_ref=coalesce(p_snapshot->>'projectId',project_ref), memory_kind=coalesce(nullif(p_snapshot->>'memoryKind',''),memory_kind),
    source_kind=coalesce(nullif(p_snapshot->>'sourceKind',''),source_kind),truth_status=coalesce(nullif(p_snapshot->>'truthStatus',''),truth_status),evidence_status=coalesce(nullif(p_snapshot->>'evidenceStatus',''),evidence_status),
    importance=least(3,greatest(0,coalesce((p_snapshot->>'importance')::integer,importance))),retention_policy=coalesce(nullif(p_snapshot->>'retentionPolicy',''),retention_policy),tier=coalesce(nullif(p_snapshot->>'tier',''),tier),
    topic_ids=coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'topicIds','[]'::jsonb))),topic_ids),entity_ids=coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'entityIds','[]'::jsonb))),entity_ids),
    source_refs=coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'sourceRefs','[]'::jsonb))),source_refs),derived_from=coalesce(array(select jsonb_array_elements_text(coalesce(p_snapshot->'derivedFrom','[]'::jsonb))),derived_from),
    event_at=coalesce(nullif(p_snapshot->>'eventAt','')::timestamptz,event_at),date_precision=coalesce(nullif(p_snapshot->>'datePrecision',''),date_precision),revision=v_revision,content_hash=v_hash,client_event_id=p_client_event_id,
    metadata=coalesce(p_snapshot->'metadata',metadata)
  where user_id=v_user and node_id=v_conflict.node_id returning * into v_result;
  perform ceo_knowledge.memory_sync_provenance(v_user,v_result.node_id,v_result.source_refs,v_result.derived_from);
  insert into ceo_knowledge.memory_sync_events(user_id,client_event_id,node_id,direction,base_revision,revision,content_hash,status,detail)
  values(v_user,p_client_event_id,v_result.node_id,'resolution',v_current.revision,v_result.revision,v_result.content_hash,'resolved',jsonb_build_object('resolution',p_resolution,'conflictId',v_conflict.id))
  on conflict(user_id,client_event_id) do nothing;
  update ceo_knowledge.memory_conflicts set status='resolved',resolution=p_resolution,resolution_snapshot=ceo_knowledge.memory_snapshot(v_result),resolved_at=now() where id=v_conflict.id;
  return jsonb_build_object('outcome','resolved','resolution',p_resolution,'conflictId',v_conflict.id,'snapshot',ceo_knowledge.memory_snapshot(v_result));
end $$;

create or replace function ceo_knowledge.memory_provenance_get(p_node_id text)
returns table(relation text,source_ref text,source_id uuid,metadata jsonb,created_at timestamptz)
language sql
security invoker
set search_path=''
as $$
  select p.relation,p.source_ref,p.source_id,p.metadata,p.created_at
  from ceo_knowledge.memory_provenance p where p.user_id=auth.uid() and p.node_id=p_node_id order by p.created_at,p.relation,p.source_ref
$$;

revoke all on function ceo_knowledge.memory_sync_provenance(uuid,text,text[],text[]) from public,authenticated;
revoke all on function ceo_knowledge.memory_snapshot(ceo_knowledge.memory_nodes) from public;
revoke all on function ceo_knowledge.memory_replica_apply(jsonb,integer,text,uuid) from public;
revoke all on function ceo_knowledge.memory_replica_pull(timestamptz,integer) from public;
revoke all on function ceo_knowledge.memory_conflict_resolve(uuid,text,jsonb,text) from public;
revoke all on function ceo_knowledge.memory_provenance_get(text) from public;
grant execute on function ceo_knowledge.memory_snapshot(ceo_knowledge.memory_nodes) to authenticated,service_role;
grant execute on function ceo_knowledge.memory_replica_apply(jsonb,integer,text,uuid) to authenticated,service_role;
grant execute on function ceo_knowledge.memory_replica_pull(timestamptz,integer) to authenticated,service_role;
grant execute on function ceo_knowledge.memory_conflict_resolve(uuid,text,jsonb,text) to authenticated,service_role;
grant execute on function ceo_knowledge.memory_provenance_get(text) to authenticated,service_role;

insert into ceo_knowledge.schema_meta(key,value) values('schema_version','2.1.0')
on conflict(key) do update set value=excluded.value,updated_at=now();
