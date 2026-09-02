import { afterEach,describe,expect,it,vi } from 'vitest';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const ref=(row:any)=>({id:row.id,kind:'events',title:row.title,startAt:row.start_at,location:row.location});

function exactEventFetch(events:Record<string,any>){
  return async(input:any)=>{const url=decodeURIComponent(String(input));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});for(const [id,event] of Object.entries(events)){if(url.includes('/rest/v1/events?')&&url.includes(`id=eq.${id}`))return json([event]);}if(url.includes('/rest/v1/events?')||url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/knowledge_entries?'))return json([]);throw new Error('unexpected '+url)};
}

describe('multi-result conversational state',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('never crosses from the active scholarship event into an unrelated retirement event',async()=>{
    const scholarship={id:'ptt11',title:'รับทุน ปตท.',description:'วันที่ 11 กันยายน 2569 รับทุน ปตท. นำเด็กไป 10 คน ครูอ๊อฟไปด้วย',start_at:'2026-09-11T02:00:00Z',status:'planned',metadata:{}};
    vi.stubGlobal('fetch',exactEventFetch({ptt11:scholarship}));
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ไปกับใคร',recentContext:[{role:'user',text:'รับทุน ปตท วันไหน'},{role:'ceo',text:'วันที่ 11 กันยายน 2569ครับ',sourceId:'ptt11',query:'รับทุน ปตท วันไหน',field:'date',resultSet:[ref(scholarship)]}]})}),env),payload:any=await response.json();
    expect(payload.data.answer).toBe('ไปกับนักเรียน 10 คน และครูอ๊อฟครับ');expect(payload.data.context.sourceId).toBe('ptt11');expect(payload.data.intent).toBe('result-set-followup');
  });

  it('switches within the previous retirement candidate set by date and carries the requested field',async()=>{
    const e18={id:'e18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ',location:'ร้านอาหารกัลยาฟ้าใส',start_at:'2026-09-18T10:00:00Z',status:'planned',metadata:{}};
    const e25={id:'e25',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',description:'งานเกษียณที่โรงเรียน',location:'โรงเรียน',start_at:'2026-09-25T02:00:00Z',status:'planned',metadata:{}};
    vi.stubGlobal('fetch',exactEventFetch({e18,e25}));
    const resultSet=[ref(e18),ref(e25)];
    const first=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'วันที่ 25 จัดที่ไหน',recentContext:[{role:'user',text:'งานเกษียณพี่เผือกวันไหน'},{role:'ceo',text:'มี 2 งานครับ',sourceId:'e18',query:'งานเกษียณพี่เผือก',field:'date',resultSet}]})}),env),p1:any=await first.json();
    expect(p1.data.answer).toBe('ที่ โรงเรียนครับ');expect(p1.data.context.sourceId).toBe('e25');
    const second=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'แล้ววันที่ 18 ล่ะ',recentContext:[{role:'user',text:'วันที่ 25 จัดที่ไหน'},{role:'ceo',text:p1.data.answer,sourceId:'e25',query:'งานเกษียณพี่เผือก',field:'location',resultSet}]})}),env),p2:any=await second.json();
    expect(p2.data.answer).toContain('กัลยาฟ้าใส');expect(p2.data.context.sourceId).toBe('e18');expect(p2.data.context.field).toBe('location');
  });

  it('expands the four-school aggregate result set for bare expansion and field-list follow-ups',async()=>{
    const rows=[14,15,16,17].map((d,i)=>({id:`pa${d}`,title:`ประเมิน PA โรงเรียนวัด${['บางจิก','ไผ่มุ้ง','ดอนไข่เต่า','ดอนขาด'][i]}`,description:'ประเมิน PA ครู',start_at:`2026-09-${d}T02:00:00Z`,status:'planned',metadata:{}}));
    vi.stubGlobal('fetch',exactEventFetch(Object.fromEntries(rows.map(row=>[row.id,row]))));
    const resultSet=rows.map(ref),context=[{role:'user',text:'เดือนนี้ประเมิน pa กี่โรงเรียน'},{role:'ceo',text:'เดือนนี้มี 4 โรงเรียนที่ต้องประเมินครับ',query:'เดือนนี้ประเมิน pa',field:'general',resultSet}];
    for(const [message,checks] of [['อะไรบ้าง',['4 รายการ','บางจิก','ดอนขาด']],['โรงเรียนไหนบ้าง',['4 แห่ง','ไผ่มุ้ง','ดอนไข่เต่า']],['วันไหนบ้าง',['14 กันยายน 2569','17 กันยายน 2569','บางจิก','ดอนขาด']]] as const){
      const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message,recentContext:context})}),env),payload:any=await response.json();
      expect(payload.data.intent).toBe('result-set-expand');for(const check of checks)expect(payload.data.answer).toContain(check);
    }
  });
});
