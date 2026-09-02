import { afterEach,describe,expect,it,vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});

describe('memory metabolism write APIs',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('does not create a duplicate task when canonical task already exists',async()=>{
   const calls:any[]=[];vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}calls.push({url,method,body});
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/tasks?')&&method==='GET')return json([{id:'t17',title:'ส่งเล่ม PA',description:'ส่งเล่ม PA ให้สำนักงานเขต',due_at:'2026-09-17T02:00:00Z',status:'open',tags:[]}]);
     throw new Error('unexpected '+method+' '+url);
   });
   const r=await handleApi(new Request('https://ceo.test/api/tasks',{method:'POST',headers:auth,body:JSON.stringify({title:'ส่งเล่ม PA',description:'ส่งเล่ม PA ให้สำนักงานเขต',dueAt:'2026-09-17T02:00:00Z'})}),env),p:any=await r.json();
   expect(r.status).toBe(200);expect(p.data.id).toBe('t17');expect(p.data.deduplicated).toBe(true);expect(calls.some(x=>x.method==='POST'&&x.url.includes('/rest/v1/tasks?select=*'))).toBe(false);
 });
 it('does not create a duplicate event when same canonical event exists',async()=>{
   const calls:any[]=[];vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();calls.push({url,method});
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?')&&method==='GET')return json([{id:'e18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ ผอ. เผือก',start_at:'2026-09-18T10:00:00Z',location:'ร้านอาหารกัลยาฟ้าใส',status:'planned',tags:[]}]);
     throw new Error('unexpected '+method+' '+url);
   });
   const r=await handleApi(new Request('https://ceo.test/api/events',{method:'POST',headers:auth,body:JSON.stringify({title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ ผอ. เผือก',startAt:'2026-09-18T10:00:00Z',location:'ร้านอาหารกัลยาฟ้าใส'})}),env),p:any=await r.json();
   expect(r.status).toBe(200);expect(p.data.id).toBe('e18');expect(p.data.deduplicated).toBe(true);expect(calls.some(x=>x.method==='POST'&&x.url.includes('/rest/v1/events?select=*'))).toBe(false);
 });
 it('returns the current canonical memory instead of duplicating it',async()=>{
   const calls:any[]=[];vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();calls.push({url,method});
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/memory_nodes?')&&method==='GET')return json([{node_id:'mem_old',node_type:'memory',title:'ข้อมูลห้องธุรการ',content:'ตู้เอกสารสีเทาอยู่ห้องธุรการ',memory_kind:'semantic',importance:2,project_ref:'',source_refs:[],reference_path:'ceo://memory/mem_old',tier:'hot',retention_policy:'standard',source_kind:'user',truth_status:'reported',evidence_status:'single_source',lifecycle_status:'current',metadata:{},created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'}]);
     throw new Error('unexpected '+method+' '+url);
   });
   const r=await handleApi(new Request('https://ceo.test/api/memories',{method:'POST',headers:auth,body:JSON.stringify({title:'ข้อมูลห้องธุรการ',content:'ตู้เอกสารสีเทาอยู่ห้องธุรการ',memoryType:'fact'})}),env),p:any=await r.json();
   expect(p.data.deduplicated).toBe(true);expect(calls.some(x=>x.method==='POST'&&x.url.includes('/rest/v1/memories'))).toBe(false);
 });
});
