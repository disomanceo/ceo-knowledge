import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildConversationState, isContextualQuestion, needsAiContextResolution, resolveConversationContext } from '../src/context-resolver';
import { handleApi } from '../src/api';

const baseEnv:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public',APP_ENV:'test'};
const auth={authorization:'Bearer user-token','content-type':'application/json'};
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const geminiJson=(value:any)=>json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});

describe('AI Context Resolver',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('keeps clear standalone questions deterministic and avoids an AI call',async()=>{
    const turns=[{role:'user',text:'งานเลี้ยงพี่เผือกวันไหน'},{role:'ceo',text:'วันที่ 18 กันยายนครับ'}];
    expect(needsAiContextResolution('งานเลี้ยงพี่เผือกจัดที่ไหน',turns)).toBe(false);
    const result=await resolveConversationContext(baseEnv,'งานเลี้ยงพี่เผือกจัดที่ไหน',turns);
    expect(result.usedAI).toBe(false);expect(result.resolvedQuery).toBe('งานเลี้ยงพี่เผือกจัดที่ไหน');expect(result.confidence).toBe(1);
  });

  it('detects elliptical Thai follow-ups and preserves conversation state',()=>{
    const turns=[{role:'user',text:'ประเมิน PA วันที่ 14 ที่ไหน'},{role:'ceo',text:'โรงเรียนบางจิกครับ',sourceId:'event-14',query:'ประเมิน PA วันที่ 14 ที่ไหน'}];
    expect(needsAiContextResolution('แล้วที่ดอนขาดล่ะ',turns)).toBe(true);
    expect(needsAiContextResolution('พี่ดาวด้วย',turns)).toBe(true);
    expect(needsAiContextResolution('อันนั้นล่ะ',turns)).toBe(true);
    const state=buildConversationState(turns);
    expect(state.previousResolvedQuery).toBe('ประเมิน PA วันที่ 14 ที่ไหน');expect(state.previousSourceId).toBe('event-14');
  });

  it('uses a deterministic prior-topic fallback for a bare date follow-up when cloud AI is unavailable',async()=>{
    const turns=[{role:'user',text:'ประเมินโรงเรียนบางจิกวันไหน'},{role:'ceo',text:'วันที่ 14 กันยายนครับ',query:'ประเมินโรงเรียนบางจิกวันไหน'}];
    const result=await resolveConversationContext(baseEnv,'แล้ววันที่ 15 ล่ะ',turns);
    expect(result.dependsOnPriorContext).toBe(true);expect(result.resolvedQuery).toContain('15');expect(result.resolvedQuery).toContain('ประเมิน');expect(result.confidence).toBeGreaterThanOrEqual(.8);
  });

  it('asks Gemini only to rewrite context, not to answer facts',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{calls.push({url:String(input),body:init.body?JSON.parse(String(init.body)):null});return geminiJson({resolvedQuery:'ประเมิน PA โรงเรียนวัดดอนขาดวันไหน',subject:'ประเมิน PA โรงเรียนวัดดอนขาด',intent:'recall',answerField:'date',confidence:.96,dependsOnPriorContext:true});});
    const result=await resolveConversationContext({...baseEnv,GEMINI_API_KEY:'test-key',GEMINI_MODEL:'gemini-test'},'แล้วที่ดอนขาดล่ะ',[{role:'user',text:'ประเมิน PA โรงเรียนบางจิกวันไหน'},{role:'ceo',text:'วันที่ 14 กันยายนครับ'}]);
    expect(result.usedAI).toBe(true);expect(result.resolvedQuery).toBe('ประเมิน PA โรงเรียนวัดดอนขาดวันไหน');expect(result.answerField).toBe('date');expect(result.confidence).toBe(.96);
    expect(calls).toHaveLength(1);expect(JSON.stringify(calls[0].body)).toContain('Context Resolver');expect(JSON.stringify(calls[0].body)).toContain('resolvedQuery');
  });

  it('marks low-confidence AI resolution for clarification instead of guessing',async()=>{
    vi.stubGlobal('fetch',async()=>geminiJson({resolvedQuery:'อันนั้นล่ะ',subject:'',intent:'unknown',answerField:'general',confidence:.41,dependsOnPriorContext:true}));
    const result=await resolveConversationContext({...baseEnv,GEMINI_API_KEY:'test-key'},'อันนั้นล่ะ',[{role:'user',text:'มีสองงานครับ'}]);
    expect(result.usedAI).toBe(true);expect(result.clarificationRequired).toBe(true);expect(result.confidence).toBe(.41);
  });

  it('rejects a high-confidence referent invented by AI when conversation anchors do not support it',async()=>{
    vi.stubGlobal('fetch',async()=>geminiJson({resolvedQuery:'งานเลี้ยง ผอ.เผือก วันไหน',subject:'งานเลี้ยง ผอ.เผือก',intent:'recall',answerField:'date',confidence:.99,dependsOnPriorContext:true}));
    const result=await resolveConversationContext({...baseEnv,GEMINI_API_KEY:'test-key'},'อันนั้นล่ะ',[{role:'user',text:'คุยเรื่องนิเทศครูดาว'},{role:'ceo',text:'กำลังดูตารางนิเทศครับ'}]);
    expect(result.clarificationRequired).toBe(true);expect(result.confidence).toBeLessThan(.6);expect(result.reason).toBe('AI_CONTEXT_UNSUPPORTED');
  });

  it('treats an AI-resolved short fragment as a question so Auto Memory cannot capture it',async()=>{
    vi.stubGlobal('fetch',async()=>geminiJson({resolvedQuery:'นิเทศการสอนครูดาววันไหน',subject:'นิเทศการสอนครูดาว',intent:'recall',answerField:'date',confidence:.94,dependsOnPriorContext:true}));
    const result=await resolveConversationContext({...baseEnv,GEMINI_API_KEY:'test-key'},'พี่ดาวด้วย',[{role:'user',text:'ครูแนนนิเทศวันไหน'},{role:'ceo',text:'วันที่ 10 กันยายนครับ'}]);
    expect(isContextualQuestion('พี่ดาวด้วย',result)).toBe(true);
  });
});

describe('Context Resolver chat grounding',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('resolves a new place in the previous topic, then answers only from the matching database event',async()=>{
    const event={id:'event-donkhat',title:'ประเมิน PA โรงเรียนวัดดอนขาด',description:'ประเมิน PA โรงเรียนวัดดอนขาด',event_type:'activity',start_at:'2026-09-15T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'โรงเรียนวัดดอนขาด',status:'planned',priority:'normal',metadata:{},tags:['PA']};
    const calls:string[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{
      const url=String(input),method=String(init.method||'GET').toUpperCase();calls.push(decodeURIComponent(url));
      if(url.endsWith('/auth/v1/user'))return json({id:'u1'});
      if(url.includes('generativelanguage.googleapis.com'))return geminiJson({resolvedQuery:'ประเมิน PA โรงเรียนวัดดอนขาดวันไหน',subject:'ประเมิน PA โรงเรียนวัดดอนขาด',intent:'recall',answerField:'date',confidence:.96,dependsOnPriorContext:true});
      if(url.includes('/rest/v1/events?'))return json([event]);
      if(url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/conversation_summaries?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memory_nodes?'))return json([]);
      throw new Error('unexpected '+method+' '+url);
    });
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'แล้วที่ดอนขาดล่ะ',conversationId:'c1',recentContext:[{role:'user',text:'ประเมิน PA โรงเรียนบางจิกวันไหน'},{role:'ceo',text:'วันที่ 14 กันยายนครับ',sourceId:'event-bangjik',query:'ประเมิน PA โรงเรียนบางจิกวันไหน'}]})}),{...baseEnv,GEMINI_API_KEY:'test-key'}),payload:any=await response.json();
    expect(payload.data.answer).toContain('15 กันยายน');expect(payload.data.answer).not.toContain('14 กันยายน');
    expect(payload.data.contextResolution.usedAI).toBe(true);expect(payload.data.contextResolution.resolvedQuery).toContain('วัดดอนขาด');expect(payload.data.context.query).toContain('วัดดอนขาด');
    expect(calls.some(x=>x.includes('/rest/v1/runtime_jobs'))).toBe(false);
  });

  it('returns a clarification immediately when AI confidence is low and does not search broad personal data',async()=>{
    const calls:string[]=[];
    vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);calls.push(decodeURIComponent(url));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});if(url.includes('generativelanguage.googleapis.com'))return geminiJson({resolvedQuery:'อันนั้นล่ะ',subject:'',intent:'unknown',answerField:'general',confidence:.35,dependsOnPriorContext:true});throw new Error('unexpected '+url);});
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'อันนั้นล่ะ',recentContext:[{role:'user',text:'มีงานสองเรื่อง'},{role:'ceo',text:'มีสองรายการครับ'}]})}),{...baseEnv,GEMINI_API_KEY:'test-key'}),payload:any=await response.json();
    expect(payload.data.mode).toBe('clarification');expect(payload.data.answer).toContain('หมายถึงเรื่องไหน');expect(payload.data.contextResolution.confidence).toBe(.35);
    expect(calls.some(x=>x.includes('/rest/v1/'))).toBe(false);
  });

  it('does not auto-save a short contextual fragment and grounds the resolved answer in Event data',async()=>{
    const event={id:'event-dao',title:'นิเทศการสอนครูดาว คาบที่ 3',description:'นิเทศการสอนครูดาว คาบที่ 3',event_type:'activity',start_at:'2026-09-02T02:00:00Z',end_at:null,timezone:'Asia/Bangkok',location:'',status:'planned',priority:'normal',metadata:{},tags:['นิเทศ']};
    const calls:string[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=String(input),method=String(init.method||'GET').toUpperCase();calls.push(method+' '+decodeURIComponent(url));if(url.endsWith('/auth/v1/user'))return json({id:'u1'});if(url.includes('generativelanguage.googleapis.com'))return geminiJson({resolvedQuery:'นิเทศการสอนครูดาววันไหน',subject:'นิเทศการสอนครูดาว',intent:'recall',answerField:'date',confidence:.95,dependsOnPriorContext:true});if(url.includes('/rest/v1/events?'))return json([event]);if(url.includes('/rest/v1/memories?')||url.includes('/rest/v1/decisions?')||url.includes('/rest/v1/conversation_summaries?')||url.includes('/rest/v1/knowledge_entries?')||url.includes('/rest/v1/tasks?')||url.includes('/rest/v1/memory_nodes?'))return json([]);throw new Error('unexpected '+method+' '+url);});
    const response=await handleApi(new Request('https://ceo.test/api/chat',{method:'POST',headers:auth,body:JSON.stringify({message:'พี่ดาวด้วย',recentContext:[{role:'user',text:'ครูแนนนิเทศวันไหน'},{role:'ceo',text:'วันที่ 10 กันยายนครับ'}]})}),{...baseEnv,GEMINI_API_KEY:'test-key'}),payload:any=await response.json();
    expect(payload.data.answer).toContain('2 กันยายน');expect(payload.data.contextResolution.usedAI).toBe(true);
    expect(calls.some(x=>x.includes('memory_replica_apply')||x.startsWith('POST https://project.supabase.co/rest/v1/memories'))).toBe(false);
  });
});
