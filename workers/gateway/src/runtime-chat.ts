import type { DeviceRecord } from '@ceo-knowledge/shared';
import { rest, type Env } from './supabase';
import { insertRuntimeJob } from './runtime-jobs';

const clean=(value:unknown,max=6000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export function deviceSupportsOllama(device:any, now=Date.now()):boolean {
  if(!device||device.trusted!==true||device.status==='disabled')return false;
  const last=Date.parse(String(device.last_seen_at||''));
  if(!last||now-last>60_000)return false;
  const tools=Array.isArray(device?.capabilities?.remoteTools)?device.capabilities.remoteTools:[];
  return tools.includes('ollama.chat');
}

export function selectOllamaDevice(devices:any[], now=Date.now()):any|null {
  return (Array.isArray(devices)?devices:[])
    .filter(device=>deviceSupportsOllama(device,now))
    .sort((a,b)=>Date.parse(String(b.last_seen_at||''))-Date.parse(String(a.last_seen_at||'')))[0]||null;
}

export function buildOllamaChatPrompt(message:string, searchResults:any[]):string {
  const context=(Array.isArray(searchResults)?searchResults:[]).slice(0,8).map((row:any,index:number)=>({
    n:index+1,kind:clean(row?.kind,80),title:clean(row?.title,240),content:clean(row?.content||row?.summary||row?.rationale,1200),score:Number(row?._score||0),
  }));
  return [
    '/no_think',
    'คำถามของผู้ใช้:',clean(message,4000),
    '',
    'บริบทจาก Ceo Knowledge (ใช้เมื่อเกี่ยวข้องเท่านั้น):',
    context.length?JSON.stringify(context):'(ไม่มีบริบทที่เกี่ยวข้อง)',
    '',
    'ตอบเป็นภาษาไทยให้กระชับและเป็นธรรมชาติ ถ้าบริบทไม่เกี่ยวข้องสามารถตอบจากความรู้ทั่วไปได้ แต่ห้ามแต่งข้อมูลส่วนบุคคล นัดหมาย งาน หรือความจำของผู้ใช้ที่ไม่มีในบริบท',
  ].join('\n');
}

export function ollamaSystemPrompt():string {
  return 'คุณคือ Ceo ซึ่งเป็นชื่อของผู้ช่วย AI ภาษาไทยในระบบ Ceo ไม่ใช่ตำแหน่ง Chief Executive Officer ตอบให้ตรงคำถาม กระชับ และใช้งานได้จริง ใช้ Ceo Knowledge context เมื่อมีข้อมูลที่เกี่ยวข้อง ห้ามแต่งข้อมูลส่วนบุคคล นัดหมาย งาน หรือการตัดสินใจของผู้ใช้ที่ไม่มีใน context และห้ามอ้างว่าคุณได้ทำงานบนเครื่องหากไม่มีผลจากเครื่องมือรองรับ';
}

export async function enqueueOllamaChat(env:Env, token:string, message:string, searchResults:any[], { idempotencyKey='', model='' }:{idempotencyKey?:string;model?:string}={}) {
  const devices=await rest<any[]>(env,token,'devices?select=id,device_name,runtime_id,status,trusted,last_seen_at,capabilities&trusted=eq.true&limit=30').catch(()=>[]);
  const device=selectOllamaDevice(devices);
  if(!device)return null;
  const chosenModel=clean(model||env.OLLAMA_CHAT_MODEL||'qwen3:4b',120)||'qwen3:4b';
  const key=clean(idempotencyKey,200)||('chat-'+crypto.randomUUID());
  const payload={
    device_id:device.id,
    tool:'ollama.chat',
    arguments:{prompt:buildOllamaChatPrompt(message,searchResults),task:'general',model:chosenModel,system:ollamaSystemPrompt(),keepAlive:'10m'},
    status:'pending',approval_state:'not_required',origin:'worker',idempotency_key:key,expires_at:new Date(Date.now()+10*60_000).toISOString(),
  };
  const job=await insertRuntimeJob(env,token,payload);
  if(!job)return null;
  return {job,device:{id:device.id,name:clean(device.device_name,200),runtimeId:clean(device.runtime_id,200)},model:chosenModel};
}

export function ollamaJobAnswer(job:any):{ok:boolean;answer:string;provider:string;model:string;reason:string} {
  if(!job||job.status!=='completed')return {ok:false,answer:'',provider:'ollama',model:'',reason:clean(job?.status||'NOT_COMPLETED',100)};
  const result=job.result&&typeof job.result==='object'?job.result:{};
  const answer=clean(result?.response,12000);
  if(result?.available===false||!answer)return {ok:false,answer:'',provider:'ollama',model:clean(result?.model,120),reason:clean(result?.reason||'OLLAMA_EMPTY_RESPONSE',300)};
  return {ok:true,answer,provider:'ollama',model:clean(result?.model,120),reason:'READY'};
}
