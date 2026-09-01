import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});

describe('Memory OS M4 API',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('creates a stable claim through memory_replica_apply',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply'))return json({outcome:'accepted',nodeId:body.p_snapshot.nodeId,revision:1,snapshot:body.p_snapshot});
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/claims',{method:'POST',headers:auth,body:JSON.stringify({claim:'Method A is faster',projectId:'project_ceo',sourceRefs:['src_a']})}),env);
    expect(response.status).toBe(201);
    const payload:any=await response.json();
    expect(payload.data.nodeId).toMatch(/^claim_[a-f0-9]{20}$/);
    const call=calls.find(x=>x.url.endsWith('/rpc/memory_replica_apply'));
    expect(call.body.p_snapshot.nodeType).toBe('claim');
    expect(call.body.p_snapshot.projectId).toBe('project_ceo');
    expect(call.body.p_snapshot.metadata.claimEvidence).toEqual([]);
  });

  it('adds evidence as a revisioned claim snapshot',async()=>{
    const node='claim_1234567890abcdef1234';const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/memory_nodes?')&&method==='GET')return json([{node_id:node,node_type:'claim',reference_path:'ceo://claim/'+node,title:'Claim',content:'Claim body',project_ref:'project_ceo',memory_kind:'semantic',source_kind:'user',truth_status:'reported',evidence_status:'unverified',importance:2,retention_policy:'standard',tier:'hot',topic_ids:[],entity_ids:[],source_refs:[],derived_from:[],event_at:null,date_precision:null,revision:1,content_hash:'h1',schema_version:2,metadata:{claimEvidence:[]},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'}]);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply'))return json({outcome:'accepted',nodeId:node,revision:2,snapshot:body.p_snapshot});
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request(`https://ceo.test/api/claims/${node}/evidence`,{method:'POST',headers:auth,body:JSON.stringify({relation:'SUPPORTED_BY',sourceRef:'src_evidence_a'})}),env);
    expect(response.status).toBe(200);
    const call=calls.find(x=>x.url.endsWith('/rpc/memory_replica_apply'));
    expect(call.body.p_base_revision).toBe(1);
    expect(call.body.p_snapshot.revision).toBe(2);
    expect(call.body.p_snapshot.metadata.claimEvidence).toEqual([{relation:'SUPPORTED_BY',sourceRef:'src_evidence_a',metadata:{}}]);
  });

  it('returns project-scoped research workspace and current summary',async()=>{
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/memory_nodes?')&&method==='GET'&&url.includes('project_ref=eq.project_ceo')&&url.includes('node_type=eq.summary'))return json([{node_id:'summary_12345678',node_type:'summary',project_ref:'project_ceo',title:'Current',content:'Summary'}]);
      if(url.includes('/rest/v1/memory_nodes?')&&method==='GET'&&url.includes('project_ref=eq.project_ceo'))return json([
        {node_id:'claim_12345678',node_type:'claim',project_ref:'project_ceo',title:'Claim',content:'Claim',truth_status:'inferred',evidence_status:'confirmed',importance:2,revision:2,reference_path:'',metadata:{claimEvidence:[{relation:'SUPPORTED_BY',sourceRef:'s1'}]},created_at:'',updated_at:''},
        {node_id:'summary_12345678',node_type:'summary',project_ref:'project_ceo',title:'Summary',content:'Summary'},
        {node_id:'mem_12345678',node_type:'memory',project_ref:'project_ceo',title:'Memory',content:'Memory'},
      ]);
      throw new Error('unexpected '+method+' '+url);
    });
    const research=await handleApi(new Request('https://ceo.test/api/research?projectId=project_ceo',{headers:auth}),env);const researchBody:any=await research.json();const data:any=researchBody.data;
    expect(data.claims).toHaveLength(1);expect(data.summaries).toHaveLength(1);expect(data.memories).toHaveLength(1);
    const summary=await handleApi(new Request('https://ceo.test/api/summaries/current?projectId=project_ceo',{headers:auth}),env);expect((await summary.json() as any).data.summary.node_id).toBe('summary_12345678');
  });
});