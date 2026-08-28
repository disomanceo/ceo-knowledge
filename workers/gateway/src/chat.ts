const clean=(value:unknown,max=6000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export function cloudChatFallback(message:string, results:any[]):string {
  const text=clean(message,4000);
  const rows=Array.isArray(results)?results:[];
  if(rows.length){
    const lines=rows.slice(0,5).map((item:any,index:number)=>{
      const title=clean(item?.title||('ข้อมูล '+(index+1)),180);
      const body=clean(item?.content||item?.summary||item?.rationale||'',350);
      return (index+1)+'. '+title+(body?' — '+body:'');
    });
    return 'พบข้อมูลที่เกี่ยวข้องใน Ceo Knowledge:\n'+lines.join('\n');
  }
  if(/^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)(?:\s|[!.?]|$)/i.test(text))return 'สวัสดีครับ Ceo พร้อมแล้วครับ ตอนนี้ผมช่วยจำข้อมูล ค้น Knowledge ดูงานค้าง นัดหมาย และสถานะเครื่องได้';
  if(/(?:ทำอะไรได้|ช่วยอะไรได้|ความสามารถ|ใช้ยังไง|how can you help|what can you do)/i.test(text))return 'ตอนนี้ Ceo Cloud ช่วยได้หลัก ๆ คือ จำ/ค้นข้อมูลใน Ceo Knowledge, ดู Today, Tasks, Memory, Knowledge Graph, Devices และ Ceo Drive ครับ ส่วนการตอบ AI ทั่วไปต้องเปิด AI Provider เพิ่ม';
  return 'ตอนนี้ Chat บน Cloud อยู่ในโหมด Ceo Knowledge ครับ ผมหาข้อมูลเรื่องนี้ในคลังยังไม่เจอ แต่ระบบไม่ได้เสีย — คุณยังสั่ง “จำไว้…” ถามงานค้าง/นัดวันนี้ หรือค้นข้อมูลที่เคยเก็บไว้ได้ ส่วนการคุยตอบแบบ AI ทั่วไปจะเปิดได้เมื่อเพิ่ม AI Provider ให้ Cloud';
}
