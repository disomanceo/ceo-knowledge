import { dedupeSemanticEvents, recallAnswerField, recallMatchTokens, type RecallAnswerField } from './chat';

const clean=(v:unknown,max=1200)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export type ContextResultRef={id:string;kind:string;title:string;startAt?:string;dueAt?:string;location?:string};

export function contextResultSet(rows:any[],limit=12):ContextResultRef[]{
  const source=Array.isArray(rows)?rows:[];
  const events=dedupeSemanticEvents(source.filter(r=>r?.kind==='events'));
  const others=source.filter(r=>r?.kind!=='events');
  const seen=new Set<string>(),out:ContextResultRef[]=[];
  for(const row of [...events,...others]){
    const id=clean(row?.id||row?.node_id,200);if(!id||seen.has(id))continue;seen.add(id);
    out.push({id,kind:clean(row?.kind||row?.node_type,40),title:clean(row?.title||row?.content,300),startAt:clean(row?.start_at||row?.event_at,100)||undefined,dueAt:clean(row?.due_at,100)||undefined,location:clean(row?.location,300)||undefined});
    if(out.length>=limit)break;
  }
  return out;
}
function localDay(value:string){const n=Date.parse(value);if(!Number.isFinite(n))return 0;return new Date(n+7*3600000).getUTCDate()}
function explicitDay(message:string){const m=clean(message,500).match(/(?:วันที่|วัน)\s*(\d{1,2})|(?:^|\s)(\d{1,2})(?:\s*(?:ก\.?ย\.?|กันยายน|ต\.?ค\.?|ตุลาคม|พ\.?ย\.?|พฤศจิกายน|ธ\.?ค\.?|ธันวาคม|ม\.?ค\.?|มกราคม|ก\.?พ\.?|กุมภาพันธ์|มี\.?ค\.?|มีนาคม|เม\.?ย\.?|เมษายน|พ\.?ค\.?|พฤษภาคม|มิ\.?ย\.?|มิถุนายน|ก\.?ค\.?|กรกฎาคม|ส\.?ค\.?|สิงหาคม))/i);return Number(m?.[1]||m?.[2]||0)}
export function selectContextResult(message:string,refs:ContextResultRef[]):ContextResultRef|null{
  if(!Array.isArray(refs)||!refs.length)return null;const day=explicitDay(message);
  if(day){const dated=refs.filter(ref=>localDay(ref.startAt||ref.dueAt||'')===day);if(dated.length===1)return dated[0]!;}
  const tokens=recallMatchTokens(message);if(tokens.length){const ranked=refs.map(ref=>{const hay=clean(`${ref.title} ${ref.location||''}`,800).toLocaleLowerCase();return{ref,hits:tokens.filter(t=>hay.includes(t.toLocaleLowerCase())).length}}).sort((a,b)=>b.hits-a.hits);if(ranked[0]!.hits>0&&(ranked[0]!.hits>(ranked[1]?.hits||0)))return ranked[0]!.ref;}
  return refs.length===1?refs[0]!:null;
}
export function contextField(message:string):RecallAnswerField{return recallAnswerField(message)}
export function contextListAnswer(message:string,rows:any[]):string{
  const field=recallAnswerField(message),source=contextResultSet(rows,20);if(source.length<2)return'';
  if(field==='location'){
    const labels=source.map(ref=>{const school=ref.title.match(/โรงเรียน(?:วัด)?\s*[^–—·,()]+/u)?.[0]?.trim();return clean(ref.location||school||ref.title.replace(/^(?:ประเมิน\s*PA\s*|ประเมิน\s*)/iu,''),180)}).filter(Boolean);
    const unique=[...new Set(labels)];if(unique.length)return`มี ${unique.length} แห่งครับ: ${unique.join(', ')}`;
  }
  return'';
}
