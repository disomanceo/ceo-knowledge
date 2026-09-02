import { afterEach,describe,expect,it,vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const rows=[
 {id:'p14',title:'ประเมิน PA โรงเรียนบางจิก',description:'ประเมิน PA โรงเรียนบางจิก',start_at:'2026-09-14T02:00:00Z',status:'planned',metadata:{}},
 {id:'p15',title:'ประเมิน โรงเรียนวัดไผ่มุ้ง',description:'ประเมิน โรงเรียนวัดไผ่มุ้ง',start_at:'2026-09-15T02:00:00Z',status:'planned',metadata:{}},
 {id:'p16',title:'ประเมิน โรงเรียนวัดดอนไข่เต่า',description:'ประเมิน โรงเรียนวัดดอนไข่เต่า',start_at:'2026-09-16T02:00:00Z',status:'planned',metadata:{}},
 {id:'p17',title:'ประเมิน โรงเรียนวัดดอนขาด',description:'ประเมิน โรงเรียนวัดดอนขาด',start_at:'2026-09-17T02:00:00Z',status:'planned',metadata:{}},
];
const ref=(row:any)=>({id:row.id,kind:'events',title:row.title,startAt:row.start_at});

describe('V4.2 coverage-aware recall',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('answers a generic assessment date query with all matching events, not only the top hit',async()=>{
   vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});if(url.includes('/rest/v1/events?'))return json(url.includes('or=')?[rows[0]]:rows);if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/memory_nodes?'))return json([]);throw new Error('unexpected '+url)});
   const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ประเมิน PA เมื่อไหร่'})}),env),payload:any=await response.json();
   expect(payload.data.answer).toContain('14 กันยายน 2569');expect(payload.data.answer).toContain('15 กันยายน 2569');expect(payload.data.answer).toContain('16 กันยายน 2569');expect(payload.data.answer).toContain('17 กันยายน 2569');expect(payload.data.context.resultSet).toHaveLength(4);
 });
 it('treats coverage follow-ups as expansion of the prior result set',async()=>{
   vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});for(const row of rows)if(url.includes('/rest/v1/events?')&&url.includes(`id=eq.${row.id}`))return json([row]);if(url.includes('/rest/v1/events?')||url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?'))return json([]);throw new Error('unexpected '+url)});
   const resultSet=rows.map(ref),context=[{role:'user',text:'ประเมิน PA เมื่อไหร่'},{role:'ceo',text:'มี 4 งานครับ',query:'ประเมิน PA เมื่อไหร่',field:'date',resultSet}];
   for(const message of ['แค่นี้เหรอ','แล้ววันอื่นมีประเมินอีกไหม']){const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message,recentContext:context})}),env),payload:any=await response.json();expect(payload.data.intent).toBe('result-set-expand');expect(payload.data.answer).toContain('14 กันยายน 2569');expect(payload.data.answer).toContain('17 กันยายน 2569');}
 });
});
