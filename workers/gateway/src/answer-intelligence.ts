import type { ResearchResult,WebEvidence } from './web-research';
const clean=(v:unknown,max=8000)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export interface CeoAnswer{answer:string;displayText:string;spokenText:string;speechChunks:string[];confidence:number;sources:Array<{title:string;url:string}>}
function stripSourceSuffix(title:string){return clean(title,300).replace(/\s+-\s+[^-]{2,60}$/,'').trim()}
function shortSnippet(item:WebEvidence){const s=clean(item.snippet,500).replace(/^(?:ข่าว|อ่านข่าว|รายละเอียด)\s*/,'');if(!s)return'';return s.length>180?s.slice(0,177).replace(/\s+\S*$/,'')+'…':s}
function speechChunks(text:string,max=190){const parts=text.split(/(?<=[.!?…]|ครับ|ค่ะ)\s+/).filter(Boolean),out:string[]=[];let buf='';for(const p of parts){if(buf&&(buf+' '+p).length>max){out.push(buf);buf=p}else buf=(buf+' '+p).trim()}if(buf)out.push(buf);return out}
export function composeResearchAnswer(result:ResearchResult,requestedCount=3):CeoAnswer{
  const items=result.evidence.slice(0,Math.max(1,requestedCount));if(!items.length)return{answer:'ยังค้นข้อมูลที่ยืนยันได้ไม่สำเร็จครับ',displayText:'ยังค้นข้อมูลที่ยืนยันได้ไม่สำเร็จครับ',spokenText:'ยังค้นข้อมูลที่ยืนยันได้ไม่สำเร็จครับ',speechChunks:['ยังค้นข้อมูลที่ยืนยันได้ไม่สำเร็จครับ'],confidence:0,sources:[]};
  let display='',spoken='';
  if(result.kind==='news'){
    display=`วันนี้มี ${items.length} เรื่องเด่นที่ค้นพบครับ\n`+items.map((x,i)=>`${i+1}. ${stripSourceSuffix(x.title)}${shortSnippet(x)?`\n${shortSnippet(x)}`:''}`).join('\n');
    spoken=`วันนี้มี ${items.length} เรื่องเด่นครับ `+items.map((x,i)=>`เรื่องที่ ${i+1} ${stripSourceSuffix(x.title)}${shortSnippet(x)?` ${shortSnippet(x)}`:''}`).join(' ');
  }else{
    const first=items[0]!;display=`${stripSourceSuffix(first.title)}${shortSnippet(first)?`\n${shortSnippet(first)}`:''}`;if(items.length>1)display+='\n\nแหล่งที่เกี่ยวข้อง: '+items.slice(1,4).map(x=>stripSourceSuffix(x.title)).join(' · ');spoken=`${stripSourceSuffix(first.title)} ${shortSnippet(first)}`.trim();
  }
  const answer=display;return{answer,displayText:display,spokenText:spoken,speechChunks:speechChunks(spoken),confidence:Math.min(.95,.65+items.length*.06),sources:result.sources};
}
export function enrichAnswer(answer:string,spokenText=''):CeoAnswer{const display=String(answer||'').trim(),spoken=spokenText.trim()||display;return{answer:display,displayText:display,spokenText:spoken,speechChunks:speechChunks(spoken),confidence:.85,sources:[]}}
