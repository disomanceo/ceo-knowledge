import { memorySimilarity } from './memory-gardener';

const clean=(v:unknown,max=8000)=>String(v??'').normalize('NFC').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export type ClaimLifecycle='current'|'superseded'|'conflicting'|'stale'|'refuted';
export interface CanonicalCandidate{row:any;score:number;reason:string}

function text(row:any){return clean([row?.title,row?.content,row?.description,row?.summary,row?.location].filter(Boolean).join(' '),12000)}
function day(value:any){const n=Date.parse(String(value||''));return Number.isFinite(n)?new Date(n).toISOString().slice(0,10):''}
function normalizeCanonicalText(value:string){return clean(value,5000).toLocaleLowerCase()
  .replace(/เกณียณ|เกษียน|เกษีณ/g,'เกษียณ').replace(/ภาพยนต์/g,'ภาพยนตร์')
  .replace(/รร\.?/g,'โรงเรียน ').replace(/ผอ\.?/g,'ผู้อำนวยการ ')
  .replace(/โรงเรียน\s*วัด/g,'โรงเรียน ').replace(/\bวัด(?=\S)/g,'')
  .replace(/(?:วันที่|เวลา)\s*\d{1,2}(?:(?:[:.]\d{2})|\s*(?:ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)(?:\s*\d{2,4})?)/gi,' ')
  .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()}
const CANON_STOP=new Set(['งาน','กิจกรรม','กำหนดการ','วันที่','เวลา','ที่','ของ','การ','และ','ครับ','ค่ะ','คะ','นะ','โรงเรียน']);
export function canonicalTokens(value:string):string[]{return [...new Set(normalizeCanonicalText(value).split(/\s+/).filter(token=>token.length>=2&&!CANON_STOP.has(token)))].sort()}
export function canonicalKeyFor(row:any):string{
  const kind=clean(row?.node_type||row?.kind||row?.object_type||'memory',40).toLocaleLowerCase();
  const date=day(row?.event_at||row?.start_at||row?.due_at);
  const tokens=canonicalTokens(text(row)).slice(0,10);
  return [kind,date,...tokens].filter(Boolean).join('|').slice(0,700);
}
export function contentEquivalent(a:any,b:any):boolean{return normalizeCanonicalText(text(a))===normalizeCanonicalText(text(b))}
export function canonicalMatchScore(incoming:any,row:any):number{
  if(!incoming||!row)return 0;
  const canonicalType=(v:unknown)=>{const t=clean(v,40).toLocaleLowerCase();if(['memory','memories','memory_nodes'].includes(t))return'memory';if(['event','events'].includes(t))return'event';if(['task','tasks'].includes(t))return'task';if(['person','people','contact'].includes(t))return'person';return t};
  const typeA=canonicalType(incoming.node_type||incoming.kind||incoming.object_type),typeB=canonicalType(row.node_type||row.kind||row.object_type);if(typeA&&typeB&&typeA!==typeB)return 0;
  const a=text(incoming),b=text(row);if(!a||!b)return 0;
  const ta=new Set(canonicalTokens(a)),tb=new Set(canonicalTokens(b)),common=[...ta].filter(x=>tb.has(x)).length,union=new Set([...ta,...tb]).size;
  const tokenOverlap=union?common/union:0,containment=Math.min(ta.size,tb.size)?common/Math.min(ta.size,tb.size):0;
  let score=Math.max(memorySimilarity(a,b),tokenOverlap*.78+containment*.22);
  const keyA=canonicalKeyFor(incoming),keyB=canonicalKeyFor(row);if(keyA&&keyA===keyB)score=Math.max(score,.97);
  const da=day(incoming.event_at||incoming.start_at||incoming.due_at),db=day(row.event_at||row.start_at||row.due_at);if(da&&db)score+=da===db?.18:-.22;
  const entityA=new Set(Array.isArray(incoming.entity_ids)?incoming.entity_ids:[]),entityB=new Set(Array.isArray(row.entity_ids)?row.entity_ids:[]);if(entityA.size&&entityB.size&&[...entityA].some(x=>entityB.has(x)))score+=.12;
  if(common)score+=Math.min(.12,common*.03);
  return Math.max(0,Math.min(1,Math.round(score*1000)/1000));
}
export function chooseCanonicalCandidate(incoming:any,rows:any[]):CanonicalCandidate|null{
  const ranked=(Array.isArray(rows)?rows:[]).map(row=>({row,score:canonicalMatchScore(incoming,row),reason:'canonical+semantic+time+entity'})).sort((a,b)=>b.score-a.score);
  return ranked[0]&&ranked[0].score>=.72?ranked[0]:null;
}
export function claimLifecycle(row:any,now=Date.now()):ClaimLifecycle{
  const meta=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  if(row?.truth_status==='refuted')return'refuted';
  if(row?.superseded_by||meta.supersededBy||meta.lifecycle==='superseded')return'superseded';
  if(row?.evidence_status==='conflicting'||meta.lifecycle==='conflicting')return'conflicting';
  if(['superseded','conflicting','stale','refuted'].includes(String(row?.lifecycle_status||'')))return row.lifecycle_status as ClaimLifecycle;
  const validTo=Date.parse(String(row?.valid_to||meta.validTo||''));if(Number.isFinite(validTo)&&validTo<now)return'stale';
  return'current';
}
export function retrievalEligible(row:any):boolean{const life=claimLifecycle(row);return ['current','conflicting'].includes(life)&&row?.metadata?.archived!==true}
export function freshnessScore(row:any,now=Date.now()):number{
  const meta=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};const stamp=Date.parse(String(row?.valid_from||meta.validFrom||row?.updated_at||row?.created_at||''));if(!Number.isFinite(stamp))return .5;
  const days=Math.max(0,(now-stamp)/86400000);return Math.max(.1,Math.round(Math.exp(-days/365)*1000)/1000);
}
