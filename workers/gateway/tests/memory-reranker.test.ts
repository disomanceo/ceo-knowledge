import { describe,expect,it } from 'vitest';
import { deterministicMemoryRerank } from '../src/memory-reranker';

describe('semantic memory reranker',()=>{
  it('filters PA candidates by the requested action before answer composition',()=>{
    const rows=[
      {id:'assess14',kind:'events',title:'ประเมิน PA โรงเรียนบางจิก',description:'ประเมิน PA',start_at:'2026-09-14T02:00:00Z'},
      {id:'send17',kind:'events',title:'ส่งเล่ม PA ให้สำนักงานเขต',description:'กำหนดส่งเล่ม PA',start_at:'2026-09-17T02:00:00Z'},
      {id:'assess17',kind:'events',title:'ประเมิน PA โรงเรียนวัดดอนขาด',description:'ประเมิน PA',start_at:'2026-09-17T02:00:00Z'},
    ];
    const r=deterministicMemoryRerank('PA ส่งเมื่อไหร่',rows);
    expect(r.mode).toBe('action-filter');expect(r.action).toBe('send');expect(r.rows.map(x=>x.id)).toEqual(['send17']);expect(r.selectedId).toBe('send17');
  });
  it('keeps broad candidates when no action is expressed',()=>{const rows=[{id:'a',title:'PA A'},{id:'b',title:'PA B'}];const r=deterministicMemoryRerank('PA มีอะไรบ้าง',rows);expect(r.rows).toHaveLength(2);expect(r.mode).toBe('score')});
});
