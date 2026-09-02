import type { Env } from './supabase';

const clean=(value:unknown,max=12_000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export type CloudAiSource={title:string;url:string};
export type CloudAiResult={
  ok:boolean;
  answer:string;
  provider:'gemini'|'openai-compatible'|'none';
  model:string;
  reason:string;
  grounded:boolean;
  sources:CloudAiSource[];
};

export type CloudContextData={
  resolvedQuery:string;
  subject:string;
  intent:string;
  answerField:string;
  confidence:number;
  dependsOnPriorContext:boolean;
};
export type CloudContextResolution={ok:boolean;provider:'gemini'|'openai-compatible'|'none';model:string;reason:string;data:CloudContextData|null};

export function cloudAiConfig(env:Env){
  const geminiModel=clean(env.GEMINI_MODEL||'gemini-3.5-flash-lite',120)||'gemini-3.5-flash-lite';
  const legacyModel=clean(env.LLM_MODEL||'gpt-5-mini',120)||'gpt-5-mini';
  const geminiConfigured=Boolean(clean(env.GEMINI_API_KEY,20));
  const legacyConfigured=Boolean(clean(env.LLM_API_KEY,20));
  return {
    configured:geminiConfigured||legacyConfigured,
    primary:geminiConfigured?'gemini':legacyConfigured?'openai-compatible':'none',
    gemini:{configured:geminiConfigured,model:geminiModel,liveSearch:true},
    legacy:{configured:legacyConfigured,model:legacyModel,baseUrl:clean(env.LLM_BASE_URL||'https://api.openai.com/v1',500).replace(/\/$/,'')},
  } as const;
}

function secretarySystem(live:boolean,groundedOnly=false){
  return [
    'คุณคือ Ceo ผู้ช่วยเลขานุการ AI ภาษาไทยในระบบ Ceo Knowledge',
    'ตอบให้ตรงคำถาม กระชับ เป็นธรรมชาติ และใช้งานได้จริง',
    'เมื่อมี Ceo Knowledge context ให้ใช้ context เป็นแหล่งจริงสำหรับข้อมูลส่วนบุคคล นัดหมาย งาน ความจำ และการตัดสินใจ',
    'ห้ามแต่งข้อมูลส่วนบุคคล นัดหมาย งาน หรือความจำที่ไม่มีใน context',
    groundedOnly?'คำตอบนี้ต้องยึด Ceo Knowledge context เท่านั้น ห้ามใช้ความรู้ภายนอกหรืออนุมานข้อเท็จจริงเพิ่ม ถ้าหลักฐานไม่พอให้บอกว่าไม่พบข้อมูลที่ยืนยันได้ และตอบไม่เกิน 3 ประโยค':'',
    live?'คำถามนี้ต้องใช้ข้อมูลปัจจุบัน หากมี Google Search tool ให้ใช้เพื่อยืนยันข้อมูลล่าสุดและอย่าเดาข้อมูลที่เปลี่ยนแปลงตามเวลา':'ถ้า context ไม่เกี่ยวข้อง สามารถตอบจากความรู้ทั่วไปได้ แต่ห้ามอ้างว่าได้ค้นเว็บหรือทำงานบนเครื่อง',
  ].filter(Boolean).join(' ');
}

function userPrompt(prompt:string,context:unknown){
  const serialized=JSON.stringify(context??[]).slice(0,18_000);
  return `คำถามของผู้ใช้:\n${clean(prompt,5000)}\n\nCeo Knowledge context (ใช้เมื่อเกี่ยวข้องเท่านั้น):\n${serialized||'[]'}`;
}

function geminiText(data:any):string{
  const parts=Array.isArray(data?.candidates?.[0]?.content?.parts)?data.candidates[0].content.parts:[];
  return clean(parts.map((part:any)=>typeof part?.text==='string'?part.text:'').filter(Boolean).join('\n'),12_000);
}

function geminiSources(data:any):CloudAiSource[]{
  const chunks=Array.isArray(data?.candidates?.[0]?.groundingMetadata?.groundingChunks)?data.candidates[0].groundingMetadata.groundingChunks:[];
  const seen=new Set<string>(),out:CloudAiSource[]=[];
  for(const chunk of chunks){
    const url=clean(chunk?.web?.uri,1000),title=clean(chunk?.web?.title,300)||url;
    if(!url||seen.has(url))continue;
    seen.add(url);out.push({title,url});
    if(out.length>=8)break;
  }
  return out;
}

function parseJsonObject(text:string):any|null{
  const source=clean(text,8000).replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(source)}catch{}
  const start=source.indexOf('{'),end=source.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(source.slice(start,end+1))}catch{}}
  return null;
}

function normalizeContextData(value:any):CloudContextData|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const resolvedQuery=clean(value.resolvedQuery,1200);
  if(!resolvedQuery)return null;
  return{
    resolvedQuery,
    subject:clean(value.subject,300),
    intent:clean(value.intent,30).toLowerCase(),
    answerField:clean(value.answerField,30).toLowerCase(),
    confidence:Math.max(0,Math.min(1,Number(value.confidence)||0)),
    dependsOnPriorContext:value.dependsOnPriorContext===true,
  };
}

function contextResolverSystem(){
  return [
    'คุณเป็น Context Resolver ของ Ceo Knowledge ไม่ใช่ผู้ตอบคำถาม',
    'หน้าที่คือแปลงข้อความล่าสุดให้เป็นคำถามแบบ standalone โดยอาศัยเฉพาะข้อความล่าสุดและบทสนทนาที่ให้มา',
    'ห้ามตอบข้อเท็จจริง ห้ามสร้างวัน เวลา สถานที่ บุคคล งาน หรือนัดหมายใหม่',
    'ถ้าข้อความใหม่เพิ่มชื่อบุคคลหรือสถานที่ แต่ละเว้นหัวข้อ ให้คงหัวข้อจากบทสนทนาก่อนหน้าได้เมื่อมีหลักฐานชัด',
    'ถ้าไม่แน่ใจให้ confidence ต่ำกว่า 0.60 และอย่าเดา',
    'คืน JSON object เท่านั้น มี keys resolvedQuery, subject, intent, answerField, confidence, dependsOnPriorContext',
    'intent ใช้ recall,date,temporal,today,tasks,live,general,unknown เท่านั้น',
    'answerField ใช้ general,date,time,location,person,status เท่านั้น',
    'resolvedQuery ต้องเป็นคำถาม/คำขอค้นข้อมูล ไม่ใช่คำตอบ',
  ].join(' ');
}

function contextResolverPrompt(input:{message:string;recentTurns:Array<{role:string;text:string;resolvedQuery?:string;sourceId?:string}>}){
  return `ข้อความล่าสุด:\n${clean(input.message,1200)}\n\nบทสนทนาล่าสุด (เก่าไปใหม่):\n${JSON.stringify(input.recentTurns||[]).slice(0,12_000)}`;
}

async function resolveGeminiContext(env:Env,input:{message:string;recentTurns:Array<{role:string;text:string;resolvedQuery?:string;sourceId?:string}>},requestedModel=''):Promise<CloudContextResolution>{
  const config=cloudAiConfig(env),key=clean(env.GEMINI_API_KEY,500),model=clean(requestedModel,120)||config.gemini.model;
  if(!key)return{ok:false,provider:'gemini',model,reason:'GEMINI_NOT_CONFIGURED',data:null};
  try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({system_instruction:{parts:[{text:contextResolverSystem()}]},contents:[{role:'user',parts:[{text:contextResolverPrompt(input)}]}],generationConfig:{temperature:0,maxOutputTokens:500,responseMimeType:'application/json'}}),
    });
    const body:any=await res.json().catch(()=>null);
    if(!res.ok)return{ok:false,provider:'gemini',model,reason:`GEMINI_HTTP_${res.status}:${clean(body?.error?.message,180)}`,data:null};
    const data=normalizeContextData(parseJsonObject(geminiText(body)));
    return data?{ok:true,provider:'gemini',model,reason:'READY',data}:{ok:false,provider:'gemini',model,reason:'CONTEXT_JSON_INVALID',data:null};
  }catch(error:any){return{ok:false,provider:'gemini',model,reason:`GEMINI_REQUEST_FAILED:${clean(error?.message||error,180)}`,data:null};}
}

async function resolveOpenAiContext(env:Env,input:{message:string;recentTurns:Array<{role:string;text:string;resolvedQuery?:string;sourceId?:string}>},requestedModel=''):Promise<CloudContextResolution>{
  const config=cloudAiConfig(env),key=clean(env.LLM_API_KEY,500),model=clean(requestedModel,120)||config.legacy.model;
  if(!key)return{ok:false,provider:'openai-compatible',model,reason:'LLM_NOT_CONFIGURED',data:null};
  try{
    const res=await fetch(`${config.legacy.baseUrl}/chat/completions`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:0,messages:[{role:'system',content:contextResolverSystem()},{role:'user',content:contextResolverPrompt(input)}]})});
    const body:any=await res.json().catch(()=>null);
    if(!res.ok)return{ok:false,provider:'openai-compatible',model,reason:`LLM_HTTP_${res.status}:${clean(body?.error?.message,180)}`,data:null};
    const data=normalizeContextData(parseJsonObject(clean(body?.choices?.[0]?.message?.content,8000)));
    return data?{ok:true,provider:'openai-compatible',model,reason:'READY',data}:{ok:false,provider:'openai-compatible',model,reason:'CONTEXT_JSON_INVALID',data:null};
  }catch(error:any){return{ok:false,provider:'openai-compatible',model,reason:`LLM_REQUEST_FAILED:${clean(error?.message||error,180)}`,data:null};}
}

export async function resolveCloudContext(env:Env,input:{message:string;recentTurns:Array<{role:string;text:string;resolvedQuery?:string;sourceId?:string}>},options:{provider?:string;model?:string}={}):Promise<CloudContextResolution>{
  const config=cloudAiConfig(env),forced=clean(options.provider,30).toLowerCase();
  if(forced==='gemini')return resolveGeminiContext(env,input,options.model);
  if(forced==='openai')return resolveOpenAiContext(env,input,options.model);
  if(config.gemini.configured){const result=await resolveGeminiContext(env,input,forced==='gemini'?options.model:'');if(result.ok||!config.legacy.configured)return result;}
  if(config.legacy.configured)return resolveOpenAiContext(env,input,forced==='openai'?options.model:'');
  return{ok:false,provider:'none',model:'',reason:'CLOUD_AI_NOT_CONFIGURED',data:null};
}

export async function askGemini(env:Env,prompt:string,context:unknown,{live=false,model:requestedModel='',groundedOnly=false}:{live?:boolean;model?:string;groundedOnly?:boolean}={}):Promise<CloudAiResult>{
  const config=cloudAiConfig(env),model=clean(requestedModel,120)||config.gemini.model,key=clean(env.GEMINI_API_KEY,500);
  if(!key)return{ok:false,answer:'',provider:'gemini',model,reason:'GEMINI_NOT_CONFIGURED',grounded:false,sources:[]};
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',
      headers:{'content-type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({
        system_instruction:{parts:[{text:secretarySystem(live,groundedOnly)}]},
        contents:[{role:'user',parts:[{text:userPrompt(prompt,context)}]}],
        generationConfig:{temperature:groundedOnly?0.1:0.25,maxOutputTokens:groundedOnly?700:2200},
        ...(live?{tools:[{google_search:{}}]}:{}),
      }),
    });
    const data:any=await response.json().catch(()=>null);
    if(!response.ok)return{ok:false,answer:'',provider:'gemini',model,reason:`GEMINI_HTTP_${response.status}:${clean(data?.error?.message,240)}`,grounded:false,sources:[]};
    const answer=geminiText(data),sources=geminiSources(data);
    if(!answer)return{ok:false,answer:'',provider:'gemini',model,reason:'GEMINI_EMPTY_RESPONSE',grounded:sources.length>0,sources};
    return{ok:true,answer,provider:'gemini',model,reason:'READY',grounded:sources.length>0,sources};
  }catch(error:any){
    return{ok:false,answer:'',provider:'gemini',model,reason:`GEMINI_REQUEST_FAILED:${clean(error?.message||error,240)}`,grounded:false,sources:[]};
  }
}

async function askOpenAiCompatible(env:Env,prompt:string,context:unknown,requestedModel='',groundedOnly=false):Promise<CloudAiResult>{
  const config=cloudAiConfig(env),model=clean(requestedModel,120)||config.legacy.model,key=clean(env.LLM_API_KEY,500),base=config.legacy.baseUrl;
  if(!key)return{ok:false,answer:'',provider:'openai-compatible',model,reason:'LLM_NOT_CONFIGURED',grounded:false,sources:[]};
  try{
    const response=await fetch(`${base}/chat/completions`,{
      method:'POST',
      headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'system',content:secretarySystem(false,groundedOnly)},{role:'user',content:userPrompt(prompt,context)}]}),
    });
    const data:any=await response.json().catch(()=>null);
    if(!response.ok)return{ok:false,answer:'',provider:'openai-compatible',model,reason:`LLM_HTTP_${response.status}:${clean(data?.error?.message,240)}`,grounded:false,sources:[]};
    const answer=clean(data?.choices?.[0]?.message?.content,12_000);
    if(!answer)return{ok:false,answer:'',provider:'openai-compatible',model,reason:'LLM_EMPTY_RESPONSE',grounded:false,sources:[]};
    return{ok:true,answer,provider:'openai-compatible',model,reason:'READY',grounded:false,sources:[]};
  }catch(error:any){
    return{ok:false,answer:'',provider:'openai-compatible',model,reason:`LLM_REQUEST_FAILED:${clean(error?.message||error,240)}`,grounded:false,sources:[]};
  }
}

export async function askCloudAi(env:Env,prompt:string,context:unknown,options:{live?:boolean;provider?:string;model?:string;groundedOnly?:boolean}={}):Promise<CloudAiResult>{
  const config=cloudAiConfig(env),forced=clean(options.provider,40).toLowerCase(),model=clean(options.model,120);
  if(forced==='gemini')return askGemini(env,prompt,context,{live:options.live,model,groundedOnly:options.groundedOnly});
  if(forced==='openai')return askOpenAiCompatible(env,prompt,context,model,options.groundedOnly);
  if(forced==='claude'||forced==='ollama')return{ok:false,answer:'',provider:'none',model,reason:'CLOUD_PROVIDER_REQUIRES_RUNTIME',grounded:false,sources:[]};
  if(config.gemini.configured){
    const gemini=await askGemini(env,prompt,context,{live:options.live,model,groundedOnly:options.groundedOnly});
    if(gemini.ok)return gemini;
    if(!config.legacy.configured)return gemini;
  }
  if(config.legacy.configured)return askOpenAiCompatible(env,prompt,context,model,options.groundedOnly);
  return{ok:false,answer:'',provider:'none',model:'',reason:'CLOUD_AI_NOT_CONFIGURED',grounded:false,sources:[]};
}
