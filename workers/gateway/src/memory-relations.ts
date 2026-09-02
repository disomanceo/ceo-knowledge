import { rest, type Env } from './supabase';

const clean=(v:unknown,max=5000)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export type MemoryRelation='APPEND'|'UPDATE'|'CORRECT'|'NONE';
export function detectMemoryRelation(message:string):MemoryRelation{
  const text=clean(message,1200);if(!text||/[?？]$/.test(text))return'NONE';
  if(/^(?:ไม่ใช่|ขอแก้|แก้เป็น|เปลี่ยน(?:เป็น)?)/i.test(text))return'CORRECT';
  if(/(?:เปลี่ยนเป็น|เปลี่ยนร้าน|เปลี่ยนสถานที่|ย้ายไป|แก้เป็น)/i.test(text))return'UPDATE';
  if(/(?:ไปด้วย|เพิ่ม|อีก\s*\d+|นักเรียน\s*\d+|เด็ก\s*\d+|ครู\S*\s*ไป|คน)/u.test(text))return'APPEND';
  return'NONE';
}
function extractLocation(text:string):string{const m=clean(text,2000).match(/(?:เปลี่ยน(?:ร้าน|สถานที่)?(?:เป็น)?|ย้ายไป|ที่|ณ)\s*((?:ร้านอาหาร|โรงเรียน|โรงแรม|หอประชุม|สำนักงาน|วัด|สนาม|ศูนย์)[^,;\n]{2,220})/i);return clean(m?.[1],300)}
function mergeDescription(oldText:string,newText:string){const old=clean(oldText,5000),next=clean(newText,2000);if(!next)return old;if(old.toLocaleLowerCase().includes(next.toLocaleLowerCase()))return old;return [old,next].filter(Boolean).join(' · ').slice(0,6000)}
export async function applyActiveEventRelation(env:Env,token:string,sourceId:string,message:string){
  const relation=detectMemoryRelation(message);if(relation==='NONE'||!sourceId)return{applied:false,relation:'NONE' as MemoryRelation,record:null,reason:'NO_ACTIVE_RELATION'};
  const rows=await rest<any[]>(env,token,`events?select=*&id=eq.${encodeURIComponent(sourceId)}&limit=1`).catch(()=>[]),event=rows[0];if(!event)return{applied:false,relation,record:null,reason:'ACTIVE_EVENT_NOT_FOUND'};
  const location=extractLocation(message),body:any={description:mergeDescription(event.description,message),metadata:{...(event.metadata||{}),relationUpdatedAt:new Date().toISOString(),relationUpdate:relation}};
  if(location)body.location=location;
  const patched=await rest<any[]>(env,token,`events?select=*&id=eq.${encodeURIComponent(sourceId)}`,{method:'PATCH',body,prefer:'return=representation'}).catch(()=>[]);
  const record=patched[0]||null;return{applied:Boolean(record),relation,record,reason:record?'ACTIVE_EVENT_UPDATED':'UPDATE_FAILED'};
}
