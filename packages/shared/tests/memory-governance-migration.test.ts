import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Memory Governance migration',()=>{
  it('adds safe maintenance governance without hard delete',()=>{
    const file=path.resolve(process.cwd(),'../../supabase/migrations/20260901140500_ceo_knowledge_memory_governance_m5_m6.sql');
    const sql=fs.readFileSync(file,'utf8');
    expect(sql).toContain('memory_maintenance_runs');
    expect(sql).toContain('memory_node_manage');
    expect(sql).toContain('MEMORY_PINNED_PROTECTED');
    expect(sql).toContain('MEMORY_PERMANENT_PROTECTED');
    expect(sql).toContain("p_action='link_duplicate'");
    expect(sql).toContain("'canonicalOf'");
    expect(sql).not.toMatch(/delete\s+from\s+ceo_knowledge\.memory_nodes/i);
    expect(sql).toContain("values('schema_version','2.3.0')");
  });
});
