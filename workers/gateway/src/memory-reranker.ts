import { askCloudAi } from './cloud-ai';
import { recallAction, recallActionMatches, type RecallAction } from './chat';
import type { Env } from './supabase';

const clean=(v:unknown,max=4000)=>String(v??'').replace(/\u0000/g,'').trim().slice(0,max);
export interface MemoryRerankResult{rows:any[];action:RecallAction;mode:'none'|'action-filter'|'ai-judge'|'score';selectedId:string;aiUsed:boolean;reason:string}
function idOf(row:any){return clean(row?.id||row?.node_id,200)}
function candidateView(row:any){return{id:idOf(row),kind:clean(row?.kind,40),title:clean(row?.title,240),content:clean(row?.content||row?.summary||row?.description||row?.rationale,900),start_at:clean(row?.start_at,100),due_at:clean(row?.due_at,100),location:clean(row?.location,240),status:clean(row?.status,80)}}
export function deterministicMemoryRerank(query:string,rows:any[]):MemoryRerankResult{
  const source=Array.isArray(rows)?rows:[],action=recallAction(query);
  if(!source.length)return{rows:[],action,mode:'none',selectedId:'',aiUsed:false,reason:'NO_CANDIDATES'};
  if(action!=='none'){
    const matched=source.filter(row=>recallActionMatches(action,row));
    if(matched.length)return{rows:matched,action,mode:'action-filter',selectedId:matched.length===1?idOf(matched[0]):'',aiUsed:false,reason:`ACTION_${action.toUpperCase()}`};
  }
  return{rows:source,action,mode:'score',selectedId:'',aiUsed:false,reason:'SCORE_ORDER'};
}
export async function rerankMemoryCandidates(env:Env,query:string,rows:any[],options:{provider?:string;model?:string}={}):Promise<MemoryRerankResult>{
  const deterministic=deterministicMemoryRerank(query,rows);
  if(deterministic.rows.length<=1)return deterministic;
  const candidates=deterministic.rows.slice(0,6).map(candidateView).filter(x=>x.id);
  if(candidates.length<=1)return deterministic;
  const prompt=`คุณเป็น Semantic Memory Judge ของ Ceo Knowledge\nคำถามผู้ใช้: ${clean(query,800)}\nเลือก candidate ที่ตรง "ความหมายและการกระทำ" ของคำถามที่สุดเท่านั้น\nห้ามสร้างข้อมูลใหม่ ห้ามแก้วันที่ ห้ามใช้ความรู้ภายนอก\nถ้ามั่นใจ ให้ตอบเพียง SELECT:<id>\nถ้าแยกไม่ได้ ให้ตอบเพียง AMBIGUOUS\nCandidates:\n${candidates.map((c,i)=>`${i+1}. ${JSON.stringify(c)}`).join('\n')}`;
  const judged=await askCloudAi(env,prompt,candidates,{provider:options.provider,model:options.model,groundedOnly:true}).catch(()=>null);
  if(!judged?.ok)return deterministic;
  const text=clean(judged.answer,500),match=text.match(/SELECT\s*:\s*([A-Za-z0-9_-]{3,200})/i),selected=match?.[1]||'';
  if(!selected)return deterministic;
  const row=deterministic.rows.find(item=>idOf(item)===selected);
  if(!row)return deterministic;
  return{rows:[row,...deterministic.rows.filter(item=>idOf(item)!==selected)],action:deterministic.action,mode:'ai-judge',selectedId:selected,aiUsed:true,reason:'AI_SELECTED_EXISTING_CANDIDATE'};
}
