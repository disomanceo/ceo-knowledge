export type ChatIntentKind='date'|'today'|'tasks'|'recall'|'general';
export interface DateIntent{kind:'date';from:string;to:string;label:string;day:number;month:number;year:number}
export type ChatIntent=DateIntent|{kind:'today'|'tasks'|'recall'|'general'};

const THAI_MONTHS:Record<string,number>={
  มกราคม:1,มค:1,'ม.ค':1,กุมภาพันธ์:2,กพ:2,'ก.พ':2,มีนาคม:3,มีค:3,'มี.ค':3,
  เมษายน:4,เมย:4,'เม.ย':4,พฤษภาคม:5,พค:5,'พ.ค':5,มิถุนายน:6,มิย:6,'มิ.ย':6,
  กรกฎาคม:7,กค:7,'ก.ค':7,สิงหาคม:8,สค:8,'ส.ค':8,กันยายน:9,กย:9,'ก.ย':9,
  ตุลาคม:10,ตค:10,'ต.ค':10,พฤศจิกายน:11,พย:11,'พ.ย':11,ธันวาคม:12,ธค:12,'ธ.ค':12,
};
const clean=(v:string)=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();
const reEscape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function isQuestionLike(input:string){
  const t=clean(input).replace(/[?？]+$/,'').trim();
  return /[?？]\s*$/.test(input)
    ||/(?:ไหม|หรือไม่|หรือยัง|รึยัง|หรือเปล่า|มั้ย|อะไร|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|อย่างไร|ยังไง|เท่าไร|กี่)\s*$/i.test(t)
    ||/^(?:อะไร|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|ทำไม|อย่างไร|ยังไง|what|who|where|when|why|how)\b/i.test(t);
}

function dayRange(y:number,m:number,d:number){
  const from=new Date(Date.UTC(y,m-1,d,-7,0,0,0));
  const to=new Date(Date.UTC(y,m-1,d+1,-7,0,0,0)-1);
  return{from:from.toISOString(),to:to.toISOString()};
}
function bangkokParts(now:Date){const b=new Date(now.getTime()+7*3600000);return{year:b.getUTCFullYear(),month:b.getUTCMonth()+1,day:b.getUTCDate()}}

export function parseDateIntent(input:string,now=new Date()):DateIntent|null{
  const t=clean(input),bp=bangkokParts(now);let y=bp.year,m=bp.month,d=0;
  if(/(?:วันนี้|today)/i.test(t)){d=bp.day}
  else if(/(?:พรุ่งนี้|tomorrow)/i.test(t)){const x=new Date(Date.UTC(bp.year,bp.month-1,bp.day+1));y=x.getUTCFullYear();m=x.getUTCMonth()+1;d=x.getUTCDate()}
  else if(/(?:เมื่อวาน|yesterday)/i.test(t)){const x=new Date(Date.UTC(bp.year,bp.month-1,bp.day-1));y=x.getUTCFullYear();m=x.getUTCMonth()+1;d=x.getUTCDate()}
  else {
    const monthAlt=Object.keys(THAI_MONTHS).sort((a,b)=>b.length-a.length).map(reEscape).join('|');
    const dateCue=new RegExp('(?:วันที่\\s*\\d{1,2}|^\\s*\\d{1,2}\\s*(?:มีอะไร|มีงาน|มีนัด|มีเรื่อง|อะไรไหม)|\\d{1,2}\\s*(?:'+monthAlt+'|[/-]\\d{1,2}))','i');
    if(!dateCue.test(t))return null;
    const full=t.match(new RegExp('(?:วันที่\\s*)?(\\d{1,2})\\s*(?:(' + monthAlt + '|\\d{1,2})\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4})?)?','i'));
    if(!full)return null;d=Number(full[1]);if(!d||d>31)return null;
    if(full[2]){const raw=full[2].replace(/\.$/,'');m=THAI_MONTHS[raw]||Number(raw)||m}
    if(full[3]){y=Number(full[3]);if(y<100)y+=2500;if(y>2400)y-=543}
    else if(!full[2]&&d<bp.day){m+=1;if(m>12){m=1;y+=1}}
  }
  if(!d||m<1||m>12)return null;
  const check=new Date(Date.UTC(y,m-1,d));if(check.getUTCDate()!==d||check.getUTCMonth()+1!==m)return null;
  const r=dayRange(y,m,d),label=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(r.from));
  return{kind:'date',...r,label,day:d,month:m,year:y};
}

export function dateTextMatchesIntent(input:string,intent:DateIntent){
  const t=clean(input);if(!t)return false;
  const monthAliases=Object.entries(THAI_MONTHS).filter(([,value])=>value===intent.month).map(([key])=>reEscape(key));
  monthAliases.push(String(intent.month),String(intent.month).padStart(2,'0'));
  const monthAlt=[...new Set(monthAliases)].sort((a,b)=>b.length-a.length).join('|');
  const be=intent.year+543,day=String(intent.day),day2=day.padStart(2,'0'),month2=String(intent.month).padStart(2,'0');
  const thai=new RegExp(`(?:วันที่\\s*)?(?:${day2}|${day})\\s*(?:${monthAlt})(?:\\s*(?:พ\\.?ศ\\.?\\s*)?(?:${be}|${intent.year}))?`,'i');
  const slash=new RegExp(`(?:^|\\D)(?:${day2}|${day})[/-](?:${month2}|${intent.month})(?:[/-](?:${be}|${intent.year}))?(?:\\D|$)`,'i');
  const iso=new RegExp(`(?:^|\\D)${intent.year}-${month2}-${day2}(?:\\D|$)`);
  return thai.test(t)||slash.test(t)||iso.test(t);
}

export function detectChatIntent(input:string,now=new Date()):ChatIntent{
  const t=clean(input),date=parseDateIntent(t,now);
  if(date&&(isQuestionLike(t)||/(?:มีงาน|มีนัด|ตาราง|นัด|กิจกรรม|schedule|what.*on)/i.test(t)))return date;
  if(/(?:งานค้าง|งานที่ต้องทำ|ต้องทำอะไร|tasks?|todo)/i.test(t))return{kind:'tasks'};
  if(/(?:วันนี้|today|นัดวันนี้|ตารางวันนี้)/i.test(t))return{kind:'today'};
  return{kind:isQuestionLike(t)?'recall':'general'};
}

export function memoryLooksLikeQuestion(row:any){
  const title=clean(row?.title||'').replace(/^(?:Memory|Question)\s*:\s*/i,'');
  const content=clean(row?.content||'').replace(/^(?:memory|question)\s*:\s*/i,'');
  return isQuestionLike(title)||isQuestionLike(content);
}

export function composeDateAnswer(intent:DateIntent,input:{events:any[];tasks:any[];memories:any[]}){
  const events=input.events||[],tasks=input.tasks||[],memories=input.memories||[],total=events.length+tasks.length+memories.length;
  if(!total)return`วันที่ ${intent.label} ยังไม่พบงาน นัด หรือความจำที่ผูกกับวันนี้ครับ`;
  const lines:string[]=[`วันที่ ${intent.label} มี ${total} รายการครับ`];
  for(const e of events.slice(0,8)){const tm=new Date(e.start_at).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});lines.push(`• ${tm} ${e.title}${e.location?` · ${e.location}`:''}`)}
  for(const t of tasks.slice(0,8))lines.push(`• งาน: ${t.title}${t.status==='completed'?' (เสร็จแล้ว)':''}`);
  for(const m of memories.slice(0,5))lines.push(`• ความจำ: ${m.title||m.content}`);
  return lines.join('\n');
}

export function composeTaskAnswer(tasks:any[]){
  if(!tasks.length)return'ตอนนี้ไม่มีงานค้างครับ';
  return`มีงานที่ยังไม่เสร็จ ${tasks.length} งานครับ\n`+tasks.slice(0,8).map((t:any)=>`• ${t.title}${t.due_at?` · กำหนด ${new Date(t.due_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:''}`).join('\n');
}