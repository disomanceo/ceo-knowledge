import { askCloudAi } from './cloud-ai';
import type { Env } from './supabase';
import type { EvidencePack } from './evidence-pack';
import { groundedAnswerCheck } from './grounding-guard';

const clean=(v:unknown,max=4000)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export interface SemanticAnswerResult{ok:boolean;answer:string;provider:string;model:string;reason:string;estimatedInputTokens:number}
export async function composeSemanticAnswer(env:Env,question:string,standaloneQuery:string,pack:EvidencePack,options:{provider?:string;model?:string}={}):Promise<SemanticAnswerResult>{
  if(!pack.items.length)return{ok:false,answer:'',provider:'knowledge',model:'',reason:'NO_EVIDENCE',estimatedInputTokens:pack.estimatedTokens};
  const prompt=[
    `คำถามผู้ใช้: ${clean(question,900)}`,
    `ความหมายแบบ standalone: ${clean(standaloneQuery,1000)}`,
    'ตอบจาก Evidence เท่านั้น ห้ามสร้างข้อเท็จจริงใหม่',
    'ตอบเฉพาะสิ่งที่ถาม เป็นภาษาไทยธรรมชาติ สั้น กระชับ ปกติ 1 ประโยค; ถ้ามีหลายรายการค่อยใช้รายการสั้น ๆ',
    'ห้ามทวนคำอธิบายระบบ ห้ามกล่าวถึง candidate/evidence/database',
    'ถ้าหลักฐานไม่พอให้ตอบว่า "ยังไม่พบข้อมูลที่ยืนยันได้ครับ"',
  ].join('\n');
  const result=await askCloudAi(env,prompt,pack.items,{provider:options.provider,model:options.model,groundedOnly:true}).catch(()=>null);
  if(!result?.ok)return{ok:false,answer:'',provider:result?.provider||'knowledge',model:result?.model||'',reason:result?.reason||'AI_COMPOSER_FAILED',estimatedInputTokens:pack.estimatedTokens};
  const answer=clean(result.answer,1800),grounding=groundedAnswerCheck(answer,question,pack.items);
  if(!grounding.ok)return{ok:false,answer:'',provider:result.provider,model:result.model,reason:`GROUNDING_REJECTED:${grounding.unsupported.join(',')}`,estimatedInputTokens:pack.estimatedTokens};
  return{ok:true,answer,provider:result.provider,model:result.model,reason:'READY',estimatedInputTokens:pack.estimatedTokens};
}
