import { describe,expect,it } from 'vitest';
import { analyzeIntelligenceV2 } from '../src/intelligence-v2';

const cases:[string,string,string][]=[
  ['ข่าววันนี้มีอะไรบ้าง','news','web'],['ขอข่าวเด่น 5 เรื่อง','news','web'],['ข่าว AI ล่าสุด','news','web'],
  ['ราคาน้ำมันวันนี้','current_fact','direct'],['หุ้นวันนี้เป็นยังไง','current_fact','direct'],['อากาศสุพรรณบุรีวันนี้','current_fact','direct'],
  ['ช่วยค้นมือถือรุ่นใหม่','web','web'],['หารีวิวโน้ตบุ๊ก','web','web'],['เปรียบเทียบจอ OLED กับ Mini LED','web','web'],
  ['วิเคราะห์เชิงลึกเรื่อง local AI','research','research'],['เจาะลึกแนวโน้ม AI agent','research','research'],
  ['กินเลี้ยงพี่เผือกวันไหน','event','memory'],['ดอนขาดประเมินวันไหน','event','memory'],['ประชุมครูวันไหน','event','memory'],
  ['งานค้างมีอะไรบ้าง','task','memory'],['ต้องทำอะไรวันนี้','task','memory'],
];
describe('I8 intent regression corpus',()=>{for(const [query,intent,route] of cases)it(query,()=>{const r=analyzeIntelligenceV2(query);expect(r.intent).toBe(intent);expect(r.route).toBe(route)})});
