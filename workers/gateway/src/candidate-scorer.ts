import { recallAction, recallActionMatches, recallMatchTokens, type RecallAction } from './chat';

const clean=(v:unknown,max=5000)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export interface CandidateScoreBreakdown{entity:number;action:number;eventType:number;temporal:number;context:number;lexical:number;authority:number;total:number}
export interface CandidateScore{row:any;id:string;score:number;breakdown:CandidateScoreBreakdown}
export interface QualityGate{decision:'accept'|'judge'|'reject';topScore:number;margin:number;reason:string}
function idOf(row:any){return clean(row?.id||row?.node_id,200)}
function rowText(row:any){return clean([row?.title,row?.description,row?.content,row?.summary,row?.location,row?.waiting_for].filter(Boolean).join(' '),6000).toLocaleLowerCase()}
function authority(row:any):number{
  const meta=row?.metadata&&typeof row.metadata==='object'?row.metadata:{},isAuto=meta.autoMemory===true||(Array.isArray(row?.tags)&&row.tags.includes('auto-memory'));
  if(row?._sourceLocked)return 1;
  if(row?.kind==='events')return isAuto?(meta.pinned===true ? .72 : .4):1;
  if(row?.kind==='tasks')return isAuto?(meta.pinned===true ? .7 : .45):.9;
  if(row?.kind==='memory_nodes')return row?.source_kind==='user' ? .85 : (isAuto ? .45 : .65);
  if(row?.kind==='memories')return Array.isArray(row?.tags)&&row.tags.includes('pinned') ? .85 : .7;
  if(row?.kind==='conversation_summaries')return .25;
  return .55;
}
function temporalScore(query:string,row:any):number{
  const q=query.match(/(?:วันที่\s*)?(\d{1,2})\s*(?:ก\.?ย\.?|กันยายน)?/i);if(!q)return .5;const target=Number(q[1]);const raw=row?.start_at||row?.due_at||'';if(!raw)return 0;const d=new Date(String(raw));if(Number.isNaN(d.getTime()))return 0;const local=new Date(d.getTime()+7*3600000);return local.getUTCDate()===target?1:0;
}
function entityScore(query:string,row:any):number{const tokens=recallMatchTokens(query).filter(t=>!['ประเมิน','ส่ง','เลี้ยง','เกษียณ','ประชุม','อบรม','นิเทศ','สอบ','ทดสอบ'].includes(t));if(!tokens.length)return .5;const hay=rowText(row);const hits=tokens.filter(t=>hay.includes(t)).length;return hits/tokens.length}
function lexicalScore(query:string,row:any):number{const tokens=recallMatchTokens(query);if(!tokens.length)return .5;const hay=rowText(row);return tokens.filter(t=>hay.includes(t)).length/tokens.length}
export function scoreMemoryCandidates(query:string,rows:any[],activeSourceId=''):CandidateScore[]{
  const action:RecallAction=recallAction(query);
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const entity=entityScore(query,row),actionScore=action==='none'?.5:(recallActionMatches(action,row)?1:0),eventType=actionScore,temporal=temporalScore(query,row),context=activeSourceId&&idOf(row)===activeSourceId?1:.4,lexical=lexicalScore(query,row),sourceAuthority=authority(row);
    const total=.25*entity+.20*actionScore+.15*eventType+.15*temporal+.10*context+.08*lexical+.07*sourceAuthority;
    const breakdown={entity,action:actionScore,eventType,temporal,context,lexical,authority:sourceAuthority,total:Math.round(total*1000)/1000};
    return{row,id:idOf(row),score:breakdown.total,breakdown};
  }).sort((a,b)=>b.score-a.score);
}
export function memoryQualityGate(scored:CandidateScore[]):QualityGate{
  if(!scored.length)return{decision:'reject',topScore:0,margin:0,reason:'NO_CANDIDATE'};const top=scored[0]!.score,second=scored[1]?.score||0,margin=Math.round((top-second)*1000)/1000;
  if(scored.length===1&&top>=.55)return{decision:'accept',topScore:top,margin,reason:'SINGLE_STRUCTURED_CANDIDATE'};
  const authoritativeEventSet=scored.length>1&&scored.every(item=>item.row?.kind==='events'&&item.breakdown.authority>=.9)&&top>=.54;
  if(authoritativeEventSet)return{decision:'judge',topScore:top,margin,reason:'MULTI_AUTHORITATIVE_EVENTS'};
  if(top>=.82&&margin>=.18)return{decision:'accept',topScore:top,margin,reason:'HIGH_CONFIDENCE_MARGIN'};
  if(top>=.58)return{decision:'judge',topScore:top,margin,reason:'AMBIGUOUS_CANDIDATES'};
  return{decision:'reject',topScore:top,margin,reason:'LOW_CONFIDENCE'};
}
