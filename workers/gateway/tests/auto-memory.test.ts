import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoCapture, classifyAutoMemoryHeuristic, containsAutoMemorySecret, parseThaiDateRange, parseThaiDateTime } from '../src/auto-memory';
import { handleApi } from '../src/api';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const now=new Date('2026-09-01T03:00:00.000Z'); // 10:00 Asia/Bangkok

describe('Ceo Knowledge Auto Memory classifier',()=>{
  it('keeps explicit remember as permanent+pinned candidate',()=>{
    const d=classifyAutoMemoryHeuristic({message:'จำไว้ว่า โปรเจกต์ Alpha Test ใช้สำหรับทดสอบ Memory OS',source:'chatgpt'},now);
    expect(d.explicit).toBe(true);
    expect(d.kind).toBe('project_knowledge');
    expect(d.retention).toBe('permanent');
    expect(d.score).toBeGreaterThanOrEqual(0.75);
    expect(d.blocked).toBe(false);
  });

  it('blocks secrets even when the user explicitly asks to remember them',()=>{
    expect(containsAutoMemorySecret('จำไว้ว่า password: super-secret-123')).toBe(true);
    const d=classifyAutoMemoryHeuristic({message:'บันทึกไว้ password: super-secret-123'},now);
    expect(d.kind).toBe('ignore');
    expect(d.blocked).toBe(true);
    expect(d.retention).toBe('none');
  });

  it('parses Buddhist Era Thai date/time in Bangkok correctly',()=>{
    expect(parseThaiDateTime('18 ก.ย. 2569 เวลา 17.00 น. มีงานเลี้ยงเกษียณ',now)).toBe('2026-09-18T10:00:00.000Z');
    expect(parseThaiDateTime('พรุ่งนี้ 09:30 ประชุม',now)).toBe('2026-09-02T02:30:00.000Z');
  });

  it('parses Thai same-month date ranges as all-day spans',()=>{
    const range=parseThaiDateRange('ให้ครูจัดการเรียนการสอนด้วย AI วันที่ 2-3 ก.ย. ให้ทำ 2 วัน',now);
    expect(range?.startAt).toBe('2026-09-01T17:00:00.000Z');
    expect(range?.endAt).toBe('2026-09-03T16:59:59.999Z');
    expect(range?.allDay).toBe(true);
  });

  it('treats durable instructions as save intent without depending on one exact keyword',()=>{
    const samples=[
      'สั่งให้ครูดาวรวบรวมรูปวันที่ 2-3 ก.ย.',
      'มอบหมายครูดาวให้รับผิดชอบรวบรวมรูปวันที่ 2-3 ก.ย.',
      'ฝากไว้ว่า ต่อไปให้ครูดาวรวบรวมรูป',
      'คราวหน้าห้ามลืมถ่ายรูปกิจกรรม',
      'ให้ครูช่วยกันทำสื่อการสอนวันที่ 2-3 ก.ย. และให้ครูดาวรวบรวมรูป',
    ];
    for(const message of samples){
      const d=classifyAutoMemoryHeuristic({message,source:'mobile'},now);
      expect(d.explicit||['event','task','memory'].includes(d.kind)).toBe(true);
      expect(d.retention).not.toBe('none');
    }
  });

  it('classifies a multi-day teaching assignment as a permanent structured event',()=>{
    const message='สั่งให้ครูช่วยกันทำสื่อการสอน และจัดการเรียนการสอนด้วย AI วันที่ 2-3 ก.ย. ให้ทำ 2 วัน และให้ครูดาวเป็นคนรวบรวม ถ่ายรูป';
    const d=classifyAutoMemoryHeuristic({message,source:'mobile'},now);
    expect(d.explicit).toBe(true);
    expect(d.kind).toBe('event');
    expect(d.eventAt).toBe('2026-09-01T17:00:00.000Z');
    expect(d.endAt).toBe('2026-09-03T16:59:59.999Z');
    expect(d.allDay).toBe(true);
    expect(d.retention).toBe('permanent');
    expect(d.needsConfirmation).toBe(false);
  });

  it('classifies a dated retirement party as a permanent event',()=>{
    const d=classifyAutoMemoryHeuristic({message:'18 ก.ย. 2569 เวลา 17.00 น. มีงานเลี้ยงเกษียณ ผอ. เผือก ช่วงเย็น',source:'chatgpt'},now);
    expect(d.kind).toBe('event');
    expect(d.eventAt).toBe('2026-09-18T10:00:00.000Z');
    expect(d.eventType).toBe('activity');
    expect(d.retention).toBe('permanent');
    expect(d.needsConfirmation).toBe(false);
  });

  it('classifies a dated obligation as a task with due time',()=>{
    const d=classifyAutoMemoryHeuristic({message:'17 ก.ย. 2569 เวลา 16.00 น. ต้องส่งเล่ม PA ให้สำนักงานเขต',source:'chatgpt'},now);
    expect(d.kind).toBe('task');
    expect(d.dueAt).toBe('2026-09-17T09:00:00.000Z');
    expect(d.retention).toBe('permanent');
  });

  it('ignores ordinary low-value questions',()=>{
    const d=classifyAutoMemoryHeuristic({message:'ทำไมวันนี้เว็บช้า?',source:'chatgpt'},now);
    expect(d.kind).toBe('ignore');
    expect(d.retention).toBe('none');
  });

  it('never stores Thai calendar questions as memory candidates',()=>{
    const d=classifyAutoMemoryHeuristic({message:'วันที่ 18 มีอะไรไหม',source:'mobile'},now);
    expect(d.kind).toBe('ignore');
    expect(d.retention).toBe('none');
  });
  it('keeps daily-life statements as episodic archive candidates but ignores recall questions',()=>{
    const fact=classifyAutoMemoryHeuristic({message:'เมื่อวานกินข้าวกับแกงไก่ที่บ้าน',source:'chatgpt'},now);
    expect(fact.kind).toBe('memory');
    expect(fact.eventAt).toBe('2026-08-31T02:00:00.000Z');
    expect(['consolidation','permanent']).toContain(fact.retention);
    const question=classifyAutoMemoryHeuristic({message:'เมื่อวานกินข้าวกับอะไร',source:'chatgpt'},now);
    expect(question.kind).toBe('ignore');
    expect(question.retention).toBe('none');
  });
});

describe('Ceo Knowledge Auto Memory central API',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('archives and writes a high-confidence event through one authenticated endpoint',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();
      let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='GET')return json([]);
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='POST')return json([{id:'conv-row',conversation_key:body.conversation_key,summary:body.summary,metadata:body.metadata}]);
      if(url.endsWith('/rest/v1/events?select=*')&&method==='POST')return json([{id:'evt-1',...body}]);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:body?.p_snapshot?.nodeId,revision:1});
      throw new Error('unexpected '+method+' '+url);
    });

    const response=await handleApi(new Request('https://ceo.test/api/memory/auto-capture',{method:'POST',headers:auth,body:JSON.stringify({
      message:'18 ก.ย. 2569 เวลา 17.00 น. มีงานเลี้ยงเกษียณ ผอ. เผือก ช่วงเย็น',
      source:'chatgpt',conversationId:'chatgpt:retirement-2026',sourceRef:'chatgpt://retirement-2026'
    })}),env);
    expect(response.status).toBe(201);
    const payload:any=await response.json();
    expect(payload.data.decision.kind).toBe('event');
    expect(payload.data.written.kind).toBe('event');
    const eventCall=calls.find(x=>x.url.endsWith('/rest/v1/events?select=*'));
    expect(eventCall.body.start_at).toBe('2026-09-18T10:00:00.000Z');
    expect(eventCall.body.metadata.autoMemory).toBe(true);
    expect(eventCall.body.metadata.source).toBe('chatgpt');
    const archiveCall=calls.find(x=>x.url.includes('/conversation_summaries?')&&x.method==='POST');
    expect(archiveCall.body.conversation_key).toBe('chatgpt:retirement-2026');
    expect(archiveCall.body.metadata.classification).toBe('event');
  });

  it('writes a multi-day assignment from chat and acknowledges the durable capture',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();
      let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='GET')return json([]);
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='POST')return json([{id:'conv-row',conversation_key:body.conversation_key,summary:body.summary,metadata:body.metadata}]);
      if(url.endsWith('/rest/v1/events?select=*')&&method==='POST')return json([{id:'evt-ai-teaching',...body}]);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:body?.p_snapshot?.nodeId,revision:1});
      throw new Error('unexpected '+method+' '+url);
    });
    const message='สั่งให้ครูช่วยกันทำสื่อการสอน และจัดการเรียนการสอนด้วย AI วันที่ 2-3 ก.ย. ให้ทำ 2 วัน และให้ครูดาวเป็นคนรวบรวม ถ่ายรูป';
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message,conversationId:'mobile:ai-teaching'})}),env);
    expect(response.status).toBe(200);
    const payload:any=await response.json();
    expect(payload.data.intent).toBe('remember');
    expect(payload.data.answer).toContain('บันทึกเป็นกิจกรรม');
    expect(payload.data.autoMemory.decision.kind).toBe('event');
    expect(payload.data.autoMemory.decision.explicit).toBe(true);
    const eventCall=calls.find(x=>x.url.endsWith('/rest/v1/events?select=*'));
    expect(eventCall.body.start_at).toBe('2026-09-01T17:00:00.000Z');
    expect(eventCall.body.end_at).toBe('2026-09-03T16:59:59.999Z');
    expect(eventCall.body.all_day).toBe(true);
  });

  it('writes explicit durable project knowledge with pinned provenance',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();
      let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      calls.push({url,method,body});
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='GET')return json([]);
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='POST')return json([{id:'conv-row',conversation_key:body.conversation_key,summary:body.summary,metadata:body.metadata}]);
      if(url.includes('/rest/v1/knowledge_entries?')&&method==='POST')return json([{id:'knowledge-1',...body}]);
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:body?.p_snapshot?.nodeId,revision:1});
      throw new Error('unexpected '+method+' '+url);
    });

    const result=await autoCapture(env,'user-token',{message:'จำไว้ว่า โปรเจกต์ Alpha Test ใช้สำหรับทดสอบ Memory OS',source:'chatgpt',conversationId:'alpha-chat'});
    expect(result.decision.explicit).toBe(true);
    expect(result.decision.kind).toBe('project_knowledge');
    expect(result.written.kind).toBe('project_knowledge');
    const knowledgeCall=calls.find(x=>x.url.includes('/knowledge_entries?')&&x.method==='POST');
    expect(knowledgeCall.body.metadata.autoMemory).toBe(true);
    expect(knowledgeCall.body.tags).toContain('auto-memory');
  });

  it('deduplicates repeated capture by conversation fingerprint before domain write',async()=>{
    let storedFingerprint='';
    let eventWrites=0;
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=decodeURIComponent(String(input)),method=String(init.method||'GET').toUpperCase();
      let body:any=null;try{body=init.body?JSON.parse(String(init.body)):null}catch{}
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='GET')return storedFingerprint?json([{id:'conv-row',metadata:{lastCaptureFingerprint:storedFingerprint}}]):json([]);
      if(url.includes('/rest/v1/conversation_summaries?')&&method==='POST'){storedFingerprint=body.metadata.lastCaptureFingerprint;return json([{id:'conv-row',metadata:body.metadata}]);}
      if(url.includes('/rest/v1/events?')&&method==='GET')return eventWrites?json([{id:'evt-1',metadata:{captureFingerprint:'existing'}}]):json([]);
      if(url.endsWith('/rest/v1/events?select=*')&&method==='POST'){eventWrites++;return json([{id:'evt-'+eventWrites,...body}]);}
      if(url.endsWith('/rest/v1/rpc/memory_replica_apply')&&method==='POST')return json({outcome:'accepted',nodeId:body?.p_snapshot?.nodeId,revision:1});
      throw new Error('unexpected '+method+' '+url);
    });
    const input={message:'25 ก.ย. 2569 เวลา 09.00 น. มีงานเลี้ยงเกษียณ ผอ. เผือก ที่โรงเรียน',source:'chatgpt' as const,conversationId:'retirement-school'};
    const first=await autoCapture(env,'user-token',input);
    const second=await autoCapture(env,'user-token',input);
    expect(first.written?.kind).toBe('event');
    expect(second.duplicate).toBe(true);
    expect(second.written?.kind).toBe('event');
    expect(eventWrites).toBe(1);
  });

  it('does not write or archive secret-bearing content',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input);calls.push(url);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/auto-memory/capture',{method:'POST',headers:auth,body:JSON.stringify({message:'จำไว้ password: super-secret-123',source:'chatgpt'})}),env);
    expect(response.status).toBe(200);
    const payload:any=await response.json();
    expect(payload.data.decision.blocked).toBe(true);
    expect(payload.data.written).toBeNull();
    expect(payload.data.archive).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('prevents legacy /api/chat from saving an explicit secret',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any)=>{
      const url=String(input);calls.push(url);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'จำไว้ password: super-secret-123'})}),env);
    expect(response.status).toBe(200);
    const payload:any=await response.json();
    expect(payload.data.intent).toBe('remember');
    expect(payload.data.answer).toContain('ไม่บันทึก');
    expect(payload.data.memory).toBeNull();
    expect(payload.data.autoMemory.decision.blocked).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('supports dry-run classification without mutation',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any)=>{
      const url=String(input);calls.push(url);
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      throw new Error('unexpected '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/memory/auto-capture',{method:'POST',headers:auth,body:JSON.stringify({message:'พรุ่งนี้ 09.00 ประชุมทีม',source:'chatgpt',dryRun:true})}),env);
    expect(response.status).toBe(200);
    const payload:any=await response.json();
    expect(payload.data.decision.kind).toBe('event');
    expect(payload.data.written).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
