import { askCloudAi } from './cloud-ai';
import { recallAction, recallActionMatches, type RecallAction } from './chat';
import { memoryQualityGate, type CandidateScore, type QualityGate } from './candidate-scorer';
import { hybridRankCandidates } from './hybrid-retrieval';
import { recordRetrieval } from './retrieval-telemetry';
import type { Env } from './supabase';

const clean=(v:unknown,max=4000)=>String(v??'').replace(/\u0000/g,'').trim().slice(0,max);
export interface MemoryRerankResult{rows:any[];action:RecallAction;mode:'none'|'action-filter'|'quality-gate'|'ai-judge'|'score'|'reject';selectedId:string;aiUsed:boolean;reason:string;quality:QualityGate;scores:CandidateScore[]}
function idOf(row:any){return clean(row?.id||row?.node_id,200)}
function candidateView(scored:CandidateScore){const row=scored.row;return{id:idOf(row),kind:clean(row?.kind,40),title:clean(row?.title,240),content:clean(row?.content||row?.summary||row?.description||row?.rationale,900),start_at:clean(row?.start_at,100),due_at:clean(row?.due_at,100),location:clean(row?.location,240),status:clean(row?.status,80),score:scored.score,scoreBreakdown:scored.breakdown}}
const emptyQuality:QualityGate={decision:'reject',topScore:0,margin:0,reason:'NO_CANDIDATE'};
export function deterministicMemoryRerank(query:string,rows:any[],activeSourceId=''):MemoryRerankResult{
  const source=Array.isArray(rows)?rows:[],action=recallAction(query);
  if(!source.length)return{rows:[],action,mode:'none',selectedId:'',aiUsed:false,reason:'NO_CANDIDATES',quality:emptyQuality,scores:[]};
  let filtered=source;
  if(action!=='none'){
    const matched=source.filter(row=>recallActionMatches(action,row));
    if(matched.length)filtered=matched;
  }
  const hybrid=hybridRankCandidates(query,filtered,activeSourceId),scores=hybrid as CandidateScore[],quality=memoryQualityGate(scores),ordered=hybrid.map(x=>x.row);
  const selectedId=quality.decision==='accept'?scores[0]?.id||'':'';
  const mode=quality.decision==='accept'?'quality-gate':quality.decision==='reject'?'reject':action!=='none'?'action-filter':'score';
  return{rows:ordered,action,mode,selectedId,aiUsed:false,reason:quality.reason,quality,scores};
}
export async function rerankMemoryCandidates(env:Env,query:string,rows:any[],options:{provider?:string;model?:string;activeSourceId?:string}={}):Promise<MemoryRerankResult>{
  const deterministic=deterministicMemoryRerank(query,rows,options.activeSourceId||'');
  if(deterministic.rows.length<=1||deterministic.quality.decision==='accept'||deterministic.quality.decision==='reject'){
    recordRetrieval({query,gate:deterministic.quality.decision,reason:deterministic.reason,topScore:deterministic.quality.topScore,margin:deterministic.quality.margin,selectedId:deterministic.selectedId,aiUsed:false});return deterministic;
  }
  const candidates=deterministic.scores.slice(0,6).map(candidateView).filter(x=>x.id);
  if(candidates.length<=1)return deterministic;
  const prompt=`คุณเป็น Semantic Memory Judge ของ Ceo Knowledge\nคำถามผู้ใช้: ${clean(query,800)}\nเลือก candidate ที่ตรงความหมาย, การกระทำ, entity และบริบทที่สุดจากรายการที่ให้เท่านั้น\nห้ามสร้างข้อมูลใหม่ ห้ามแก้วัน เวลา สถานที่ หรือบุคคล ห้ามใช้ความรู้ภายนอก\nตอบได้เพียง SELECT:<id> หรือ AMBIGUOUS\nCandidates:\n${candidates.map((c,i)=>`${i+1}. ${JSON.stringify(c)}`).join('\n')}`;
  const judged=await askCloudAi(env,prompt,candidates,{provider:options.provider,model:options.model,groundedOnly:true}).catch(()=>null);
  if(!judged?.ok){recordRetrieval({query,gate:'judge',reason:'AI_UNAVAILABLE',topScore:deterministic.quality.topScore,margin:deterministic.quality.margin,aiUsed:false});return deterministic;}
  const text=clean(judged.answer,500),match=text.match(/SELECT\s*:\s*([A-Za-z0-9_-]{3,200})/i),selected=match?.[1]||'';
  if(!selected){recordRetrieval({query,gate:'judge',reason:'AI_AMBIGUOUS',topScore:deterministic.quality.topScore,margin:deterministic.quality.margin,aiUsed:true});return deterministic;}
  const score=deterministic.scores.find(item=>item.id===selected);if(!score){recordRetrieval({query,gate:'judge',reason:'AI_INVALID_ID',selected,aiUsed:true});return deterministic;}
  const result={...deterministic,rows:[score.row,...deterministic.rows.filter(item=>idOf(item)!==selected)],mode:'ai-judge' as const,selectedId:selected,aiUsed:true,reason:'AI_SELECTED_EXISTING_CANDIDATE'};
  recordRetrieval({query,gate:'judge',reason:result.reason,selectedId:selected,topScore:score.score,margin:deterministic.quality.margin,aiUsed:true});return result;
}
