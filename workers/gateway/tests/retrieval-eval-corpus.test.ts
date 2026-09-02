import { describe,expect,it } from 'vitest';
import { evaluateRetrieval } from '../src/retrieval-eval';

const events=[
 {id:'ptt',kind:'events',title:'รับทุน ปตท.',description:'วันที่ 11 กันยายน 2569 นำเด็กไป 10 คน ครูอ๊อฟไปด้วย',start_at:'2026-09-11T02:00:00Z'},
 {id:'pa14',kind:'events',title:'ประเมิน PA โรงเรียนวัดบางจิก',description:'ประเมิน PA ครู โรงเรียนบางจิก',start_at:'2026-09-14T02:00:00Z'},
 {id:'pa15',kind:'events',title:'ประเมิน PA โรงเรียนวัดไผ่มุ้ง',description:'ประเมิน PA ครู โรงเรียนไผ่มุ้ง',start_at:'2026-09-15T02:00:00Z'},
 {id:'pa16',kind:'events',title:'ประเมิน PA โรงเรียนวัดดอนไข่เต่า',description:'ประเมิน PA ครู โรงเรียนดอนไข่เต่า',start_at:'2026-09-16T02:00:00Z'},
 {id:'pa17',kind:'events',title:'ประเมิน PA โรงเรียนวัดดอนขาด',description:'ประเมิน PA ครู โรงเรียนดอนขาด',start_at:'2026-09-17T02:00:00Z'},
 {id:'send17',kind:'events',title:'ส่งเล่ม PA ให้สำนักงานเขต',description:'กำหนดส่งเล่ม PA ให้สำนักงานเขต',start_at:'2026-09-17T02:00:00Z'},
 {id:'retire18',kind:'events',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'งานเลี้ยงเกษียณ ผอ.ณัฐพงษ์ พี่เผือก ร้านอาหารกัลยาฟ้าใส',location:'ร้านอาหารกัลยาฟ้าใส',start_at:'2026-09-18T10:00:00Z'},
 {id:'retire25',kind:'events',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',description:'งานเกษียณที่โรงเรียน',location:'โรงเรียน',start_at:'2026-09-25T02:00:00Z'},
 {id:'movie7',kind:'events',title:'พานักเรียนไปดูภาพยนตร์ที่ Big C สุพรรณบุรี',description:'นัดนักเรียนเวลา 7.00 น. ไป Big C',location:'Big C สุพรรณบุรี',start_at:'2026-09-07T00:00:00Z'},
 {id:'teach2',kind:'events',title:'นิเทศการสอนครูดาว คาบที่ 3',description:'นิเทศการสอนครูดาว',start_at:'2026-09-02T00:00:00Z'},
 {id:'fund',kind:'events',title:'ส่งเอกสารทุนการศึกษา',description:'กำหนดส่งเอกสารทุน',start_at:'2026-09-12T02:00:00Z'},
 {id:'meeting',kind:'events',title:'ประชุมครูประจำเดือน',description:'ประชุมครูที่โรงเรียน',start_at:'2026-09-10T02:00:00Z'},
];
const groups:Array<[string,string[]]>= [
 ['ptt',['รับทุน ปตท วันไหน','ทุนปตทรับวันไหน','รับทุนปตทวันไหน','ปตท รับทุน วันที่เท่าไร','รับทุน ปตท. เมื่อไหร่']],
 ['pa14',['บางจิกประเมินวันไหน','ประเมิน PA บางจิกวันไหน','รร บางจิก ประเมิน pa','โรงเรียนวัดบางจิกประเมินเมื่อไหร่','บางจิก PA วันที่เท่าไร']],
 ['pa15',['ไผ่มุ้งประเมินวันไหน','ประเมิน PA ไผ่มุ้ง','รร ไผ่มุ้ง ประเมินวันอะไร','โรงเรียนวัดไผ่มุ้ง PA','ไผ่มุ้งประเมิน PA เมื่อไหร่']],
 ['pa16',['ดอนไข่เต่าประเมินวันไหน','ประเมิน PA ดอนไข่เต่า','โรงเรียนวัดดอนไข่เต่าประเมิน','รร ดอนไข่เต่า PA วันไหน','ดอนไข่เต่าประเมินเมื่อไหร่']],
 ['pa17',['ดอนขาดประเมินวันไหน','ประเมิน PA ดอนขาด','โรงเรียนวัดดอนขาดประเมิน','รร ดอนขาด PA วันไหน','ดอนขาดประเมินเมื่อไหร่']],
 ['send17',['ส่ง PA วันไหน','PA ส่งเมื่อไหร่','ส่งเล่ม PA วันไหน','กำหนดส่ง PA วันที่เท่าไร','ต้องส่งเล่ม PA เมื่อไหร่']],
 ['retire18',['กินเลี้ยงพี่เผือกวันไหน','งานเลี้ยงเกษียณ ผอ เผือก','กินเลี้ยงเกษียณพี่เผือก','งานเลี้ยง ผอ ณัฐพงษ์','เกษียณพี่เผือก ร้านอาหารอะไร']],
 ['movie7',['วันที่ 7 ไป Big C','พานักเรียนดูหนังวันไหน','ดูภาพยนตร์ Big C วันไหน','นัดนักเรียนไป Big C','กิจกรรม Big C วันที่เท่าไร']],
 ['teach2',['นิเทศครูดาววันไหน','ครูดาวคาบที่ 3','นิเทศการสอนครูดาว','วันที่ 2 นิเทศอะไร','นิเทศครูดาววันที่เท่าไร']],
 ['meeting',['ประชุมครูวันไหน','ประชุมครูประจำเดือน','นัดประชุมครู','ประชุมที่โรงเรียนวันไหน','กำหนดประชุมครู']],
 ['fund',['ส่งเอกสารทุนวันไหน','เอกสารทุนกำหนดส่ง','กำหนดส่งทุน','ส่งทุนการศึกษาเมื่อไหร่','เอกสารทุนวันที่เท่าไร']],
];
const cases=groups.flatMap(([id,queries])=>queries.map(query=>({query,expectedIds:[id],candidates:events})));

describe('retrieval golden corpus v3.4',()=>{
 it('keeps 50+ secretary queries in top 3 and prevents false absence',()=>{
   expect(cases.length).toBeGreaterThanOrEqual(50);
   const result=evaluateRetrieval(cases);
   expect(result.recallAt3).toBe(1);
   expect(result.recallAt10).toBe(1);
   expect(result.falseAbsenceRate).toBe(0);
   expect(result.mrr).toBeGreaterThan(.88);
 });
 it('does not retrieve superseded knowledge as current',()=>{
   const stale={id:'old',kind:'memory_nodes',title:'ส่ง PA วันที่ 14',content:'ข้อมูลเก่า',lifecycle_status:'superseded',superseded_by:'new'};
   const current={id:'new',kind:'memory_nodes',title:'ส่งเล่ม PA วันที่ 17',content:'ข้อมูลปัจจุบัน',lifecycle_status:'current'};
   const result=evaluateRetrieval([{query:'ส่ง PA วันไหน',expectedIds:['new'],candidates:[stale,current]}]);
   expect(result.recallAt1).toBe(1);expect(result.falseAbsenceRate).toBe(0);
 });
});
