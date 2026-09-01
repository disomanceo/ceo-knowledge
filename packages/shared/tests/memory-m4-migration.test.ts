import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Memory OS M4 migration safety',()=>{
  it('extends the M3 replica layer without widening authenticated mutation rights',async()=>{
    const sql=await readFile(new URL('../../../supabase/migrations/20260901011500_ceo_knowledge_memory_os_m4.sql',import.meta.url),'utf8');
    expect(sql).toMatch(/create index if not exists ceo_memory_nodes_project_type_idx/i);
    expect(sql).toMatch(/create or replace function ceo_knowledge\.memory_claim_evidence_before/i);
    expect(sql).toMatch(/create or replace function ceo_knowledge\.memory_claim_evidence_after/i);
    expect(sql).toMatch(/SUPPORTED_BY/i);
    expect(sql).toMatch(/CONTRADICTS/i);
    expect(sql).toMatch(/evidence_status/i);
    expect(sql).toMatch(/delete from ceo_knowledge\.memory_provenance[\s\S]*relation in \('SUPPORTED_BY','CONTRADICTS'\)/i);
    expect(sql).toMatch(/where user_id=new\.user_id and node_id=new\.node_id/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[\s\S]*to\s+authenticated/i);
    expect(sql).not.toMatch(/\b(drop|truncate)\s+(table|schema)\b/i);
    expect(sql).not.toMatch(/\b(update|delete\s+from|alter\s+table)\s+(public|auth|storage)\./i);
    expect(sql).not.toMatch(/service_role\s*[:=]/i);
    expect(sql).not.toMatch(/supabase db reset/i);
  });
});