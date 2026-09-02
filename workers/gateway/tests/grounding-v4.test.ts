import { describe,expect,it } from 'vitest';
import { groundedAnswerCheck } from '../src/grounding-guard';

describe('V4 grounding guard',()=>{
  it('accepts dates and counts present in evidence',()=>{
    const evidence=[{title:'รับทุน ปตท.',fact:'วันที่ 11 กันยายน 2569 นำนักเรียนไป 10 คน และครูอ๊อฟไปด้วย'}];
    expect(groundedAnswerCheck('วันที่ 11 กันยายน 2569 ไปกับนักเรียน 10 คนครับ','รับทุน ปตท วันไหน',evidence).ok).toBe(true);
  });
  it('rejects invented dates or counts',()=>{
    const evidence=[{title:'รับทุน ปตท.',fact:'วันที่ 11 กันยายน 2569 นำนักเรียนไป 10 คน'}];
    const result=groundedAnswerCheck('วันที่ 12 กันยายน 2569 ไปกับนักเรียน 20 คนครับ','รับทุน ปตท วันไหน',evidence);
    expect(result.ok).toBe(false);expect(result.unsupported.some(x=>x.includes('12'))).toBe(true);expect(result.unsupported).toContain('20');
  });
});
