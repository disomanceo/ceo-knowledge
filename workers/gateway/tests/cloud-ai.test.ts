import { afterEach, describe, expect, it, vi } from 'vitest';
import { askGemini, cloudAiConfig } from '../src/cloud-ai';
import { handleApi } from '../src/api';

const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test',GEMINI_API_KEY:'test-gemini-key',GEMINI_MODEL:'gemini-3.5-flash-lite'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};

describe('Gemini cloud fallback',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('reports Gemini as the primary cloud provider without exposing the key',()=>{
    const config=cloudAiConfig(env);
    expect(config.configured).toBe(true);
    expect(config.primary).toBe('gemini');
    expect(config.gemini).toEqual({configured:true,model:'gemini-3.5-flash-lite',liveSearch:true});
    expect(JSON.stringify(config)).not.toContain('test-gemini-key');
  });

  it('adds Google Search grounding for live questions and parses sources',async()=>{
    let body:any=null,headers:any=null;
    vi.stubGlobal('fetch',async(_input:any,init:any={})=>{
      body=JSON.parse(String(init.body||'{}'));headers=init.headers;
      return json({candidates:[{content:{parts:[{text:'อากาศวันนี้มีฝนบางช่วงครับ'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/weather',title:'Weather'}}]}}]});
    });
    const result=await askGemini(env,'เช็คสภาพอากาศวันนี้',[],{live:true});
    expect(result.ok).toBe(true);expect(result.provider).toBe('gemini');expect(result.grounded).toBe(true);
    expect(result.sources[0]?.url).toBe('https://example.com/weather');
    expect(body.tools).toEqual([{google_search:{}}]);
    expect(headers['x-goog-api-key']).toBe('test-gemini-key');
  });

  it('routes chat to Gemini when no trusted Ceo Runtime is online',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url:decodeURIComponent(url),method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1',email:'owner@example.com'});
      if(url.startsWith(env.SUPABASE_URL+'/rest/v1/'))return json([]);
      if(url.includes('generativelanguage.googleapis.com'))return json({candidates:[{content:{parts:[{text:'ชื่อโครงการที่แนะนำคือ Smart School ครับ'}]}}]});
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ช่วยคิดชื่อโครงการ Smart School ให้หน่อย'})}),env);
    const payload:any=await response.json();
    expect(payload.data.mode).toBe('cloud-ai');expect(payload.data.provider).toBe('gemini');expect(payload.data.model).toBe('gemini-3.5-flash-lite');
    expect(payload.data.answer).toContain('Smart School');
    expect(calls.some(x=>x.url.includes('/rest/v1/runtime_jobs'))).toBe(false);
  });

  it('routes live chat to Gemini Search when the PC is offline',async()=>{
    let geminiBody:any=null;
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/devices?'))return json([]);
      if(url.includes('generativelanguage.googleapis.com')){geminiBody=JSON.parse(String(init.body||'{}'));return json({candidates:[{content:{parts:[{text:'ข้อมูลล่าสุดจากการค้นหาครับ'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.com/latest',title:'Latest'}}]}}]});}
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'เช็คสภาพอากาศวันนี้'})}),env);
    const payload:any=await response.json();
    expect(payload.data.intent).toBe('live');expect(payload.data.mode).toBe('cloud-ai');expect(payload.data.provider).toBe('gemini');expect(payload.data.grounded).toBe(true);
    expect(geminiBody.tools).toEqual([{google_search:{}}]);
  });

  it('shows cloud Gemini as active in AI status when desktop runtime is offline',async()=>{
    vi.stubGlobal('fetch',async(input:any)=>{
      const url=String(input);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/devices?'))return json([]);
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/ai/status',{headers:auth}),env),payload:any=await response.json();
    expect(payload.data.policy).toBe('auto');expect(payload.data.active.source).toBe('cloud');expect(payload.data.active.provider).toBe('gemini');
    expect(payload.data.cloud.gemini.configured).toBe(true);
  });
});
