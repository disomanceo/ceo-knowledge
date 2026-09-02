import { recallAction, recallAnswerField, recallSubjectQuery, type RecallAction, type RecallAnswerField } from './chat';

const clean=(v:unknown,max=3000)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export type ConversationMode='NEW_TOPIC'|'FOLLOW_UP'|'FIELD_FOLLOW_UP'|'ENTITY_SWITCH'|'CORRECTION'|'SAVE'|'UPDATE'|'CONFIRMATION'|'CLARIFICATION';
export interface ConversationStateV3{
  mode:ConversationMode;
  topic:string;
  action:RecallAction;
  answerField:RecallAnswerField;
  activeSourceId:string;
  activeQuery:string;
  previousUserQuery:string;
  previousAnswer:string;
  entityHints:string[];
  confidence:number;
  turnAge:number;
}
export type V3Turn={role?:string;text?:string;sourceId?:string;query?:string};

const ENTITY_STOP=new Set(['แล้ว','ล่ะ','ละ','ด้วย','หน่อย','ครับ','ค่ะ','คะ','นะ','อะไร','ที่ไหน','วันไหน','วันที่','กี่โมง','เวลา','เรื่อง','อันนั้น','เรื่องนั้น','มี','งาน','กิจกรรม']);
function entityHints(text:string):string[]{
  const normalized=clean(text,1200).toLocaleLowerCase().replace(/(โรงเรียน|วัด|ผอ\.?|ครู|พี่|ประเมิน|เลี้ยง|เกษียณ|ประชุม|อบรม|ส่ง|ทุน|นิเทศ)/gu,' $1 ').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ');
  return [...new Set(normalized.split(/\s+/).filter(t=>t.length>=2&&!ENTITY_STOP.has(t)))].slice(0,8);
}
function last<T>(items:T[],predicate:(x:T)=>boolean):T|undefined{for(let i=items.length-1;i>=0;i--)if(predicate(items[i]!))return items[i];return undefined}
export function deriveConversationStateV3(message:string,recentContext:V3Turn[]):ConversationStateV3{
  const text=clean(message,1200),turns=(Array.isArray(recentContext)?recentContext:[]).slice(-10).map(t=>({role:clean(t.role,20),text:clean(t.text,1200),sourceId:clean(t.sourceId,200),query:clean(t.query,1200)})).filter(t=>t.text);
  const prevUser=last(turns,t=>t.role==='user'),prevAssistant=last(turns,t=>t.role==='ceo'||t.role==='assistant');
  const field=recallAnswerField(text),subject=recallSubjectQuery(text),action=recallAction(text);
  const correction=/^(?:ไม่ใช่|แก้(?:เป็น)?|ขอแก้|หมายถึง|จริงๆ|จริง ๆ)/i.test(text);
  const save=/^(?:(?:ช่วย|ให้)?\s*)?(?:บันทึก|จำ|จด|เก็บ)(?:ไว้|ให้ด้วย|ด้วย|ให้หน่อย)?\b/i.test(text);
  const confirmation=/^(?:ใช่|ถูก|ถูกต้อง|โอเค|ตกลง|ยืนยัน)(?:ครับ|ค่ะ|คะ|นะ)?$/i.test(text);
  const bareField=field!=='general'&&subject.length<2;
  const entitySwitch=/^(?:แล้ว\s*)?(?:รร\.?|โรงเรียน|ดอน|บาง|ไผ่|พี่|ผอ\.?|ครู)\S*.{0,35}(?:ล่ะ|ละ|ด้วย)?$/iu.test(text)&&subject.length>=2;
  const followup=/^(?:แล้ว|แล้วก็|อันนั้น|เรื่องนั้น|เรื่องนี้|มัน|เขา|ส่วน)/u.test(text)||/(?:ล่ะ|ละ|ด้วย)$/u.test(text.replace(/[?？]|ครับ|ค่ะ|คะ|นะ/g,''));
  const shortUpdate=!field||field==='general'?(!/[?？]$/.test(text)&&text.length<=100&&Boolean(prevAssistant?.sourceId)&&/(?:ไปด้วย|คน|เวลา|ร้าน|สถานที่|เปลี่ยน|เพิ่ม|เอา|เป็น|นัด|ครู|นักเรียน)/u.test(text)):false;
  let mode:ConversationMode='NEW_TOPIC',confidence=1;
  if(correction){mode='CORRECTION';confidence=.97}else if(save){mode='SAVE';confidence=.98}else if(confirmation){mode='CONFIRMATION';confidence=.96}else if(bareField){mode='FIELD_FOLLOW_UP';confidence=Boolean(prevAssistant?.sourceId||prevUser)?.95:.45}else if(entitySwitch){mode='ENTITY_SWITCH';confidence=.9}else if(shortUpdate){mode='UPDATE';confidence=.88}else if(followup){mode='FOLLOW_UP';confidence=.82}
  const activeQuery=clean(prevAssistant?.query||prevUser?.query||prevUser?.text,1200);
  const topic=subject||recallSubjectQuery(activeQuery)||activeQuery;
  return{mode,topic,action:action!=='none'?action:recallAction(activeQuery),answerField:field,activeSourceId:clean(prevAssistant?.sourceId,200),activeQuery,previousUserQuery:clean(prevUser?.text,1200),previousAnswer:clean(prevAssistant?.text,1200),entityHints:entityHints(subject||text),confidence,turnAge:turns.length};
}

const ANCHOR_WEIGHTS:Record<string,number>={person:5,school:5,event:5,action:4,date:3,location:3,generic:1};
function classifyAnchor(token:string){if(/^(?:ประเมิน|ส่ง|เลี้ยง|เกษียณ|ประชุม|อบรม|นิเทศ|สอบ|ทดสอบ)$/.test(token))return'action';if(/(?:โรงเรียน|ดอนขาด|ดอนไข่เต่า|ไผ่มุ้ง|บางจิก)/.test(token))return'school';if(/(?:ผอ|ครู|พี่)/.test(token))return'person';if(/^\d{1,2}$/.test(token))return'date';if(/(?:ร้าน|จังหวัด|ตำบล|อำเภอ|bigc)/i.test(token))return'location';return'generic'}
export function weightedContextSupport(subject:string,conversationText:string):number{
  const tokens=entityHints(subject);if(!tokens.length)return 1;const hay=clean(conversationText,12000).toLocaleLowerCase();let total=0,supported=0;
  for(const token of tokens){const w=ANCHOR_WEIGHTS[classifyAnchor(token)]||1;total+=w;if(hay.includes(token))supported+=w}
  return total?supported/total:1;
}
