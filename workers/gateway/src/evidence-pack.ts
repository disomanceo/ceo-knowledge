const clean=(v:unknown,max=1800)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export interface EvidenceItem{ id:string; kind:string; title:string; fact:string; startAt?:string; dueAt?:string; location?:string; status?:string; authority?:number }
export interface EvidencePack{query:string;items:EvidenceItem[];estimatedTokens:number;truncated:boolean}
function idOf(row:any){return clean(row?.id||row?.node_id,180)}
function item(row:any):EvidenceItem{return{id:idOf(row),kind:clean(row?.kind||row?.node_type,40),title:clean(row?.title||row?.full_name,240),fact:clean(row?.description||row?.content||row?.summary||row?.rationale||row?.waiting_for,700),startAt:clean(row?.start_at||row?.event_at,100)||undefined,dueAt:clean(row?.due_at,100)||undefined,location:clean(row?.location,240)||undefined,status:clean(row?.status,80)||undefined,authority:Number(row?._score||row?.importance||0)}}
export function buildEvidencePack(query:string,rows:any[],options:{limit?:number;maxChars?:number}={}):EvidencePack{
 const limit=Math.max(1,Math.min(8,Number(options.limit||6))),maxChars=Math.max(1200,Math.min(9000,Number(options.maxChars||5200)));let used=0,truncated=false;const items:EvidenceItem[]=[];
 for(const row of (Array.isArray(rows)?rows:[]).slice(0,limit*2)){const next=item(row);if(!next.id&&!next.title)continue;const serialized=JSON.stringify(next);if(used+serialized.length>maxChars){truncated=true;break}used+=serialized.length;items.push(next);if(items.length>=limit){truncated=(Array.isArray(rows)&&rows.length>items.length);break}}
 return{query:clean(query,1000),items,estimatedTokens:Math.ceil((used+clean(query,1000).length)/3.2),truncated};
}
