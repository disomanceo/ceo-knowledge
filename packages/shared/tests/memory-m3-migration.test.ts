import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Memory OS M3 migration safety',()=>{
  it('is additive, RLS-scoped and exposes authenticated writes only through bounded RPCs',async()=>{
    const sql=await readFile(new URL('../../../supabase/migrations/20260831210000_ceo_knowledge_memory_os_m3.sql',import.meta.url),'utf8');
    expect(sql).toMatch(/create table if not exists ceo_knowledge\.memory_nodes/i);
    expect(sql).toMatch(/create table if not exists ceo_knowledge\.memory_sync_events/i);
    expect(sql).toMatch(/create table if not exists ceo_knowledge\.memory_conflicts/i);
    expect(sql).toMatch(/create table if not exists ceo_knowledge\.memory_provenance/i);
    expect(sql).toMatch(/unique \(user_id, node_id\)/i);
    expect(sql).toMatch(/unique \(user_id, client_event_id\)/i);
    expect(sql).toMatch(/alter table ceo_knowledge\.memory_nodes enable row level security/i);
    expect(sql).toMatch(/using \(\(select auth\.uid\(\)\)=user_id\)/i);
    expect(sql).toMatch(/revoke insert, update, delete on ceo_knowledge\.memory_nodes[\s\S]*from authenticated/i);
    expect(sql).toMatch(/create or replace function ceo_knowledge\.memory_replica_apply/i);
    expect(sql).toMatch(/create or replace function ceo_knowledge\.memory_conflict_resolve/i);
    expect(sql).toMatch(/create or replace function ceo_knowledge\.memory_provenance_get/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/where user_id=v_user and node_id=v_node_id/i);
    expect(sql).not.toMatch(/\b(drop|truncate)\s+(table|schema)\b/i);
    expect(sql).not.toMatch(/\b(update|delete\s+from|alter\s+table)\s+public\./i);
    expect(sql).not.toMatch(/\b(update|delete\s+from|alter\s+table)\s+auth\./i);
    expect(sql).not.toMatch(/\b(update|delete\s+from|alter\s+table)\s+storage\./i);
    expect(sql).not.toMatch(/supabase db reset/i);
  });
});