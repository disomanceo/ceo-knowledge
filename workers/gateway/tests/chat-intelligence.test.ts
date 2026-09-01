import { describe,expect,it } from 'vitest';
import { composeDateAnswer,dateTextMatchesIntent,detectChatIntent,extractTemporalTopic,isQuestionLike,memoryLooksLikeQuestion,parseDateIntent,parseTemporalIntent,temporalTextMatchesIntent } from '../src/chat-intelligence';
const now=new Date('2026-09-01T04:40:00.000Z');
describe('chat intelligence',()=>{
 it('recognizes Thai question without question mark',()=>{expect(isQuestionLike('วันที่ 18 มีอะไรไหม')).toBe(true);expect(isQuestionLike('ดูภาพยนต์วันไหน')).toBe(true);expect(memoryLooksLikeQuestion({content:'Memory: วันที่ 18 มีอะไรไหม'})).toBe(true)});
 it('resolves day-only date to current/upcoming Bangkok month',()=>{const x=parseDateIntent('วันที่ 18 มีอะไรไหม',now)!;expect(x.from).toBe('2026-09-17T17:00:00.000Z');expect(x.to).toBe('2026-09-18T16:59:59.999Z')});
 it('resolves explicit Thai Buddhist date',()=>{const x=parseDateIntent('18 ก.ย. 2569 มีอะไร',now)!;expect(x.year).toBe(2026);expect(x.month).toBe(9);expect(x.day).toBe(18)});
 it('routes date before generic recall',()=>{expect(detectChatIntent('วันที่ 18 มีอะไรไหม',now).kind).toBe('date');expect(detectChatIntent('งานค้างมีอะไรบ้าง',now).kind).toBe('tasks')});
 it('does not treat ordinary numbers as calendar dates',()=>{expect(detectChatIntent('โปรเจกต์ 2 มีอะไรไหม',now).kind).toBe('recall')});
 it('routes a bare leading day question as a date',()=>{const x=detectChatIntent('17 มีอะไรไหม',now);expect(x.kind).toBe('date');if(x.kind==='date'){expect(x.day).toBe(17);expect(x.month).toBe(9)}});
 it('matches exact Thai dates embedded in memory text',()=>{const i=parseDateIntent('17 ก.ย. มีอะไร',now)!;expect(dateTextMatchesIntent('วันที่ 17 กันยายน 2569 ต้องส่งเล่ม PA ให้สำนักงานเขต',i)).toBe(true);expect(dateTextMatchesIntent('วันที่ 18 กันยายน 2569 มีงานเลี้ยง',i)).toBe(false)});
 it('supports relative day vocabulary',()=>{expect(parseDateIntent('พรุ่งนี้มีอะไร',now)?.day).toBe(2);expect(parseDateIntent('มะรืนมีอะไร',now)?.day).toBe(3);expect(parseDateIntent('เมื่อวานมีอะไร',now)?.day).toBe(31);expect(parseDateIntent('วานซืนมีอะไร',now)?.day).toBe(30)});
 it('parses week month and year ranges centrally',()=>{expect(parseTemporalIntent('สัปดาห์หน้ามีอะไรบ้าง',now)?.granularity).toBe('week');expect(parseTemporalIntent('เดือนนี้มีงานเกษียณอะไรบ้าง',now)?.month).toBe(9);expect(parseTemporalIntent('เดือนหน้า มีอะไร',now)?.month).toBe(10);expect(parseTemporalIntent('ปีหน้า มีอะไร',now)?.year).toBe(2027);expect(parseTemporalIntent('ปีที่แล้ว มีอะไร',now)?.year).toBe(2025)});
 it('parses named month year and forward windows',()=>{const m=parseTemporalIntent('เดือนตุลาคม 2569 มีอะไรบ้าง',now)!;expect(m.month).toBe(10);expect(m.year).toBe(2026);expect(parseTemporalIntent('ภายใน 7 วัน มีอะไร',now)?.granularity).toBe('range')});
 it('extracts a temporal topic instead of searching the whole sentence',()=>{expect(extractTemporalTopic('เดือนนี้มีงานเกษียณอะไรบ้าง')).toBe('งานเกษียณ');expect(extractTemporalTopic('เดือนนี้มีงานอะไรบ้าง')).toBe('')});
 it('matches explicit memory dates against a broad temporal range',()=>{const i=parseTemporalIntent('เดือนนี้มีงานเกษียณอะไรบ้าง',now)!;expect(temporalTextMatchesIntent('วันที่ 18 กันยายน 2569 มีงานเลี้ยงเกษียณ',i)).toBe(true);expect(temporalTextMatchesIntent('วันที่ 18 ตุลาคม 2569 มีงานเลี้ยงเกษียณ',i)).toBe(false)});
 it('composes secretary-style date answer',()=>{const i=parseDateIntent('วันที่ 18 มีอะไรไหม',now)!;const a=composeDateAnswer(i,{events:[{title:'งานเกษียณ',start_at:'2026-09-18T10:00:00Z',location:''}],tasks:[],memories:[]});expect(a).toContain('งานเกษียณ');expect(a).not.toContain('พบข้อมูลที่เกี่ยวข้อง')});
});

import { afterEach, vi } from 'vitest';
import { handleApi } from '../src/api';
const apiEnv:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
describe('structured chat retrieval',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('answers วันที่ 18 from exact date fields and never auto-saves the question',async()=>{
   const calls:string[]=[];vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);calls.push(decodeURIComponent(url));
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?'))return json([{id:'e18',title:'งานเกษียณ',description:'',event_type:'activity',start_at:'2026-09-18T10:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'},{id:'e25',title:'งานวันที่ 25',description:'',event_type:'activity',start_at:'2026-09-25T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'}]);
     if(url.includes('/rest/v1/tasks?'))return json([{id:'t18',title:'งานครบกำหนด 18',description:'',status:'open',priority:'normal',due_at:'2026-09-18T03:00:00Z',waiting_for:'',created_at:'',updated_at:''},{id:'t19',title:'งานวันที่ 19',description:'',status:'open',priority:'normal',due_at:'2026-09-19T03:00:00Z',waiting_for:'',created_at:'',updated_at:''}]);
     if(url.includes('/rest/v1/memory_nodes?'))return json([{node_id:'mem_good12345678',title:'เรื่องวันที่ 18',content:'ข้อมูลวันที่ 18',memory_kind:'episodic',importance:1,event_at:'2026-09-18T04:00:00Z',project_ref:'',reference_path:'',updated_at:''},{node_id:'mem_q12345678',title:'วันที่ 18 มีอะไรไหม',content:'Memory: วันที่ 18 มีอะไรไหม',memory_kind:'semantic',importance:1,event_at:'2026-09-18T04:00:00Z',project_ref:'',reference_path:'',updated_at:''}]);
     throw new Error('unexpected '+url);
   });
   const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'วันที่ 18 มีอะไรไหม'})}),apiEnv);const payload:any=await response.json();
   expect(payload.data.intent).toBe('date');expect(payload.data.answer).toContain('งานเกษียณ');expect(payload.data.answer).toContain('งานครบกำหนด 18');expect(payload.data.answer).toContain('เรื่องวันที่ 18');expect(payload.data.answer).not.toContain('วันที่ 25');expect(payload.data.answer).not.toContain('งานวันที่ 19');expect(payload.data.answer).not.toContain('Memory: วันที่ 18 มีอะไรไหม');expect(payload.data.autoMemory).toBeNull();
   expect(calls.some(x=>x.includes('conversation_summaries')||x.includes('memory_replica_apply'))).toBe(false);
 });
 it('finds a date written only inside legacy memory content',async()=>{
   vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=String(input),method=String(init.method||'GET').toUpperCase();
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?'))return json([]);
     if(url.includes('/rest/v1/tasks?'))return json([]);
     if(url.includes('/rest/v1/memories?'))return json([{id:'m17',title:'ส่งเล่ม PA สำนักงานเขต',content:'วันที่ 17 กันยายน 2569 ต้องส่งเล่ม PA ให้สำนักงานเขต และต้องแจ้งเตือนล่วงหน้า 1 วัน',memory_type:'fact',importance:2,scope:'global',status:'active',tags:[],created_at:'',updated_at:''}]);
     if(url.includes('/rest/v1/memory_nodes?'))return json([]);
     throw new Error('unexpected '+method+' '+url);
   });
   for(const message of ['17 ก.ย. มีอะไร','17 มีอะไรไหม']){
     const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message})}),apiEnv),payload:any=await response.json();
     expect(payload.data.intent).toBe('date');expect(payload.data.answer).toContain('ส่งเล่ม PA สำนักงานเขต');expect(payload.data.answer).not.toContain('งานเกษียณ');
   }
 });
 it('answers a topic-filtered month query from structured events',async()=>{
   vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=String(input),method=String(init.method||'GET').toUpperCase();
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?'))return json([
       {id:'e18',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'ช่วงเย็น',event_type:'activity',start_at:'2026-09-18T10:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'},
       {id:'e25',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',description:'',event_type:'activity',start_at:'2026-09-25T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'โรงเรียน',status:'planned',priority:'normal'},
       {id:'e20',title:'ประชุมครูประจำเดือน',description:'',event_type:'meeting',start_at:'2026-09-20T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'},
       {id:'eOct',title:'งานเกษียณเดือนตุลาคม',description:'',event_type:'activity',start_at:'2026-10-02T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal'},
     ]);
     if(url.includes('/rest/v1/tasks?'))return json([]);
     if(url.includes('/rest/v1/memories?'))return json([]);
     if(url.includes('/rest/v1/memory_nodes?'))return json([]);
     throw new Error('unexpected '+method+' '+url);
   });
   const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'เดือนนี้มีงานเกษียณอะไรบ้าง'})}),apiEnv),payload:any=await response.json();
   expect(payload.data.intent).toBe('temporal');expect(payload.data.range.granularity).toBe('month');expect(payload.data.answer).toContain('งานเลี้ยงเกษียณ ผอ. เผือก');expect(payload.data.answer).toContain('งานเกษียณ ผอ. เผือก ที่โรงเรียน');expect(payload.data.answer).not.toContain('ประชุมครู');expect(payload.data.answer).not.toContain('เดือนตุลาคม');
 });
});

describe('topic recall across structured secretary data',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('answers ดูภาพยนต์วันไหน from Events and does not save the question',async()=>{
   const calls:string[]=[];vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);calls.push(decodeURIComponent(url));
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?'))return json([{id:'e7',title:'พานักเรียนไปดูภาพยนตร์ที่ Big C สุพรรณบุรี',description:'วันที่ 7 กันยายน 2569 พานักเรียนไปดูภาพยนตร์',event_type:'activity',start_at:'2026-09-06T17:00:00.000Z',end_at:null,all_day:true,timezone:'Asia/Bangkok',location:'Big C สุพรรณบุรี',status:'planned',priority:'normal',updated_at:'2026-09-01T07:11:41.000Z'}]);
     if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/conversation_summaries?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/devices?'))return json([]);
     throw new Error('unexpected '+url);
   });
   const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ดูภาพยนต์วันไหน'})}),apiEnv),payload:any=await response.json();
   expect(payload.data.intent).toBe('recall');expect(payload.data.mode).toBe('knowledge');expect(payload.data.answer).toBe('วันที่ 7 กันยายน 2569ครับ');expect(payload.data.autoMemory).toBeNull();
   expect(calls.some(x=>x.includes('/rest/v1/events?'))).toBe(true);expect(calls.some(x=>x.includes('memory_replica_apply'))).toBe(false);expect(calls.some(x=>x.includes('/rest/v1/runtime_jobs'))).toBe(false);
 });
 it('uses recent conversation context for a bare follow-up field question',async()=>{
   const calls:string[]=[];vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);calls.push(decodeURIComponent(url));
     if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
     if(url.includes('/rest/v1/events?'))return json([{id:'e7',title:'พานักเรียนไปดูภาพยนตร์ที่ Big C สุพรรณบุรี',description:'วันที่ 7 กันยายน 2569 พานักเรียนไปดูภาพยนตร์',event_type:'activity',start_at:'2026-09-06T17:00:00.000Z',end_at:null,all_day:true,timezone:'Asia/Bangkok',location:'Big C สุพรรณบุรี',status:'planned',priority:'normal',updated_at:'2026-09-01T07:11:41.000Z'}]);
     if(url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/conversation_summaries?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/memory_nodes?')||url.includes('/rest/v1/devices?'))return json([]);
     throw new Error('unexpected '+url);
   });
   const recentContext=[{role:'user',text:'ดูภาพยนต์วันไหน'},{role:'ceo',text:'วันที่ 7 กันยายน 2569ครับ'}];
   const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'ที่ไหน',conversationId:'mobile:test',recentContext})}),apiEnv),payload:any=await response.json();
   expect(payload.data.answer).toBe('ที่ Big C สุพรรณบุรีครับ');expect(payload.data.context.query).toBe('ดูภาพยนต์วันไหน');expect(payload.data.context.field).toBe('location');expect(payload.data.mode).toBe('knowledge');
   expect(calls.some(x=>x.includes('/rest/v1/runtime_jobs'))).toBe(false);
 });
});
