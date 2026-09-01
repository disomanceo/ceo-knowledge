import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

describe('Memory governance recall',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('excludes archived replicas and ranks canonical active memory first',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/conversation_summaries?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/events?')||url.includes('/rest/v1/tasks?'))return json([]);
      if(url.includes('/rest/v1/memory_nodes?'))return json([
        {node_id:'mem_normal12345678',title:'รับทุน ปตท',content:'รับทุน ปตท วันที่ 11 กันยายน',memory_kind:'semantic',importance:2,project_ref:'',source_refs:[],evidence_status:'single_source',reference_path:'ceo://memory/normal',tier:'hot',retention_policy:'standard',metadata:{},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
        {node_id:'mem_canon12345678',title:'รับทุน ปตท โรงเรียนวัดพระธาตุ',content:'วันที่ 11 กันยายน 2569 รับทุน ปตท ที่โรงเรียนวัดพระธาตุ',memory_kind:'semantic',importance:2,project_ref:'',source_refs:['event-1'],evidence_status:'confirmed',reference_path:'ceo://memory/canonical',tier:'hot',retention_policy:'standard',metadata:{canonical:true},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
        {node_id:'mem_arch12345678',title:'รับทุน ปตท เก่า',content:'รับทุน ปตท ข้อมูลเก่าซ้ำ',memory_kind:'semantic',importance:3,project_ref:'',source_refs:['old'],evidence_status:'single_source',reference_path:'ceo://memory/archive',tier:'cold',retention_policy:'standard',metadata:{archived:true,canonicalOf:'mem_canon12345678'},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
      ]);
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/search?q='+encodeURIComponent('ทุน ปตท'),{headers:auth}),env);
    const payload:any=await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.results[0].id).toBe('mem_canon12345678');
    expect(payload.data.results.some((x:any)=>x.id==='mem_arch12345678')).toBe(false);
  });
});
