import { memorySimilarity } from './memory-gardener';
import { recallMatchTokens } from './chat';
import { scoreMemoryCandidates, type CandidateScore } from './candidate-scorer';

const clean=(v:unknown,max=6000)=>String(v??'').normalize('NFC').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
function idOf(row:any){return clean(row?.id||row?.node_id,200)}
function rowText(row:any){return clean([row?.title,row?.description,row?.content,row?.summary,row?.location,row?.waiting_for].filter(Boolean).join(' '),6000)}
function normalizeThai(value:string){return clean(value,6000).toLocaleLowerCase()
  .replace(/ดูหนัง/g,'ดูภาพยนตร์').replace(/หนัง/g,'ภาพยนตร์').replace(/บิ๊ก\s*ซี/g,'bigc').replace(/big\s*c/g,'bigc')
  .replace(/รร\.?/g,'โรงเรียน ').replace(/ผอ\.?/g,'ผู้อำนวยการ ')
  .replace(/(คาบ(?:ที่)?|ชั่วโมง(?:ที่)?|ภาพยนตร์|bigc|ประเมิน|ส่ง|เลี้ยง|เกษียณ|รับทุน|นิเทศ|ประชุม|โรงเรียน|ครู|นักเรียน)/gu,' $1 ')
  .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
function grams(s:string){const out=new Map<string,number>();for(let i=0;i<Math.max(1,s.length-1);i++){const g=s.length<2?s:s.slice(i,i+2);out.set(g,(out.get(g)||0)+1)}return out}
function dice(a:string,b:string){if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return Math.min(1,.78+Math.min(a.length,b.length)/Math.max(a.length,b.length)*.22);const x=grams(a),y=grams(b);let hit=0,tx=0,ty=0;for(const n of x.values())tx+=n;for(const n of y.values())ty+=n;for(const [g,n] of x)hit+=Math.min(n,y.get(g)||0);return tx+ty?(2*hit)/(tx+ty):0}
const GENERIC=new Set(['งาน','กิจกรรม','วันที่','วันไหน','วันอะไร','เมื่อไหร่','เมื่อไร','อะไร','ที่ไหน','เท่าไร','กำหนด','การ','ของ','ที่','มี','ไป']);
function hybridTokens(value:string){const base=normalizeThai(value).split(/\s+/).filter(Boolean),fromRecall=recallMatchTokens(value);return [...new Set([...base,...fromRecall].filter(t=>t.length>=2&&!GENERIC.has(t)))]}
function lexical(query:string,row:any){const q=hybridTokens(query),r=hybridTokens(rowText(row));if(!q.length||!r.length)return .5;let total=0;for(const token of q){const best=Math.max(...r.map(word=>dice(token,word)));total+=best>=.84?1:best>=.66?best*.8:0}return total/q.length}
function semantic(query:string,row:any){const a=normalizeThai(query),b=normalizeThai(rowText(row));return Math.max(memorySimilarity(a,b),dice(a,b)*.72)}
export interface HybridCandidate extends CandidateScore{lexicalRank:number;semanticRank:number;structuredRank:number;priorRank:number;rrf:number}
export function hybridRankCandidates(query:string,rows:any[],activeSourceId='',k=60):HybridCandidate[]{
  const structured=scoreMemoryCandidates(query,rows,activeSourceId),eligible=structured.map(x=>x.row);
  const lexicalList=eligible.map(row=>({row,id:idOf(row),score:lexical(query,row)})).sort((a,b)=>b.score-a.score);
  const semanticList=eligible.map(row=>({row,id:idOf(row),score:semantic(query,row)})).sort((a,b)=>b.score-a.score);
  const priorList=eligible.map(row=>({row,id:idOf(row),score:Number.isFinite(Number(row?._score))?Number(row._score):0})).sort((a,b)=>b.score-a.score);
  const ranks=(items:Array<{id:string;score:number}>)=>{const out=new Map<string,number>();let rank=0,last=Number.NaN;items.forEach((item,i)=>{if(i===0||Math.abs(item.score-last)>1e-9)rank=i+1;out.set(item.id,rank);last=item.score});return out};
  const sr=ranks(structured),lr=ranks(lexicalList),mr=ranks(semanticList),pr=ranks(priorList);
  return structured.map(item=>{const structuredRank=sr.get(item.id)||999,lexicalRank=lr.get(item.id)||999,semanticRank=mr.get(item.id)||999,priorRank=pr.get(item.id)||999;const sourceLocked=item.row?._sourceLocked===true;const hasPrior=Number.isFinite(Number(item.row?._score))&&Number(item.row?._score)!==0;const rrf=(1.6/(k+structuredRank))+(1.5/(k+lexicalRank))+(0.45/(k+semanticRank))+(hasPrior?1.25/(k+priorRank):0)+(sourceLocked?.08:0);return{...item,structuredRank,lexicalRank,semanticRank,priorRank,rrf:Math.round(rrf*1e6)/1e6}}).sort((a,b)=>b.rrf-a.rrf||b.score-a.score);
}
