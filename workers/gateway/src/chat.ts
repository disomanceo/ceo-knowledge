const clean=(value:unknown,max=6000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export function recallSearchQuery(message:string):string {
  const text=clean(message,4000);
  const stripped=text.replace(/[?？]/g,' ').replace(/(?:อะไร|ใคร|ที่ไหน|เมื่อไร|เมื่อไหร่|ยังไง|อย่างไร|เท่าไร|กี่|what|who|where|when|how)\s*$/i,'').replace(/\s+/g,' ').trim();
  return stripped.length>=4?stripped:text;
}

export function cloudChatFallback(message:string, results:any[]):string {
  const text=clean(message,4000);
  const rows=Array.isArray(results)?results:[];
  if(rows.length){
    const first=rows[0]||{},title=clean(first?.title||'ข้อมูลที่พบ',180),body=clean(first?.content||first?.summary||first?.rationale||'',700);
    const main=body&&body.toLocaleLowerCase()!==title.toLocaleLowerCase()?`${title} — ${body}`:title;
    const related=rows.slice(1,4).map((item:any)=>clean(item?.title||'',120)).filter(Boolean);
    return `จากความจำที่ตรงที่สุด: ${main}${related.length?`\nมีข้อมูลที่เกี่ยวข้องอีก ${rows.length-1} รายการ เช่น ${related.join(', ')}`:''}`;
  }  if(/^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)(?:\s|[!.?]|$)/i.test(text))return 'สวัสดีครับ Ceo พร้อมแล้วครับ ตอนนี้ผมช่วยจำข้อมูล ค้น Knowledge ดูงานค้าง นัดหมาย และสถานะเครื่องได้';
  if(/(?:ทำอะไรได้|ช่วยอะไรได้|ความสามารถ|ใช้ยังไง|how can you help|what can you do)/i.test(text))return 'ตอนนี้ Ceo Cloud ช่วยจำและค้น Ceo Knowledge, ดู Today, Tasks, Memory Graph, Devices และ Ceo Drive ได้ครับ ถ้าต้องการคุย AI ทั่วไปบน Cloud ให้ตั้ง AI Provider เพิ่ม';
  if(/(?:เมื่อวาน|เมื่อเช้า|เมื่อคืน|วันก่อน|ก่อนหน้านี้|จำได้ไหม|เคย|กินอะไร|กินข้าว|ไปไหน|อยู่กับใคร|คุยกับใคร|yesterday|last night|remember when|what did i)/i.test(text))return 'ยังไม่พบข้อมูลที่บันทึกไว้เกี่ยวกับเรื่องนี้ครับ ถ้าเหตุการณ์นี้เคยถูก Auto Memory เก็บไว้ ผมจะตอบจากความจำได้ทันที';
  return 'ยังไม่พบข้อมูลที่เกี่ยวข้องใน Ceo Knowledge ครับ ถ้าเป็นคำถามจากความจำ ผมจะตอบเมื่อมีข้อมูลบันทึกไว้; ถ้าเป็นคำถาม AI ทั่วไปบน Cloud ต้องตั้ง AI Provider เพิ่ม';
}
