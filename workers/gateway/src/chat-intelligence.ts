export type ChatIntentKind='live'|'date'|'temporal'|'today'|'tasks'|'recall'|'general';
export type TemporalGranularity='day'|'week'|'month'|'year'|'range';
export type CalendarQueryScope='all'|'events'|'appointments'|'tasks';
export interface DateIntent{kind:'date';from:string;to:string;label:string;granularity:'day';day:number;month:number;year:number;scope:CalendarQueryScope}
export interface TemporalIntent{kind:'temporal';from:string;to:string;label:string;granularity:Exclude<TemporalGranularity,'day'>;year?:number;month?:number;topic:string;scope:CalendarQueryScope}
export type TimeIntent=DateIntent|TemporalIntent;
export type ChatIntent=TimeIntent|{kind:'live'|'today'|'tasks'|'recall'|'general'};

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
    ||/(?:ไหม|หรือไม่|หรือยัง|รึยัง|หรือเปล่า|มั้ย|อะไร|อะไรบ้าง|ใคร|ใครบ้าง|ที่ไหน(?:บ้าง)?|วันไหน(?:บ้าง)?|วันอะไร(?:บ้าง)?|เมื่อไหร่(?:บ้าง)?|เมื่อไร(?:บ้าง)?|กี่โมง(?:บ้าง)?|เวลาไหน(?:บ้าง)?|อย่างไร|ยังไง|เท่าไร|กี่)\s*$/i.test(t)
    ||/^(?:อะไร|ใคร|ที่ไหน|เมื่อไหร่|เมื่อไร|ทำไม|อย่างไร|ยังไง|what|who|where|when|why|how)\b/i.test(t);
}

function shiftDay(bp:{year:number;month:number;day:number},offset:number){const x=new Date(Date.UTC(bp.year,bp.month-1,bp.day+offset));return{year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()}}
export function calendarQueryScope(input:string):CalendarQueryScope{
  const t=clean(input);
  if(/(?:งานค้าง|งานที่ต้องทำ|ต้องทำอะไร|todo|tasks?)/i.test(t))return'tasks';
  if(/(?:นัด|ประชุม|appointment|meeting)/i.test(t))return'appointments';
  if(/(?:กิจกรรม|activity)/i.test(t))return'events';
  return'all';
}
function dayIntent(y:number,m:number,d:number,scope:CalendarQueryScope='all'):DateIntent|null{
  const check=new Date(Date.UTC(y,m-1,d));if(check.getUTCDate()!==d||check.getUTCMonth()+1!==m)return null;
  const r=range(localStartUtc(y,m,d),localEndUtc(y,m,d));
  return{kind:'date',...r,label:thaiDate(new Date(r.from),{day:'numeric',month:'short',year:'numeric'}),granularity:'day',day:d,month:m,year:y,scope};
}

export function parseDateIntent(input:string,now=new Date()):DateIntent|null{
  const t=clean(input),bp=bangkokParts(now),scope=calendarQueryScope(t);let y=bp.year,m=bp.month,d=0;
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
  return dayIntent(y,m,d,scope);
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
    new RegExp('(?:เดือน\\s*(?:'+monthAlt+')|(?:^|\\s)(?:'+monthAlt+')(?=\\s|$|มี|อะไร|งาน|นัด|กิจกรรม))(?:\\s*(?:พ\\.?ศ\\.?\\s*)?\\d{2,4})?','ig'),
    /(?:พ\.?ศ\.?\s*)?\b(?:25\d{2}|20\d{2})\b/g,
    /(?:อีก|ภายใน)\s*\d{1,3}\s*(?:วัน|สัปดาห์|เดือน)/g,
    /\d{1,3}\s*(?:วัน|สัปดาห์|เดือน)\s*(?:ข้างหน้า|ถัดไป)/g,
    /(?:ช่วง|ในช่วง|ตั้งแต่|ถึง|จนถึง)/g,
    /^(?:มี|อยากรู้|ช่วยดู|ดูให้หน่อย|เช็ก|เช็ค)\s*/g,
    /\s*(?:มี)?(?:กี่\s*(?:โรงเรียน|แห่ง|งาน|รายการ|ครั้ง)|จำนวน(?:กี่|เท่าไร|เท่าไหร่)|ทั้งหมดกี่|อะไรบ้าง|อะไร|บ้าง|ไหม|มั้ย|หรือไม่|หรือเปล่า|หรือยัง)\s*$/g,
  ];
  for(const re of removals)t=t.replace(re,' ');
  const topic=clean(t).replace(/^(?:มี)\s*/,'').replace(/^(?:โรงเรียน|แห่ง)\s*(?:ที่)?\s*/,'').replace(/\s*(?:กี่|จำนวน|ทั้งหมด)\s*$/,'').trim();
  return /^(?:งาน|นัด|กิจกรรม|เรื่อง|รายการ|โรงเรียน|แห่ง)$/.test(topic)?'':topic;
}

export function parseTemporalIntent(input:string,now=new Date()):TemporalIntent|null{
  const t=clean(input),bp=bangkokParts(now),topic=extractTemporalTopic(t),scope=calendarQueryScope(t);let r:{from:string;to:string}|null=null,label='',granularity:TemporalIntent['granularity']='range',year:number|undefined,month:number|undefined;
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
      const explicitMonth=t.match(new RegExp('เดือน\\s*('+monthAlt+')(?:\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4}))?','i'));
      const bareMonth=explicitMonth?null:t.match(new RegExp('(?:^|\\s)('+monthAlt+')(?:\\s*(?:พ\\.?ศ\\.?\\s*)?(\\d{2,4}))?(?=\\s|$|มี|อะไร|งาน|นัด|กิจกรรม)','i'));
      const mm=explicitMonth||bareMonth;
      if(mm?.[1]){const matchedMonth=THAI_MONTHS[mm[1].replace(/\.$/,'')]||0;if(matchedMonth){let parsedYear=mm[2]?Number(mm[2]):bp.year;if(parsedYear<100)parsedYear+=2500;if(parsedYear>2400)parsedYear-=543;year=parsedYear;month=matchedMonth;r=monthRange(parsedYear,matchedMonth);label=`เดือน${MONTH_NAMES[matchedMonth-1]} ${parsedYear+543}`;granularity='month'}}
    }
    if(!r){const yy=t.match(/(?:ปี|พ\.?ศ\.?\s*)(\d{4})/);if(yy){year=Number(yy[1]);if(year>2400)year-=543;if(year>=1900&&year<=2200){r=yearRange(year);label=`ปี ${year+543}`;granularity='year'}}}
  }
  return r?{kind:'temporal',...r,label,granularity,year,month,topic,scope}:null;
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

export function isLiveExternalQuery(input:string):boolean{
  const t=clean(input).toLocaleLowerCase();
  const market=/(?:หุ้น|stock|set(?:50|100)?\b|ดัชนี|ตลาดหุ้น|ทอง|gold|ค่าเงิน|exchange rate|forex|คริปโต|crypto|bitcoin|btc|ethereum|eth|ราคาน้ำมัน|น้ำมัน|oil)/i.test(t);
  const news=/(?:ข่าว|news)/i.test(t);
  const weather=/(?:สภาพอากาศ|พยากรณ์อากาศ|อากาศ|ฝน|อุณหภูมิ|พายุ|pm\s*2\.?5|aqi|weather|forecast|temperature|rain)/i.test(t);
  const freshness=/(?:วันนี้|พรุ่งนี้|มะรืน|สัปดาห์(?:นี้|หน้า)|ตอนนี้|ล่าสุด|ปัจจุบัน|ขณะนี้|น่าสนใจ|เด่น|ราคา(?:ตอนนี้|วันนี้)?|today|tomorrow|this week|next week|current|latest|right now|live)/i.test(t);
  const lookup=/(?:เช็ก|เช็ค|ช่วยดู|ดู(?:ให้|หน่อย)?|หา|ค้น|แนะนำ|คัด|เลือก|วิเคราะห์|บอก|สรุป|รายงาน|ให้สัก|ตัวไหน|ตัวไหนดี|เด่น|น่าสนใจ|ซื้อ|ขาย|ควร|แนวโน้ม|check|show|find|search|recommend|pick|analy[sz]e|tell|give\s+me)/i.test(t);
  const educational=/(?:คืออะไร|หมายถึงอะไร|ความหมาย|ทำงานอย่างไร|ทำงานยังไง|ประวัติ|what\s+is|how\s+does)/i.test(t);
  if(weather||news)return true;
  if(market&&freshness)return true;
  return market&&lookup&&!educational;
}
export function detectChatIntent(input:string,now=new Date()):ChatIntent{
  const t=clean(input);if(isLiveExternalQuery(t))return{kind:'live'};
  const date=parseDateIntent(t,now);if(date&&(isQuestionLike(t)||/(?:มีงาน|มีนัด|ตาราง|นัด|กิจกรรม|schedule|what.*on)/i.test(t)))return date;
  const temporal=parseTemporalIntent(t,now);if(temporal&&(isQuestionLike(t)||/(?:มีงาน|มีนัด|ตาราง|กิจกรรม|สรุป|อะไรบ้าง|กี่\s*(?:โรงเรียน|แห่ง|งาน|รายการ|ครั้ง)|จำนวน|ทั้งหมดกี่|schedule)/i.test(t)))return temporal;
  if(/(?:งานค้าง|งานที่ต้องทำ|ต้องทำอะไร|tasks?|todo)/i.test(t))return{kind:'tasks'};
  if(/(?:วันนี้|today|นัดวันนี้|ตารางวันนี้)/i.test(t))return{kind:'today'};
  return{kind:isQuestionLike(t)?'recall':'general'};
}

export function memoryLooksLikeQuestion(row:any){
  const title=clean(row?.title||'').replace(/^(?:Memory|Question)\s*:\s*/i,''),content=clean(row?.content||'').replace(/^(?:memory|question)\s*:\s*/i,'');
  return isQuestionLike(title)||isQuestionLike(content);
}
export function topicMatches(input:string,topic:string){const q=clean(topic).toLocaleLowerCase();if(!q)return true;const hay=clean(input).toLocaleLowerCase();if(hay.includes(q))return true;const tokens=q.split(/\s+/).filter(Boolean);if(tokens.length>1&&tokens.every(token=>hay.includes(token)))return true;const significant=q.replace(/^(?:งาน|เรื่อง|กิจกรรม|นัด|การ)\s*/,'').trim();return significant.length>=2&&hay.includes(significant)}

function scheduleText(value:any){
  return clean(String(value||''))
    .toLocaleLowerCase()
    .replace(/^(?:(?:event|memory|question|task)\s*:\s*)+/i,'')
    .replace(/ภาพยนต์/g,'ภาพยนตร์')
    .replace(/big\s*c/g,'bigc')
    .replace(/(?:ชั่วโมง|คาบ)(?:ที่)?\s*(\d+)/g,'คาบ$1')
    .replace(/(?:วันนี้|พรุ่งนี้|มะรืน|เมื่อวาน|สัปดาห์นี้|สัปดาห์หน้า)/g,' ')
    .replace(/(?:วันที่\s*)?\d{1,2}\s*(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)(?:\s*(?:พ\.?ศ\.?\s*)?\d{2,4})?/g,' ')
    .replace(/(?:เวลา\s*)?\d{1,2}[:.]\d{2}(?:\s*น\.?)?/g,' ')
    .replace(/[^\p{L}\p{N}]+/gu,'');
}
function ngrams(value:string,size=2){const out=new Set<string>();for(let i=0;i<=value.length-size;i++)out.add(value.slice(i,i+size));return out}
export function scheduleTextSimilarity(a:any,b:any){
  const x=scheduleText(a),y=scheduleText(b);if(!x||!y)return 0;if(x===y)return 1;if(Math.min(x.length,y.length)>=8&&(x.includes(y)||y.includes(x)))return .94;
  const ax=ngrams(x),by=ngrams(y);if(!ax.size||!by.size)return 0;let hit=0;for(const g of ax)if(by.has(g))hit++;return hit/(ax.size+by.size-hit);
}
function rowScheduleText(row:any){return [row?.title,row?.description,row?.content,row?.summary].filter(Boolean).join(' ')}
function rowDayKey(row:any){const raw=row?.start_at||row?.due_at||row?.event_at||row?.eventAt||'';const ms=Date.parse(String(raw));if(!Number.isFinite(ms))return'';const d=new Date(ms+7*3600000);return d.toISOString().slice(0,10)}
function duplicateScore(row:any){let score=0;if(!row?.metadata?.autoMemory)score+=6;if(!/^(?:event|memory|question|task)\s*:/i.test(clean(row?.title||'')))score+=2;if(row?.event_type&&row.event_type!=='other')score+=2;if(/(?:คาบ|ชั่วโมง)(?:ที่)?\s*\d+/i.test(rowScheduleText(row)))score+=2;if(row?.location)score+=1;return score}
export function eventMatchesCalendarScope(row:any,scope:CalendarQueryScope){
  if(scope==='tasks')return false;if(scope!=='appointments')return true;
  const type=clean(row?.event_type||'').toLowerCase(),text=rowScheduleText(row);
  return /^(?:meeting|appointment|deadline|reminder)$/.test(type)||/(?:นัด|ประชุม|นิเทศ|ประเมิน|ตรวจประเมิน|ตรวจเยี่ยม|อบรม|สัมมนา|สอบ|ทดสอบ|พา.+ไป|เดินทาง|งานเลี้ยง|เกษียณ)/i.test(text);
}
export function memoryMatchesCalendarScope(row:any,scope:CalendarQueryScope){
  if(scope==='tasks')return false;if(scope!=='appointments')return true;
  return /(?:นัด|ประชุม|นิเทศ|ประเมิน|ตรวจประเมิน|ตรวจเยี่ยม|อบรม|สัมมนา|สอบ|ทดสอบ|พา.+ไป|เดินทาง|งานเลี้ยง|เกษียณ)/i.test(rowScheduleText(row));
}
export function dedupeTemporalKnowledge(input:{events:any[];tasks:any[];memories:any[]}){
  const events:any[]=[];for(const row of input.events||[]){const text=rowScheduleText(row),day=rowDayKey(row);const idx=events.findIndex(x=>{const xd=rowDayKey(x);const sim=Math.max(scheduleTextSimilarity(text,rowScheduleText(x)),scheduleTextSimilarity(row?.title,x?.title));return (!day||!xd||day===xd)&&sim>=.58});if(idx<0)events.push(row);else if(duplicateScore(row)>duplicateScore(events[idx]))events[idx]=row;}
  const tasks:any[]=[];for(const row of input.tasks||[]){const text=rowScheduleText(row),day=rowDayKey(row);const idx=tasks.findIndex(x=>{const xd=rowDayKey(x);return(!day||!xd||day===xd)&&scheduleTextSimilarity(text,rowScheduleText(x))>=.68});if(idx<0)tasks.push(row)}
  const anchors=[...events,...tasks];
  const memories=(input.memories||[]).filter(row=>{const text=rowScheduleText(row),day=rowDayKey(row);return !anchors.some(x=>{const xd=rowDayKey(x),sim=Math.max(scheduleTextSimilarity(text,rowScheduleText(x)),scheduleTextSimilarity(row?.title||row?.content,x?.title));return (!day||!xd||day===xd?sim>=.52:sim>=.82)});});
  return{events,tasks,memories};
}

export function composeDateAnswer(intent:DateIntent,input:{events:any[];tasks:any[];memories:any[]}){
  return composeTemporalAnswer(intent,input);
}
export function composeTemporalAnswer(intent:TimeIntent,input:{events:any[];tasks:any[];memories:any[]}){
  const events=input.events||[],tasks=input.tasks||[],memories=input.memories||[],total=events.length+tasks.length+memories.length,topic=intent.kind==='temporal'?intent.topic:'';
  const scopeText=intent.scope==='appointments'?'นัด/กำหนดการ':intent.scope==='tasks'?'งานที่ต้องทำ':intent.scope==='events'?'กิจกรรม':'รายการ';
  if(!total)return`${intent.label}${topic?` เรื่อง “${topic}”`:''} ยังไม่พบ${scopeText}ที่ตรงกันครับ`;
  const lines:string[]=[`${intent.label}${topic?` เรื่อง “${topic}”`:''} มี ${total} ${scopeText}ครับ`];
  for(const e of events.slice(0,12)){const dt=new Date(e.start_at),day=thaiDate(dt,{day:'numeric',month:'short'}),tm=dt.toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}),title=clean(e.title||e.description).replace(/^(?:Event\s*:\s*)+/i,''),when=e.all_day?day:`${day} ${tm}`;lines.push(`• ${when} ${title}${e.location?` · ${e.location}`:''}`)}
  for(const t of tasks.slice(0,12)){const due=t.due_at?thaiDate(new Date(t.due_at),{day:'numeric',month:'short'}):'';lines.push(`• งาน${due?` ${due}`:''}: ${clean(t.title||t.description).replace(/^(?:Task\s*:\s*)+/i,'')}${t.status==='completed'?' (เสร็จแล้ว)':''}`)}
  for(const m of memories.slice(0,8)){const text=clean(m.title||m.content).replace(/^(?:(?:Memory|Question|Event)\s*:\s*)+/i,'');lines.push(`• ${text}`);}
  return lines.join('\n');
}
export function composeTaskAnswer(tasks:any[]){
  if(!tasks.length)return'ตอนนี้ไม่มีงานค้างครับ';
  return`มีงานที่ยังไม่เสร็จ ${tasks.length} งานครับ\n`+tasks.slice(0,8).map((t:any)=>`• ${t.title}${t.due_at?` · กำหนด ${new Date(t.due_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:''}`).join('\n');
}
