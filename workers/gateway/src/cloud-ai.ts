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

export function cloudAiConfig(env:Env){
  const geminiModel=clean(env.GEMINI_MODEL||'gemini-2.5-flash-lite',120)||'gemini-2.5-flash-lite';
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

function secretarySystem(live:boolean){
  return [
    'คุณคือ Ceo ผู้ช่วยเลขานุการ AI ภาษาไทยในระบบ Ceo Knowledge',
    'ตอบให้ตรงคำถาม กระชับ เป็นธรรมชาติ และใช้งานได้จริง',
    'เมื่อมี Ceo Knowledge context ให้ใช้ context เป็นแหล่งจริงสำหรับข้อมูลส่วนบุคคล นัดหมาย งาน ความจำ และการตัดสินใจ',
    'ห้ามแต่งข้อมูลส่วนบุคคล นัดหมาย งาน หรือความจำที่ไม่มีใน context',
    live?'คำถามนี้ต้องใช้ข้อมูลปัจจุบัน หากมี Google Search tool ให้ใช้เพื่อยืนยันข้อมูลล่าสุดและอย่าเดาข้อมูลที่เปลี่ยนแปลงตามเวลา':'ถ้า context ไม่เกี่ยวข้อง สามารถตอบจากความรู้ทั่วไปได้ แต่ห้ามอ้างว่าได้ค้นเว็บหรือทำงานบนเครื่อง',
  ].join(' ');
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

export async function askGemini(env:Env,prompt:string,context:unknown,{live=false}:{live?:boolean}={}):Promise<CloudAiResult>{
  const config=cloudAiConfig(env),model=config.gemini.model,key=clean(env.GEMINI_API_KEY,500);
  if(!key)return{ok:false,answer:'',provider:'gemini',model,reason:'GEMINI_NOT_CONFIGURED',grounded:false,sources:[]};
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',
      headers:{'content-type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({
        system_instruction:{parts:[{text:secretarySystem(live)}]},
        contents:[{role:'user',parts:[{text:userPrompt(prompt,context)}]}],
        generationConfig:{temperature:0.25,maxOutputTokens:2200},
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

async function askOpenAiCompatible(env:Env,prompt:string,context:unknown):Promise<CloudAiResult>{
  const config=cloudAiConfig(env),model=config.legacy.model,key=clean(env.LLM_API_KEY,500),base=config.legacy.baseUrl;
  if(!key)return{ok:false,answer:'',provider:'openai-compatible',model,reason:'LLM_NOT_CONFIGURED',grounded:false,sources:[]};
  try{
    const response=await fetch(`${base}/chat/completions`,{
      method:'POST',
      headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({model,messages:[{role:'system',content:secretarySystem(false)},{role:'user',content:userPrompt(prompt,context)}]}),
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

export async function askCloudAi(env:Env,prompt:string,context:unknown,options:{live?:boolean}={}):Promise<CloudAiResult>{
  const config=cloudAiConfig(env);
  if(config.gemini.configured){
    const gemini=await askGemini(env,prompt,context,options);
    if(gemini.ok)return gemini;
    if(!config.legacy.configured)return gemini;
  }
  if(config.legacy.configured)return askOpenAiCompatible(env,prompt,context);
  return{ok:false,answer:'',provider:'none',model:'',reason:'CLOUD_AI_NOT_CONFIGURED',grounded:false,sources:[]};
}
