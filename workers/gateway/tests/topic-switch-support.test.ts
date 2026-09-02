import { afterEach,describe,expect,it,vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});

describe('topic switch and supporting memory',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('resets a single-result prior context when a clear new topic is asked',async()=>{
    const scholarship={id:'ptt11',title:'รับทุน ปตท. ที่โรงเรียนวัดพระธาตุ',description:'วันที่ 11 กันยายน 2569 ไปรับทุน ปตท.',start_at:'2026-09-11T00:00:00Z',location:'โรงเรียนวัดพระธาตุ',status:'planned',metadata:{}};
    const retire18={id:'ret18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ ผอ. เผือก',start_at:'2026-09-18T10:00:00Z',status:'planned',metadata:{}};
    const retire25={id:'ret25',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',description:'งานเกษียณ ผอ. เผือก',start_at:'2026-09-25T02:00:00Z',location:'โรงเรียน',status:'planned',metadata:{}};
    vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/events?')){if(url.includes('id=eq.ptt11'))return json([scholarship]);if(url.includes('เกษียณ')||url.includes('เผือก'))return json([retire18,retire25]);return json([])}
      if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?'))return json([]);
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'งานเกษียณพี่เผือกวันไหน',recentContext:[{role:'user',text:'รับทุน ปตท วันไหน'},{role:'ceo',text:'วันที่ 11 กันยายน 2569ครับ',sourceId:'ptt11',query:'รับทุน ปตท วันไหน',field:'date',resultSet:[{id:'ptt11',kind:'events',title:scholarship.title,startAt:scholarship.start_at,location:scholarship.location}]}]})}),env),payload:any=await response.json();
    expect(payload.data.answer).toContain('18 กันยายน 2569');expect(payload.data.answer).toContain('25 กันยายน 2569');expect(payload.data.answer).not.toContain('11 กันยายน 2569');
  });

  it('uses supporting memory for people without changing the active event source',async()=>{
    const scholarship={id:'ptt11',title:'รับทุน ปตท. ที่โรงเรียนวัดพระธาตุ',description:'วันที่ 11 กันยายน 2569 ไปรับทุน ปตท.',start_at:'2026-09-11T00:00:00Z',location:'โรงเรียนวัดพระธาตุ',status:'planned',metadata:{}};
    const support={id:'mem1',title:'รับทุน ปตท. 11 กันยายน 2569 — ผู้ร่วมเดินทาง',content:'วันที่ 11 กันยายน 2569 ไปรับทุน ปตท. โดยนำนักเรียนไป 10 คน และครูอ๊อฟไปด้วย',memory_type:'fact',importance:3,status:'active',tags:[]};
    vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/events?')&&url.includes('id=eq.ptt11'))return json([scholarship]);
      if(url.includes('/rest/v1/events?'))return json([]);
      if(url.includes('/rest/v1/memories?'))return json([support]);
      if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?'))return json([]);
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ไปกับใคร',recentContext:[{role:'user',text:'รับทุน ปตท วันไหน'},{role:'ceo',text:'วันที่ 11 กันยายน 2569ครับ',sourceId:'ptt11',query:'รับทุน ปตท วันไหน',field:'date',resultSet:[{id:'ptt11',kind:'events',title:scholarship.title,startAt:scholarship.start_at,location:scholarship.location}]}]})}),env),payload:any=await response.json();
    expect(payload.data.answer).toBe('ไปกับนักเรียน 10 คน และครูอ๊อฟครับ');expect(payload.data.context.sourceId).toBe('ptt11');
  });
});
