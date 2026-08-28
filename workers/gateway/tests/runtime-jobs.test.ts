import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertRuntimeJob } from '../src/runtime-jobs';

describe('runtime job insert security contract',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public'};
  it('uses INSERT without merge-duplicates so authenticated role does not need UPDATE privilege',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(url:any,init:any={})=>{calls.push({url:String(url),method:String(init.method||'GET'),prefer:String(init.headers?.prefer||'')});return new Response(JSON.stringify([{id:'job-1'}]),{status:201,headers:{'content-type':'application/json'}})});
    const job=await insertRuntimeJob(env,'user-token',{device_id:'d',tool:'ollama.chat',idempotency_key:'key-1'});
    expect(job.id).toBe('job-1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).not.toContain('on_conflict');
    expect(calls[0].prefer).toBe('return=representation');
  });
  it('returns the existing job after a unique idempotency conflict without UPDATE',async()=>{
    let n=0;
    vi.stubGlobal('fetch',async(url:any,init:any={})=>{n+=1;if(n===1)return new Response(JSON.stringify({code:'23505',message:'duplicate key'}),{status:409,headers:{'content-type':'application/json'}});expect(String(url)).toContain('idempotency_key=eq.key-1');expect(String(init.method||'GET')).toBe('GET');return new Response(JSON.stringify([{id:'job-existing',idempotency_key:'key-1'}]),{status:200,headers:{'content-type':'application/json'}})});
    const job=await insertRuntimeJob(env,'user-token',{device_id:'d',tool:'ollama.chat',idempotency_key:'key-1'});
    expect(job.id).toBe('job-existing');
    expect(n).toBe(2);
  });
});
