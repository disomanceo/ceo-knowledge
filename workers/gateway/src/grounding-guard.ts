const clean=(v:unknown,max=12000)=>String(v??'').normalize('NFC').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
const MONTHS='มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม.ค.|ก.พ.|มี.ค.|เม.ย.|พ.ค.|มิ.ย.|ก.ค.|ส.ค.|ก.ย.|ต.ค.|พ.ย.|ธ.ค.';
function criticalTokens(text:string){const source=clean(text);const nums=source.match(/\b\d{1,4}(?::\d{2})?\b/g)||[];const dates=source.match(new RegExp(`\\d{1,2}\\s*(?:${MONTHS})(?:\\s*\\d{2,4})?`,'g'))||[];return[...new Set([...nums,...dates].map(x=>x.replace(/\s+/g,' ').trim()))]}
export function groundedAnswerCheck(answer:string,question:string,evidence:unknown):{ok:boolean;unsupported:string[]}{
  const a=clean(answer),source=clean(`${question} ${JSON.stringify(evidence??[])}`,30000);if(!a)return{ok:false,unsupported:['EMPTY_ANSWER']};
  const unsupported=criticalTokens(a).filter(token=>!source.includes(token));return{ok:unsupported.length===0,unsupported};
}
