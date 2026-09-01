import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json','accept':'application/json, text/event-stream'};
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const rpc=(method:string,params:any={},id:any=1)=>JSON.stringify({jsonrpc:'2.0',id,method,params});

describe('Ceo Knowledge Cloud MCP',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('publishes OAuth protected-resource metadata without authentication',async()=>{
    const response=await handleApi(new Request('https://ceo.test/.well-known/oauth-protected-resource/mcp'),env);
    expect(response.status).toBe(200);
    const body:any=await response.json();
    expect(body.resource).toBe('https://ceo.test/mcp');
    expect(body.authorization_servers).toEqual(['https://project.supabase.co/auth/v1']);
    expect(body.scopes_supported).toContain('offline_access');
  });

  it('challenges unauthenticated MCP requests with RFC9728 resource metadata',async()=>{
    const response=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:{'content-type':'application/json'},body:rpc('tools/list')}),env);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata="https://ceo.test/.well-known/oauth-protected-resource/mcp"');
  });

  it('supports legacy initialize and exposes cloud secretary tools',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{if(String(input).endsWith('/auth/v1/user'))return json({id:'u1',email:'owner@example.com'});throw new Error('unexpected '+input)});
    const init=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:auth,body:rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'ChatGPT',version:'1'}})}),env);
    const initBody:any=await init.json();
    expect(initBody.result.protocolVersion).toBe('2025-11-25');
    expect(initBody.result.serverInfo.name).toBe('ceo-knowledge-cloud');
    const list=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:auth,body:rpc('tools/list')}),env);
    const listBody:any=await list.json();
    const names=listBody.result.tools.map((tool:any)=>tool.name);
    expect(names).toContain('ceo_secretary_query');
    expect(names).toContain('ceo_recall');
    expect(names).toContain('ceo_remember');
  });

  it('supports modern stateless server/discover',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{if(String(input).endsWith('/auth/v1/user'))return json({id:'u1'});throw new Error('unexpected '+input)});
    const headers={...auth,'mcp-protocol-version':'2026-07-28','mcp-method':'server/discover'};
    const response=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers,body:rpc('server/discover',{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}})}),env);
    const body:any=await response.json();
    expect(body.result.supportedVersions).toContain('2026-07-28');
    expect(body.result.capabilities.tools.listChanged).toBe(false);
  });

  it('answers a dated secretary query entirely from cloud knowledge',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/events?'))return json([{id:'e18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'ช่วงเย็น',event_type:'activity',start_at:'2026-09-18T10:00:00Z',end_at:null,all_day:false,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'}]);
      if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/memories?'))return json([]);
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:auth,body:rpc('tools/call',{name:'ceo_secretary_query',arguments:{message:'18 ก.ย. 2569 มีอะไร'}})}),env);
    const body:any=await response.json();
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.intent).toBe('date');
    expect(body.result.structuredContent.answer).toContain('งานเลี้ยงเกษียณ ผอ. เผือก');
  });

  it('blocks secrets from explicit cloud memory writes',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{if(String(input).endsWith('/auth/v1/user'))return json({id:'u1'});throw new Error('unexpected '+input)});
    const response=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:auth,body:rpc('tools/call',{name:'ceo_remember',arguments:{content:'API key: demo-test-value'}})}),env);
    const body:any=await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toContain('MEMORY_SECRET_BLOCKED');
  });

  it('writes an explicit non-secret memory through the existing replica pipeline',async()=>{
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=String(input),method=String(init.method||'GET').toUpperCase();let requestBody:any=null;try{requestBody=init.body?JSON.parse(String(init.body)):null}catch{}
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/memories?')&&method==='POST')return json([{id:'11111111-1111-1111-1111-111111111111',title:requestBody.title,content:requestBody.content,memory_type:'note',importance:2,scope:'global',status:'active',tags:requestBody.tags,created_at:'2026-09-01T13:00:00Z',updated_at:'2026-09-01T13:00:00Z'}],201);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:requestBody.p_snapshot.nodeId,revision:1,snapshot:requestBody.p_snapshot});
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/mcp',{method:'POST',headers:auth,body:rpc('tools/call',{name:'ceo_remember',arguments:{content:'วันที่ 30 กันยายน 2569 เตรียมสรุปงานประจำเดือน',importance:2}})}),env);
    const body:any=await response.json();
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.answer).toContain('Ceo Knowledge Cloud');
    expect(body.result.structuredContent.memory.replica.outcome).toBe('accepted');
  });
});
