export type ChatIntentKind='date'|'temporal'|'today'|'tasks'|'recall'|'general';
export type TemporalGranularity='day'|'week'|'month'|'year'|'range';
export interface DateIntent{kind:'date';from:string;to:string;label:string;granularity:'day';day:number;month:number;year:number}
export interface TemporalIntent{kind:'temporal';from:string;to:string;label:string;granularity:Exclude<TemporalGranularity,'day'>;year?:number;month?:number;topic:string}
export type TimeIntent=DateIntent|TemporalIntent;
export type ChatIntent=TimeIntent|{kind:'today'|'tasks'|'recall'|'general'};

const THAI_MONTHS:Record<string,number>={
  มกราคม:1,มค:1,'ม.ค':1,กุมภาพันธ์:2,กพ:2,'ก.พ':2,มีนาคม:3,มีค:3,'มี.ค':3,
  เมษายน:4,เมย:4,'เม.ย':4,พฤษภาคม:5,พค:5,'พ.ค':5,มิถุนายน:6,มิย:6,'มิ.ย':6,
  กรกฎาคม:7,กค:7,'ก.ค':7,สิงหาคม:8,สค:8,'ส.ค':8,กันยายน:9,กย:9,'ก.ย':9,
  ตุลาคม:10,ตค:10,'ต.ค':10,พฤศจิกายน:11,พย:11,'พ.ย':11,ธันวาคม:12,ธค:12,'ธ.ค':12,
};
const MONTH_NAMES=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const clean=(v:string)=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();
const reEscape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const bangkokParts=(now:Date)=>{const b=new Date(now.getTime()+7*3600000);return{year:b.getUTCFullYear(),month:b.getUTCMonth()+1,day:b.getUTCDate()}};
const localStartUtc=(y:number,m:number,d:number)=>new Date(Date.UTC(y,m-1,d,-7,0,0,0));
const localEndUtc=(y:number,m:number,d:number)=>new Date(Date.UTC(y,m-1,d+1,-7,0,0,0)-1);
const range=(from:Date,to:Date)=>({from:from.toISOString(),to:to.toISOString()});
const thaiDate=(value:Date,opts:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',...opts}).format(value);

export function isQuestionLike(input:string){
  const t=clean(input).replace(/[?？]+$/,'').trim();
  return /[?？]\s*$/.test(input)
    ||/(?:ไหม|หรือไม่|หรือยัง|รึยัง|หรือเปล่า|มั้ย|อะไร|อะไรบ้าง|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|อย่างไร|ยังไง|เท่าไร|กี่)\s*$/i.test(t)
    ||/^(?:อะไร|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|ทำไม|อย่างไร|ยังไง|what|who|where|when|why|how)\b/i.test(t);
}

function shiftDay(bp:{year:number;month:number;day:number},offset:number){const x=new Date(Date.UTC(bp.year,bp.month-1,bp.day+offset));return{year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()}}
function dayIntent(y:number,m:number,d:number):DateIntent|null{
  const check=new Date(Date.UTC(y,m-1,d));if(check.getUTCDate()!==d||check.getUTCMonth()+1!==m)return null;
  const r=range(localStartUtc(y,m,d),localEndUtc(y,m,d));
  return{kind:'date',...r,label:thaiDate(new Date(r.from),{day:'numeric',month:'short',year:'numeric'}),granularity:'day',day:d,month:m,year:y};
}

export function parseDateIntent(input:string,now=new Date()):DateIntent|null{
  const t=clean(input),bp=bangkokParts(now);let y=bp.year,m=bp.month,d=0;
  if(/(?:มะรืน|day after tomorrow)/i.test(t)){({year:y,month:m,day:d}=shiftDay(bp,2))}
  else if(/(?:พรุ่งนี้|tomorrow)/i.test(t)){({year:y,month:m,day:d}=shiftDay(bp,1))}
  else if(/(?:วันนี้|today)/i.test(t)){d=bp.day}
  else if(/(?:เมื่อวานซืน|วานซืน|day before yesterday)/i.test(t)){({year:y,month:m,day:d}=shiftDay(bp,-2))}
  else if(/(?:เมื่อวาน|yesterday)/i.test(t)){({year:y,month:m,day:d}=shiftDay(bp,-1))}
  else {
    const monthAlt=Object.keys(THAI_MONTHS).sort((a,b)=>b.length-a.length).map(reEscape).join('|');
    const dateCue=new RegExp('(?:วันที่\\s*\\d{1,2}|^\\s*\\d{1,2}\\s*(?:มีอะไร|มีงาน|มีนัด|มีเรื่อง|อะไรไหม|อะไรบ้าง)|\\d{1,2}\\s*(?:'+monthAlt+'|[/-]\\d{1,2}))','i');
    if(!dateCue.test(t))return null;
    const full=t.match(new RegExp('(?:วันที่\\s*)?(\\d{1,2})\\s*(?:(' + monthAlt + '|\\d{1,2})\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4})?)?','i'));
    if(!full)return null;d=Number(full[1]);if(!d||d>31)return null;
    if(full[2]){const raw=full[2].replace(/\.$/,'');m=THAI_MONTHS[raw]||Number(raw)||m}
    if(full[3]){y=Number(full[3]);if(y<100)y+=2500;if(y>2400)y-=543}
    else if(!full[2]&&d<bp.day){m+=1;if(m>12){m=1;y+=1}}
  }
  return dayIntent(y,m,d);
}

function monthRange(y:number,m:number){return range(localStartUtc(y,m,1),new Date(Date.UTC(y,m,1,-7,0,0,0)-1))}
function yearRange(y:number){return range(localStartUtc(y,1,1),new Date(Date.UTC(y+1,0,1,-7,0,0,0)-1))}
function weekRange(bp:{year:number;month:number;day:number},offsetWeeks:number){
  const anchor=new Date(Date.UTC(bp.year,bp.month-1,bp.day));const dow=anchor.getUTCDay()||7;anchor.setUTCDate(anchor.getUTCDate()-(dow-1)+(offsetWeeks*7));
  const y=anchor.getUTCFullYear(),m=anchor.getUTCMonth()+1,d=anchor.getUTCDate();
  const from=localStartUtc(y,m,d),to=new Date(from.getTime()+7*86400000-1);return range(from,to);
}

export function extractTemporalTopic(input:string){
  let t=clean(input);
  const monthAlt=Object.keys(THAI_MONTHS).sort((a,b)=>b.length-a.length).map(reEscape).join('|');
  const removals=[
    /(?:วันนี้|พรุ่งนี้|มะรืน|เมื่อวานซืน|วานซืน|เมื่อวาน|today|tomorrow|yesterday|day after tomorrow|day before yesterday)/ig,
    /(?:สัปดาห์|อาทิตย์)(?:นี้|หน้า|ก่อน|ที่แล้ว)/g,
    /เดือน(?:นี้|หน้า|ก่อน|ที่แล้ว)/g,
    /ปี(?:นี้|หน้า|ก่อน|ที่แล้ว)/g,
    new RegExp('(?:เดือน\\s*)?(?:'+monthAlt+')(?:\\s*(?:พ\\.?ศ\\.?\\s*)?\\d{2,4})?','ig'),
    /(?:พ\.?ศ\.?\s*)?\b(?:25\d{2}|20\d{2})\b/g,
    /(?:อีก|ภายใน)\s*\d{1,3}\s*(?:วัน|สัปดาห์|เดือน)/g,
    /\d{1,3}\s*(?:วัน|สัปดาห์|เดือน)\s*(?:ข้างหน้า|ถัดไป)/g,
    /(?:ช่วง|ในช่วง|ตั้งแต่|ถึง|จนถึง)/g,
    /^(?:มี|อยากรู้|ช่วยดู|ดูให้หน่อย|เช็ก|เช็ค)\s*/g,
    /\s*(?:มี)?(?:อะไรบ้าง|อะไร|บ้าง|ไหม|มั้ย|หรือไม่|หรือเปล่า|หรือยัง)\s*$/g,
  ];
  for(const re of removals)t=t.replace(re,' ');
  const topic=clean(t).replace(/^(?:มี)\s*/,'').trim();
  return /^(?:งาน|นัด|กิจกรรม|เรื่อง|รายการ)$/.test(topic)?'':topic;
}

export function parseTemporalIntent(input:string,now=new Date()):TemporalIntent|null{
  const t=clean(input),bp=bangkokParts(now),topic=extractTemporalTopic(t);let r:{from:string;to:string}|null=null,label='',granularity:TemporalIntent['granularity']='range',year:number|undefined,month:number|undefined;
  if(/(?:สัปดาห์|อาทิตย์)นี้/.test(t)){r=weekRange(bp,0);label='สัปดาห์นี้';granularity='week'}
  else if(/(?:สัปดาห์|อาทิตย์)หน้า/.test(t)){r=weekRange(bp,1);label='สัปดาห์หน้า';granularity='week'}
  else if(/(?:สัปดาห์|อาทิตย์)(?:ก่อน|ที่แล้ว)/.test(t)){r=weekRange(bp,-1);label='สัปดาห์ที่แล้ว';granularity='week'}
  else if(/เดือนนี้/.test(t)){r=monthRange(bp.year,bp.month);year=bp.year;month=bp.month;label=`เดือน${MONTH_NAMES[bp.month-1]}`;granularity='month'}
  else if(/เดือนหน้า/.test(t)){let y=bp.year,m=bp.month+1;if(m>12){m=1;y++}r=monthRange(y,m);year=y;month=m;label=`เดือน${MONTH_NAMES[m-1]}`;granularity='month'}
  else if(/เดือน(?:ก่อน|ที่แล้ว)/.test(t)){let y=bp.year,m=bp.month-1;if(m<1){m=12;y--}r=monthRange(y,m);year=y;month=m;label=`เดือน${MONTH_NAMES[m-1]}`;granularity='month'}
  else if(/ปีนี้/.test(t)){r=yearRange(bp.year);year=bp.year;label=`ปี ${bp.year+543}`;granularity='year'}
  else if(/ปีหน้า/.test(t)){r=yearRange(bp.year+1);year=bp.year+1;label=`ปี ${bp.year+544}`;granularity='year'}
  else if(/ปี(?:ก่อน|ที่แล้ว)/.test(t)){r=yearRange(bp.year-1);year=bp.year-1;label=`ปี ${bp.year+542}`;granularity='year'}
  else {
    const forward=t.match(/(?:อีก|ภายใน)\s*(\d{1,3})\s*(วัน|สัปดาห์|เดือน)|(?:\b(\d{1,3})\s*(วัน|สัปดาห์|เดือน)\s*(?:ข้างหน้า|ถัดไป))/);
    if(forward){const n=Number(forward[1]||forward[3]),unit=forward[2]||forward[4];if(n>0&&n<=366){const from=localStartUtc(bp.year,bp.month,bp.day);let to:Date;if(unit==='วัน')to=new Date(from.getTime()+(n+1)*86400000-1);else if(unit==='สัปดาห์')to=new Date(from.getTime()+(n*7+1)*86400000-1);else {const end=new Date(Date.UTC(bp.year,bp.month-1+n,bp.day+1,-7,0,0,0)-1);to=end}r=range(from,to);label=`${n} ${unit}ข้างหน้า`;granularity='range'}}
    if(!r){
      const monthAlt=Object.keys(THAI_MONTHS).sort((a,b)=>b.length-a.length).map(reEscape).join('|');
      const mm=t.match(new RegExp('(?:เดือน\\s*)?('+monthAlt+')(?:\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4}))?','i'));
      if(mm?.[1]){const matchedMonth=THAI_MONTHS[mm[1].replace(/\.$/,'')]||0;if(matchedMonth){let parsedYear=mm[2]?Number(mm[2]):bp.year;if(parsedYear<100)parsedYear+=2500;if(parsedYear>2400)parsedYear-=543;year=parsedYear;month=matchedMonth;r=monthRange(parsedYear,matchedMonth);label=`เดือน${MONTH_NAMES[matchedMonth-1]} ${parsedYear+543}`;granularity='month'}}
    }
    if(!r){const yy=t.match(/(?:ปี|พ\.?ศ\.?\s*)(\d{4})/);if(yy){year=Number(yy[1]);if(year>2400)year-=543;if(year>=1900&&year<=2200){r=yearRange(year);label=`ปี ${year+543}`;granularity='year'}}}
  }
  return r?{kind:'temporal',...r,label,granularity,year,month,topic}:null;
}

function explicitDatesFromText(input:string){
  const t=clean(input),out:{year:number;month:number;day:number}[]=[];
  const monthAlt=Object.keys(THAI_MONTHS).sort((a,b)=>b.length-a.length).map(reEscape).join('|');
  const thai=new RegExp('(?:วันที่\\s*)?(\\d{1,2})\\s*('+monthAlt+')(?:\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{4}))?','ig');let m:RegExpExecArray|null;
  while((m=thai.exec(t))){const rawMonth=String(m[2]||'').replace(/\.$/,'');const parsedMonth=THAI_MONTHS[rawMonth]||0;if(!parsedMonth)continue;let y=m[3]?Number(m[3]):NaN;if(y>2400)y-=543;out.push({day:Number(m[1]||0),month:parsedMonth,year:y})}
  const numeric=/(?:^|\D)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D|$)/g;while((m=numeric.exec(t))){let y=Number(m[3]);if(y>2400)y-=543;out.push({day:Number(m[1]),month:Number(m[2]),year:y})}
  const iso=/(?:^|\D)(20\d{2})-(\d{2})-(\d{2})(?:\D|$)/g;while((m=iso.exec(t)))out.push({year:Number(m[1]),month:Number(m[2]),day:Number(m[3])});
  return out;
}

export function dateTextMatchesIntent(input:string,intent:DateIntent){
  const dates=explicitDatesFromText(input);return dates.some(x=>(Number.isNaN(x.year)||x.year===intent.year)&&x.month===intent.month&&x.day===intent.day);
}
export function temporalTextMatchesIntent(input:string,intent:TimeIntent){
  const from=Date.parse(intent.from),to=Date.parse(intent.to),bp=bangkokParts(new Date(intent.from));
  return explicitDatesFromText(input).some(x=>{const y=Number.isNaN(x.year)?bp.year:x.year;const d=localStartUtc(y,x.month,x.day).getTime();return d>=from&&d<=to});
}

export function detectChatIntent(input:string,now=new Date()):ChatIntent{
  const t=clean(input),date=parseDateIntent(t,now);if(date&&(isQuestionLike(t)||/(?:มีงาน|มีนัด|ตาราง|นัด|กิจกรรม|schedule|what.*on)/i.test(t)))return date;
  const temporal=parseTemporalIntent(t,now);if(temporal&&(isQuestionLike(t)||/(?:มีงาน|มีนัด|ตาราง|กิจกรรม|สรุป|อะไรบ้าง|schedule)/i.test(t)))return temporal;
  if(/(?:งานค้าง|งานที่ต้องทำ|ต้องทำอะไร|tasks?|todo)/i.test(t))return{kind:'tasks'};
  if(/(?:วันนี้|today|นัดวันนี้|ตารางวันนี้)/i.test(t))return{kind:'today'};
  return{kind:isQuestionLike(t)?'recall':'general'};
}

export function memoryLooksLikeQuestion(row:any){
  const title=clean(row?.title||'').replace(/^(?:Memory|Question)\s*:\s*/i,''),content=clean(row?.content||'').replace(/^(?:memory|question)\s*:\s*/i,'');
  return isQuestionLike(title)||isQuestionLike(content);
}
export function topicMatches(input:string,topic:string){const q=clean(topic).toLocaleLowerCase();if(!q)return true;const hay=clean(input).toLocaleLowerCase();if(hay.includes(q))return true;const tokens=q.split(/\s+/).filter(Boolean);if(tokens.length>1&&tokens.every(token=>hay.includes(token)))return true;const significant=q.replace(/^(?:งาน|เรื่อง|กิจกรรม|นัด|การ)\s*/,'').trim();return significant.length>=2&&hay.includes(significant)}

export function composeDateAnswer(intent:DateIntent,input:{events:any[];tasks:any[];memories:any[]}){
  return composeTemporalAnswer(intent,input);
}
export function composeTemporalAnswer(intent:TimeIntent,input:{events:any[];tasks:any[];memories:any[]}){
  const events=input.events||[],tasks=input.tasks||[],memories=input.memories||[],total=events.length+tasks.length+memories.length,topic=intent.kind==='temporal'?intent.topic:'';
  if(!total)return`${intent.label}${topic?` เรื่อง “${topic}”`:''} ยังไม่พบงาน นัด หรือความจำที่ตรงกันครับ`;
  const lines:string[]=[`${intent.label}${topic?` เรื่อง “${topic}”`:''} มี ${total} รายการครับ`];
  for(const e of events.slice(0,12)){const dt=new Date(e.start_at),day=thaiDate(dt,{day:'numeric',month:'short'}),tm=dt.toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});lines.push(`• ${day} ${tm} ${e.title}${e.location?` · ${e.location}`:''}`)}
  for(const t of tasks.slice(0,12)){const due=t.due_at?thaiDate(new Date(t.due_at),{day:'numeric',month:'short'}):'';lines.push(`• งาน${due?` ${due}`:''}: ${t.title}${t.status==='completed'?' (เสร็จแล้ว)':''}`)}
  for(const m of memories.slice(0,8))lines.push(`• ความจำ: ${m.title||m.content}`);
  return lines.join('\n');
}
export function composeTaskAnswer(tasks:any[]){
  if(!tasks.length)return'ตอนนี้ไม่มีงานค้างครับ';
  return`มีงานที่ยังไม่เสร็จ ${tasks.length} งานครับ\n`+tasks.slice(0,8).map((t:any)=>`• ${t.title}${t.due_at?` · กำหนด ${new Date(t.due_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:''}`).join('\n');
}
