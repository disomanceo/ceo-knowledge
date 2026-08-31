import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const authHeaders={authorization:'Bearer user-token','content-type':'application/json'};
function json(value:any,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})}

describe('Memory OS M3 Worker API',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('mobile remember creates legacy row and stable cloud replica with authenticated RPC',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body,headers:init.headers});
      if(url.endsWith('/auth/v1/user'))return json({id:'user-1',email:'test@example.com'});
      if(url.includes('/rest/v1/memories?')&&method==='POST')return json([{id:'11111111-1111-1111-1111-111111111111',title:'',content:'remember from mobile',memory_type:'note',importance:2,scope:'global',status:'active',tags:['mobile'],created_at:'2026-08-31T12:00:00Z',updated_at:'2026-08-31T12:00:00Z'}],201);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:body.p_snapshot.nodeId,revision:1,snapshot:body.p_snapshot});
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/memories',{method:'POST',headers:authHeaders,body:JSON.stringify({content:'remember from mobile',memoryType:'note',importance:2,scope:'global',tags:['mobile']})}),env);
    expect(response.status).toBe(201);
    const payload:any=await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.node_id).toMatch(/^mem_[a-f0-9]{20}$/);
    expect(payload.data.replica.outcome).toBe('accepted');
    const rpcCall=calls.find(call=>call.url.endsWith('/rest/v1/rpc/memory_replica_apply'));
    expect(rpcCall.body.p_base_revision).toBe(0);
    expect(rpcCall.body.p_snapshot.revision).toBe(1);
    expect(rpcCall.body.p_snapshot.sourceRefs).toEqual(['11111111-1111-1111-1111-111111111111']);
    expect(rpcCall.body.p_client_event_id).toMatch(/^mem_evt_[a-f0-9]{24}$/);
    expect(rpcCall.headers['content-profile']).toBe('ceo_knowledge');
  });

  it('memory list prefers replica and suppresses its mirrored legacy row',async()=>{
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();
      if(url.endsWith('/auth/v1/user'))return json({id:'user-1'});
      if(url.includes('/rest/v1/memories?')&&method==='GET')return json([
        {id:'11111111-1111-1111-1111-111111111111',title:'Mirror',content:'same',memory_type:'note',importance:2,scope:'global',status:'active',tags:[],created_at:'2026-08-31T12:00:00Z',updated_at:'2026-08-31T12:00:00Z'},
        {id:'22222222-2222-2222-2222-222222222222',title:'Legacy only',content:'legacy',memory_type:'fact',importance:1,scope:'global',status:'active',tags:[],created_at:'2026-08-30T12:00:00Z',updated_at:'2026-08-30T12:00:00Z'},
      ]);
      if(url.includes('/rest/v1/memory_nodes?')&&method==='GET')return json([{node_id:'mem_replica12345678',title:'Mirror',content:'same',memory_kind:'semantic',importance:2,project_ref:'',source_refs:['11111111-1111-1111-1111-111111111111'],evidence_status:'single_source',reference_path:'ceo://memory/mem_replica12345678',revision:1,created_at:'2026-08-31T12:00:00Z',updated_at:'2026-08-31T12:00:01Z'}]);
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/memories',{headers:authHeaders}),env);
    const payload:any=await response.json();
    expect(payload.data.memories).toHaveLength(2);
    expect(payload.data.memories[0].id).toBe('mem_replica12345678');
    expect(payload.data.memories[0].replica).toBe(true);
    expect(payload.data.memories.some((row:any)=>row.id==='11111111-1111-1111-1111-111111111111')).toBe(false);
    expect(payload.data.memories.some((row:any)=>row.id==='22222222-2222-2222-2222-222222222222')).toBe(true);
  });

  it('exposes only authenticated bounded conflict and provenance endpoints',async()=>{
    const conflictId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'user-1'});
      if(url.includes('/rest/v1/memory_conflicts?')&&method==='GET')return json([{id:conflictId,node_id:'mem_conflict12345',status:'pending',local_snapshot:{content:'local'},cloud_snapshot:{content:'cloud'}}]);
      if(url.endsWith('/rest/v1/rpc/memory_conflict_resolve')&&method==='POST')return json({outcome:'resolved',resolution:'cloud',conflictId,snapshot:{nodeId:'mem_conflict12345',revision:2}});
      if(url.endsWith('/rest/v1/rpc/memory_provenance_get')&&method==='POST')return json([{relation:'SOURCE',source_ref:'src_chat_12345678',source_id:null,metadata:{},created_at:'2026-08-31T12:00:00Z'}]);
      throw new Error('unexpected '+method+' '+url);
    });
    const list=await handleApi(new Request('https://ceo.test/api/memory/conflicts?status=pending&limit=999',{headers:authHeaders}),env);
    expect((await list.json() as any).data.conflicts).toHaveLength(1);
    const resolve=await handleApi(new Request(`https://ceo.test/api/memory/conflicts/${conflictId}/resolve`,{method:'POST',headers:authHeaders,body:JSON.stringify({resolution:'cloud'})}),env);
    expect((await resolve.json() as any).data.outcome).toBe('resolved');
    const provenance=await handleApi(new Request('https://ceo.test/api/memory/nodes/mem_conflict12345/provenance',{headers:authHeaders}),env);
    expect((await provenance.json() as any).data.provenance[0].source_ref).toBe('src_chat_12345678');
    const conflictQuery=decodeURIComponent(calls.find(call=>call.url.includes('/memory_conflicts?')).url);
    expect(conflictQuery).toContain('limit=200');
    expect(calls.some(call=>call.url.endsWith('/rpc/memory_conflict_resolve'))).toBe(true);
    expect(calls.some(call=>call.url.endsWith('/rpc/memory_provenance_get'))).toBe(true);
  });
});