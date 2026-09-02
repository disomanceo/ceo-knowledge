import { afterEach,describe,expect,it,vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});

describe('Ceo V3 API behavior',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('updates the active event instead of creating a duplicate memory for a contextual append',async()=>{
    const calls:any[]=[];vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/events?select=*&id=eq.evt11&limit=1')&&method==='GET')return json([{id:'evt11',title:'รับทุน ปตท.',description:'วันที่ 11 กันยายน 2569 รับทุน ปตท.',start_at:'2026-09-11T02:00:00Z',metadata:{}}]);
      if(url.includes('/rest/v1/events?select=*&id=eq.evt11')&&method==='PATCH')return json([{id:'evt11',title:'รับทุน ปตท.',description:body.description,start_at:'2026-09-11T02:00:00Z',metadata:body.metadata}]);
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'นำเด็กไป 10 คนนะ ครูอ๊อฟไปด้วย',conversationId:'c1',recentContext:[{role:'user',text:'รับทุนปตทวันไหน'},{role:'ceo',text:'วันที่ 11 กันยายน 2569ครับ',sourceId:'evt11',query:'รับทุน ปตท วันไหน'}]})}),env),payload:any=await response.json();
    expect(payload.data.intent).toBe('memory-update');expect(payload.data.relation.relation).toBe('APPEND');expect(payload.data.context.sourceId).toBe('evt11');
    const patch=calls.find(x=>x.method==='PATCH');expect(patch.body.description).toContain('เด็กไป 10 คน');expect(patch.body.description).toContain('ครูอ๊อฟไปด้วย');
    expect(calls.some(x=>x.url.includes('/memories?')&&x.method==='POST')).toBe(false);
  });

  it('locks a bare location follow-up to the previously selected event',async()=>{
    const event={id:'evt18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ',location:'ร้านอาหารกัลยาฟ้าใส',start_at:'2026-09-18T10:00:00Z',status:'planned',metadata:{}};
    vi.stubGlobal('fetch',async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});if(url.includes('/rest/v1/events?')&&url.includes('id=eq.evt18'))return json([event]);if(url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memory_nodes?'))return json([]);if(url.includes('/rest/v1/events?'))return json([]);throw new Error('unexpected '+url)});
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ร้านอาหารอะไร',recentContext:[{role:'user',text:'วันที่ 18 ที่ไหนนะ'},{role:'ceo',text:'งานเลี้ยงเกษียณ ผอ. เผือก',sourceId:'evt18',query:'งานเลี้ยงเกษียณ ผอ. เผือก วันที่ 18'}]})}),env),payload:any=await response.json();
    expect(payload.data.answer).toContain('กัลยาฟ้าใส');expect(payload.data.context.sourceId).toBe('evt18');
  });
});
