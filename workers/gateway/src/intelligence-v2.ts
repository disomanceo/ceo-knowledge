const clean=(v:unknown,max=5000)=>String(v??'').normalize('NFC').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);

export type V2Intent='memory'|'event'|'task'|'news'|'current_fact'|'web'|'research'|'general';
export type V2Route='memory'|'direct'|'web'|'research'|'ai';
export type EventConstraint='dinner'|'retirement'|'assessment'|'meeting'|'training'|'test'|'none';
export interface IntelligenceV2 {normalized:string;intent:V2Intent;route:V2Route;answerField:'date'|'time'|'location'|'person'|'status'|'general';eventConstraint:EventConstraint;requestedCount:number;fresh:boolean;entities:string[];confidence:number}

const activityTerms=['ประเมิน','เลี้ยง','เกษียณ','นิเทศ','ประชุม','อบรม','รับทุน','ส่งเล่ม','สอบ','ทดสอบ'];
export function normalizeThaiInput(input:string):string{
  let t=clean(input);
  t=t.replace(/เกณียณ|เกษียน|เกษีณ/g,'เกษียณ').replace(/ภาพยนต์/g,'ภาพยนตร์').replace(/กินเลี้ยง/g,'กิน เลี้ยง');
  for(const term of activityTerms)t=t.replace(new RegExp(`(${term})`,'g'),' $1 ');
  return t.replace(/\s+/g,' ').trim();
}
export function requestedAnswerField(t:string):IntelligenceV2['answerField']{
  if(/(?:วันไหน|วันอะไร|เมื่อไหร่|เมื่อไร|วันที่เท่าไร)/.test(t))return'date';if(/(?:กี่โมง|เวลาไหน|เวลาเท่าไร)/.test(t))return'time';if(/(?:ที่ไหน|สถานที่|ร้านไหน|ร้านอะไร)/.test(t))return'location';if(/(?:ใคร|กับใคร)/.test(t))return'person';if(/(?:สถานะ|เสร็จหรือยัง|ถึงไหน)/.test(t))return'status';return'general';
}
export function eventConstraintOf(t:string):EventConstraint{
  if(/(?:กิน\s*เลี้ยง|งานเลี้ยง|เลี้ยงเกษียณ)/.test(t))return'dinner';if(/เกษียณ/.test(t))return'retirement';if(/ประเมิน|ตรวจประเมิน|\bPA\b/i.test(t))return'assessment';if(/ประชุม|นัด/.test(t))return'meeting';if(/อบรม|สัมมนา/.test(t))return'training';if(/สอบ|ทดสอบ/.test(t))return'test';return'none';
}
export function eventConstraintMatches(constraint:EventConstraint,row:any):boolean{
  if(constraint==='none')return true;const hay=clean([row?.event_type,row?.title,row?.description,row?.content,row?.summary].filter(Boolean).join(' '),6000).toLocaleLowerCase();
  if(constraint==='dinner')return/(?:กิน\s*เลี้ยง|งานเลี้ยง|เลี้ยงเกษียณ|dinner|party)/i.test(hay);
  if(constraint==='retirement')return/เกษียณ|retire/i.test(hay);if(constraint==='assessment')return/ประเมิน|ตรวจประเมิน|\bpa\b/i.test(hay);if(constraint==='meeting')return/ประชุม|นัด|meeting|appointment/i.test(hay);if(constraint==='training')return/อบรม|สัมมนา|training|seminar/i.test(hay);return/สอบ|ทดสอบ|test|exam/i.test(hay);
}
function countFrom(t:string){const m=t.match(/(?:ขอ|เอา|สัก|ประมาณ|เด่น(?:ๆ)?|ข่าว)?\s*(\d{1,2})\s*(?:เรื่อง|รายการ|ข่าว|ข้อ)/);return Math.max(1,Math.min(10,Number(m?.[1]||3)))}
function isFresh(t:string){return/(?:วันนี้|ตอนนี้|ล่าสุด|ปัจจุบัน|ขณะนี้|เด่น|ใหม่|this week|today|current|latest|now)/i.test(t)}
export function analyzeIntelligenceV2(input:string):IntelligenceV2{
  const normalized=normalizeThaiInput(input),field=requestedAnswerField(normalized),constraint=eventConstraintOf(normalized),fresh=isFresh(normalized);
  let intent:V2Intent='general',route:V2Route='ai',confidence=.78;
  if(/ข่าว|news/i.test(normalized)){intent='news';route='web';confidence=.98}
  else if(/(?:สภาพอากาศ|อากาศ|ฝน|อุณหภูมิ|ทอง|หุ้น|ค่าเงิน|ราคาน้ำมัน|น้ำมัน|คริปโต|ราคา).*(?:วันนี้|ตอนนี้|ล่าสุด|เท่าไร|เท่าไหร่)|(?:วันนี้|ตอนนี้|ล่าสุด).*(?:ราคา|อากาศ|หุ้น|ทอง)/i.test(normalized)){intent='current_fact';route='direct';confidence=.95}
  else if(/(?:วิจัย|เจาะลึก|หลายแหล่ง|วิเคราะห์เชิงลึก|research)/i.test(normalized)){intent='research';route='research';confidence=.94}
  else if(constraint!=='none'||field!=='general'||/(?:โรงเรียน|ผอ\.?|ครู|นัด|กิจกรรม)/.test(normalized)){intent='event';route='memory';confidence=.88}
  else if(/(?:ช่วย)?(?:ค้น|หา|แนะนำ|รีวิว|เปรียบเทียบ)|(?:เว็บ|อินเทอร์เน็ต|ออนไลน์)|(?:ล่าสุด|ปัจจุบัน|ตอนนี้).*(?:อะไร|ไหน|อย่างไร|ยังไง|ให้หน่อย|บ้าง)?/i.test(normalized)&&!/(?:ความจำ|นัด|งานค้าง)/.test(normalized)){intent='web';route='web';confidence=.84}
  else if(/(?:งานค้าง|ต้องทำ|task|todo)/i.test(normalized)){intent='task';route='memory';confidence=.95}
  return{normalized,intent,route,answerField:field,eventConstraint:constraint,requestedCount:intent==='news'?countFrom(normalized):3,fresh,entities:[],confidence};
}
