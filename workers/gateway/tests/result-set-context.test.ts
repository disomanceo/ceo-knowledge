import { describe,expect,it } from 'vitest';
import { contextListAnswer, contextResultSet, selectContextResult } from '../src/result-set-context';

describe('result set conversation context',()=>{
  const retirement=[
    {id:'e18',kind:'events',title:'งานเลี้ยงเกษียณ ผอ. เผือก',start_at:'2026-09-18T10:00:00Z',location:'ร้านอาหารกัลยาฟ้าใส'},
    {id:'e25',kind:'events',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',start_at:'2026-09-25T02:00:00Z',location:'โรงเรียน'},
  ];
  it('selects one prior candidate by explicit date discriminator',()=>{
    const refs=contextResultSet(retirement);
    expect(selectContextResult('วันที่ 25 จัดที่ไหน',refs)?.id).toBe('e25');
    expect(selectContextResult('แล้ววันที่ 18 ล่ะ',refs)?.id).toBe('e18');
  });
  it('expands an aggregate school result set instead of asking clarification',()=>{
    const rows=[
      {id:'p14',kind:'events',title:'ประเมิน PA โรงเรียนวัดบางจิก',start_at:'2026-09-14T02:00:00Z'},
      {id:'p15',kind:'events',title:'ประเมิน PA โรงเรียนวัดไผ่มุ้ง',start_at:'2026-09-15T02:00:00Z'},
      {id:'p16',kind:'events',title:'ประเมิน PA โรงเรียนวัดดอนไข่เต่า',start_at:'2026-09-16T02:00:00Z'},
      {id:'p17',kind:'events',title:'ประเมิน PA โรงเรียนวัดดอนขาด',start_at:'2026-09-17T02:00:00Z'},
    ];
    const answer=contextListAnswer('ที่ไหนบ้าง',rows);
    expect(answer).toContain('4 แห่ง');expect(answer).toContain('บางจิก');expect(answer).toContain('ไผ่มุ้ง');expect(answer).toContain('ดอนไข่เต่า');expect(answer).toContain('ดอนขาด');
  });
});
