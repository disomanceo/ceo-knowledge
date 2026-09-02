const clean=(value:unknown,max=6000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const normalizeThaiRecall=(value:string)=>value.replace(/เกณียณ|เกษียน|เกษีณ/g,'เกษียณ').replace(/ภาพยนต์/g,'ภาพยนตร์');

export type RecallAnswerField='date'|'time'|'location'|'person'|'status'|'general';

function stripMemoryPrefix(value:unknown):string {
  return clean(value,1200).replace(/^(?:(?:memory|question)\s*:\s*)+/i,'').trim();
}

export function recallAnswerField(message:string):RecallAnswerField {
  const text=clean(message,4000);
  if(/(?:ที่ไหน|สถานที่(?:ไหน)?|อยู่ไหน|จัดที่ไหน|ไปที่ไหน|ร้าน(?:อาหาร)?(?:ไหน|อะไร)|กินเลี้ยงที่ไหน)(?:บ้าง)?\s*[?？]?(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i.test(text))return'location';
  if(/(?:กี่โมง|เวลาไหน|เวลาเท่าไร|เวลาอะไร)(?:บ้าง)?\s*[?？]?(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i.test(text))return'time';
  if(/(?:วันไหน|วันอะไร|วันที่(?:เท่าไร|อะไร)|เมื่อไร|เมื่อไหร่)(?:บ้าง)?\s*[?？]?(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i.test(text))return'date';
  if(/(?:ใคร|ใครบ้าง|กับใคร|พาใคร|ผู้เกี่ยวข้อง(?:มี)?ใครบ้าง)(?:บ้าง)?\s*[?？]?(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i.test(text))return'person';
  if(/(?:สถานะ(?:อะไร)?|เสร็จหรือยัง|เรียบร้อยหรือยัง|ทำถึงไหน|เป็นยังไงบ้าง)(?:บ้าง)?\s*[?？]?(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i.test(text))return'status';
  return'general';
}

export function recallSubjectQuery(message:string):string {
  const text=normalizeThaiRecall(clean(message,4000)).replace(/[?？]/g,' ');
  return text
    .replace(/\s*(?:อะไรบ้าง|อะไร|ใครบ้าง|ใคร|ที่ไหน|สถานที่(?:ไหน)?|อยู่ไหน|จัดที่ไหน|ไปที่ไหน|ร้าน(?:อาหาร)?(?:ไหน|อะไร)|กินเลี้ยงที่ไหน|วันไหน|วันอะไร|วันที่(?:เท่าไร|อะไร)|เมื่อไร|เมื่อไหร่|กี่โมง|เวลาไหน|เวลาเท่าไร|เวลาอะไร|สถานะ(?:อะไร)?|เสร็จหรือยัง|เรียบร้อยหรือยัง|ทำถึงไหน|เป็นยังไงบ้าง)(?:บ้าง)?\s*(?:ครับ|คะ|ค่ะ|นะ)?\s*$/i,'')
    .replace(/\s*(?:จัด(?:งาน|ขึ้น)?|เริ่ม(?:งาน)?|มี(?:งาน)?|นัด(?:หมาย)?|(?:ต้อง)?ส่ง|กำหนด|เกิด(?:ขึ้น)?)\s*$/i,'')
    .replace(/^(?:แล้ว|แล้วก็|แล้วมัน|แล้วอันนั้น|อันนั้น|เรื่องนั้น|มัน)\s*/i,'')
    .replace(/^(?:จัดงาน|จัด|เริ่มงาน|เริ่ม|มีงาน|มี|นัดหมาย|นัด|กำหนด)\s*/i,'')
    .replace(/\s+/g,' ')
    .trim();
}

export function isBareRecallFieldQuestion(message:string):boolean {
  return recallAnswerField(message)!=='general'&&recallSubjectQuery(message).length<2;
}

export function recallSearchQuery(message:string):string {
  const text=clean(message,4000);
  const stripped=recallSubjectQuery(text);
  let subject=stripped;
  if(recallAnswerField(text)==='date'){
    subject=subject.replace(/^วัน(?:ที่)?(?=\S)/u,'').trim();
    if(/^ทุน(?=\S)/u.test(subject))subject=subject.replace(/^ทุน(?=\S)/u,'ทุน ');
  }
  return subject.length>=2?subject:text.replace(/[?？]/g,' ').replace(/\s+/g,' ').trim();
}

function normalizeRecallMatchText(value:string):string {
  return normalizeThaiRecall(clean(value,5000).toLocaleLowerCase())
    .replace(/กินเลี้ยง/g,'เลี้ยง ')
    .replace(/เกษียณงาน/g,'เกษียณ งาน')
    .replace(/(ประเมิน|เลี้ยง|เกษียณ|นิเทศ|ประชุม|อบรม|รับทุน|ส่งเล่ม|สอบ|ทดสอบ)/g,' $1 ')
    .replace(/(?:พี่|ครู|ผอ\.?)[\s]*(?=[\p{L}\p{N}])/gu,' ')
    .replace(/big\s*c/g,'bigc')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const RECALL_MATCH_STOPWORDS=new Set(['งาน','เรื่อง','กิจกรรม','นัด','กำหนด','การ','ของ','ที่','ไป','มี','จัด','เริ่ม','ต้อง','ช่วย','ดู','ถาม','หน่อย','ครับ','ค่ะ','คะ','นะ']);

export function recallMatchTokens(message:string):string[] {
  return [...new Set(normalizeRecallMatchText(recallSearchQuery(message)).split(/\s+/).filter(token=>token.length>=2&&!RECALL_MATCH_STOPWORDS.has(token)))];
}

export function recallSearchTerms(message:string):string {
  return recallMatchTokens(message).join(' ');
}

export function recallSubjectMatches(message:string,row:any):boolean {
  const tokens=recallMatchTokens(message);
  if(!tokens.length)return true;
  const hay=normalizeRecallMatchText([row?.title,row?.description,row?.content,row?.summary,row?.rationale,row?.location,row?.waiting_for].filter(Boolean).join(' '));
  return tokens.every(token=>hay.includes(token));
}
function thaiDate(value:unknown):string {
  const date=new Date(String(value||''));
  if(Number.isNaN(date.getTime()))return'';
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}).format(date);
}
function thaiTime(value:unknown):string {
  const date=new Date(String(value||''));
  if(Number.isNaN(date.getTime()))return'';
  return date.toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});
}
function rowText(row:any):string {
  return stripMemoryPrefix(row?.content||row?.summary||row?.rationale||row?.description||row?.title||'');
}
function firstEvent(rows:any[],predicate:(row:any)=>boolean=()=>true){return rows.find(row=>row?.kind==='events'&&predicate(row));}
function firstTask(rows:any[],predicate:(row:any)=>boolean=()=>true){return rows.find(row=>row?.kind==='tasks'&&predicate(row));}
function isAutoMemoryRow(row:any){return row?.metadata?.autoMemory===true||(Array.isArray(row?.tags)&&row.tags.includes('auto-memory'));}

export function composeRecallAnswer(message:string,results:any[]):{answer:string;confident:boolean;field:RecallAnswerField;sourceId:string} {
  const rows=Array.isArray(results)?results:[];
  const field=recallAnswerField(message);
  if(!rows.length)return{answer:'',confident:false,field,sourceId:''};

  if(field==='location'){
    const manualEvent=firstEvent(rows,row=>!isAutoMemoryRow(row));
    if(manualEvent){
      const location=clean(manualEvent?.location,500);
      if(location)return{answer:`ที่ ${location}ครับ`,confident:true,field,sourceId:clean(manualEvent.id,200)};
      const text=`${clean(manualEvent?.title,500)} ${clean(manualEvent?.description,2000)} ${rowText(manualEvent)}`;
      const unknown=/(?:สถานที่|ร้านอาหาร|ร้าน)[^\n]{0,80}(?:ยังไม่ระบุ|ยังไม่ได้ระบุ|ยังไม่ได้กำหนด|ไม่ระบุ|จะแจ้งภายหลัง)|(?:ยังไม่ระบุ|ยังไม่ได้กำหนด)[^\n]{0,80}(?:สถานที่|ร้านอาหาร|ร้าน)/i.test(text);
      if(unknown){
        const hasAutoConflict=rows.some(row=>row?.kind==='events'&&isAutoMemoryRow(row)&&!/(?:ยังไม่ระบุ|ยังไม่ได้กำหนด|จะแจ้งภายหลัง)/i.test(`${clean(row?.title,500)} ${clean(row?.description,2000)} ${rowText(row)}`));
        return{answer:hasAutoConflict?'ข้อมูลที่ยืนยันไว้ระบุว่ายังไม่ได้กำหนดร้านอาหารครับ พบ Auto Memory อีกชุดที่ขัดแย้ง จึงไม่นำข้อมูลชุดนั้นมาใช้':'สถานที่ร้านอาหารยังไม่ระบุครับ',confident:true,field,sourceId:clean(manualEvent.id,200)};
      }
    }
    const event=firstEvent(rows,row=>Boolean(clean(row?.location,500)));
    if(event)return{answer:`ที่ ${clean(event.location,500)}ครับ`,confident:true,field,sourceId:clean(event.id,200)};
  }
  if(field==='date'){
    const locked=rows.find(row=>row?._sourceLocked===true&&row?.kind==='events'&&row?.start_at);
    if(locked){const when=thaiDate(locked.start_at);if(when)return{answer:`วันที่ ${when}ครับ`,confident:true,field,sourceId:clean(locked.id,200)};}
    const datedEvents=rows.filter(row=>row?.kind==='events'&&row?.start_at).slice(0,4);
    const uniqueEvents=datedEvents.filter((row,index,list)=>list.findIndex(other=>thaiDate(other.start_at)===thaiDate(row.start_at)&&clean(other.title,180)===clean(row.title,180))===index);
    if(uniqueEvents.length>1){const items=uniqueEvents.map((row:any)=>`• ${clean(row.title,180)} — ${thaiDate(row.start_at)}`).join('\n');return{answer:`มี ${uniqueEvents.length} งานครับ\n${items}`,confident:true,field,sourceId:clean(uniqueEvents[0]?.id,200)};}
    const event=uniqueEvents[0]||firstEvent(rows,row=>Boolean(row?.start_at));
    if(event){const when=thaiDate(event.start_at);if(when)return{answer:`วันที่ ${when}ครับ`,confident:true,field,sourceId:clean(event.id,200)};}
    const task=firstTask(rows,row=>Boolean(row?.due_at));
    if(task){const when=thaiDate(task.due_at);if(when)return{answer:`กำหนดวันที่ ${when}ครับ`,confident:true,field,sourceId:clean(task.id,200)};}
  }
  if(field==='time'){
    const event=firstEvent(rows,row=>Boolean(row?.start_at));
    if(event){
      if(event?.all_day)return{answer:'กิจกรรมนี้ยังไม่ได้ระบุเวลาไว้ครับ',confident:true,field,sourceId:clean(event.id,200)};
      const time=thaiTime(event.start_at);if(time)return{answer:`เวลา ${time} น. ครับ`,confident:true,field,sourceId:clean(event.id,200)};
    }
    const task=firstTask(rows,row=>Boolean(row?.due_at));
    if(task){const time=thaiTime(task.due_at);if(time)return{answer:`กำหนดเวลา ${time} น. ครับ`,confident:true,field,sourceId:clean(task.id,200)};}
  }
  if(field==='status'){
    const task=firstTask(rows,row=>Boolean(row?.status));
    if(task)return{answer:`สถานะตอนนี้ ${clean(task.status,80)} ครับ`,confident:true,field,sourceId:clean(task.id,200)};
    const event=firstEvent(rows,row=>Boolean(row?.status));
    if(event)return{answer:`สถานะกิจกรรมตอนนี้ ${clean(event.status,80)} ครับ`,confident:true,field,sourceId:clean(event.id,200)};
  }
  if(field==='person'){
    const row=rows.find(item=>/(?:ครู|นักเรียน|ผอ\.|ผอ\s|นาย|นาง|นางสาว|คุณ|ผู้)/i.test(rowText(item)));
    if(row){const text=rowText(row);if(text)return{answer:`ข้อมูลที่บันทึกไว้ระบุว่า ${text.replace(/[。.]$/,'')}ครับ`,confident:true,field,sourceId:clean(row.id||row.node_id,200)};}
  }

  const first=rows[0]||{};
  const title=stripMemoryPrefix(first?.title||'ข้อมูลที่พบ');
  const body=rowText(first);
  if(first?.kind==='events'&&first?.start_at){
    const when=thaiDate(first.start_at),time=first?.all_day?'':thaiTime(first.start_at),location=clean(first?.location,200);
    return{answer:`${title}${when?` วันที่ ${when}`:''}${time?` เวลา ${time} น.`:''}${location?` ที่ ${location}`:''}ครับ`,confident:true,field,sourceId:clean(first.id,200)};
  }
  if(first?.kind==='tasks'){
    const due=first?.due_at?thaiDate(first.due_at):'';
    return{answer:`${title}${due?` กำหนดวันที่ ${due}`:''}ครับ`,confident:true,field,sourceId:clean(first.id,200)};
  }
  const main=body&&body.toLocaleLowerCase()!==title.toLocaleLowerCase()?body:title;
  return{answer:main?`${main.replace(/ครับ\s*$/,'').replace(/[。.]$/,'')}ครับ`:'',confident:Boolean(main),field,sourceId:clean(first.id||first.node_id,200)};
}

export function cloudChatFallback(message:string, results:any[]):string {
  const text=clean(message,4000);
  const direct=composeRecallAnswer(message,results);
  if(direct.answer)return direct.answer;
  if(/^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)(?:\s|[!.?]|$)/i.test(text))return 'สวัสดีครับ Ceo พร้อมแล้วครับ ตอนนี้ผมช่วยจำข้อมูล ค้น Knowledge ดูงานค้าง นัดหมาย และสถานะเครื่องได้';
  if(/(?:ทำอะไรได้|ช่วยอะไรได้|ความสามารถ|ใช้ยังไง|how can you help|what can you do)/i.test(text))return 'ตอนนี้ Ceo Cloud ช่วยจำและค้น Ceo Knowledge, ดู Today, Tasks, Memory Graph, Devices และ Ceo Drive ได้ครับ ถ้าต้องการคุย AI ทั่วไปบน Cloud ให้ตั้ง AI Provider เพิ่ม';
  if(/(?:เมื่อวาน|เมื่อเช้า|เมื่อคืน|วันก่อน|ก่อนหน้านี้|จำได้ไหม|เคย|กินอะไร|กินข้าว|ไปไหน|อยู่กับใคร|คุยกับใคร|yesterday|last night|remember when|what did i)/i.test(text))return 'ยังไม่พบข้อมูลที่บันทึกไว้เกี่ยวกับเรื่องนี้ครับ';
  return 'ยังไม่พบข้อมูลที่เกี่ยวข้องใน Ceo Knowledge ครับ';
}
