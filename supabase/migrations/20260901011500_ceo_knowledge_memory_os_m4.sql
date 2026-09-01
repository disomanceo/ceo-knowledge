-- Ceo Knowledge Memory OS M4: claims/evidence intelligence on the M3 replica layer.
-- Additive and isolated to ceo_knowledge.

create index if not exists ceo_memory_nodes_project_type_idx
  on ceo_knowledge.memory_nodes(user_id,project_ref,node_type,updated_at desc);

create or replace function ceo_knowledge.memory_claim_evidence_before()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_item jsonb;
  v_relation text;
  v_support integer := 0;
  v_contradict integer := 0;
begin
  if new.node_type <> 'claim' then return new; end if;
  for v_item in select value from jsonb_array_elements(coalesce(new.metadata->'claimEvidence','[]'::jsonb)) loop
    v_relation := upper(trim(coalesce(v_item->>'relation','')));
    if v_relation='SUPPORTED_BY' and trim(coalesce(v_item->>'sourceRef',''))<>'' then v_support:=v_support+1; end if;
    if v_relation='CONTRADICTS' and trim(coalesce(v_item->>'sourceRef',''))<>'' then v_contradict:=v_contradict+1; end if;
  end loop;
  new.evidence_status := case
    when v_support>0 and v_contradict>0 then 'conflicting'
    when v_contradict>0 then 'refuted'
    when v_support>=2 then 'confirmed'
    when v_support=1 then 'single_source'
    else 'unverified'
  end;
  return new;
end $$;

create or replace function ceo_knowledge.memory_claim_evidence_after()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_relation text;
  v_ref text;
begin
  if new.node_type <> 'claim' then return new; end if;
  delete from ceo_knowledge.memory_provenance
   where user_id=new.user_id and node_id=new.node_id and relation in ('SUPPORTED_BY','CONTRADICTS');
  for v_item in select value from jsonb_array_elements(coalesce(new.metadata->'claimEvidence','[]'::jsonb)) loop
    v_relation := upper(trim(coalesce(v_item->>'relation','')));
    v_ref := trim(coalesce(v_item->>'sourceRef',''));
    if v_relation in ('SUPPORTED_BY','CONTRADICTS') and v_ref<>'' then
      insert into ceo_knowledge.memory_provenance(user_id,node_id,relation,source_ref,metadata)
      values(new.user_id,new.node_id,v_relation,v_ref,coalesce(v_item->'metadata','{}'::jsonb))
      on conflict(user_id,node_id,relation,source_ref) do update set metadata=excluded.metadata;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists memory_claim_evidence_before on ceo_knowledge.memory_nodes;
create trigger memory_claim_evidence_before
before insert or update of metadata,node_type on ceo_knowledge.memory_nodes
for each row execute function ceo_knowledge.memory_claim_evidence_before();

drop trigger if exists memory_claim_evidence_after on ceo_knowledge.memory_nodes;
create trigger memory_claim_evidence_after
after insert or update of metadata,node_type on ceo_knowledge.memory_nodes
for each row execute function ceo_knowledge.memory_claim_evidence_after();

revoke all on function ceo_knowledge.memory_claim_evidence_before() from public,anon,authenticated;
revoke all on function ceo_knowledge.memory_claim_evidence_after() from public,anon,authenticated;
grant execute on function ceo_knowledge.memory_claim_evidence_before() to service_role;
grant execute on function ceo_knowledge.memory_claim_evidence_after() to service_role;

insert into ceo_knowledge.schema_meta(key,value) values('schema_version','2.2.0')
on conflict(key) do update set value=excluded.value,updated_at=now();