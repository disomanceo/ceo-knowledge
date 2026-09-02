import { describe,expect,it } from 'vitest';
import { deriveConversationStateV3, weightedContextSupport } from '../src/conversation-state-v3';
import { memoryQualityGate, scoreMemoryCandidates } from '../src/candidate-scorer';
import { detectMemoryRelation } from '../src/memory-relations';

describe('Ceo Context & Retrieval V3',()=>{
  it('keeps active source for bare field follow-ups',()=>{
    const state=deriveConversationStateV3('ร้านอาหารอะไร',[{role:'user',text:'วันที่ 18 ที่ไหนนะ'},{role:'ceo',text:'งานเลี้ยงเกษียณ ผอ. เผือก',sourceId:'evt18',query:'งานเลี้ยงเกษียณ ผอ. เผือก วันที่ 18'}]);
    expect(state.mode).toBe('FIELD_FOLLOW_UP');expect(state.answerField).toBe('location');expect(state.activeSourceId).toBe('evt18');
  });
  it('recognizes contextual append and correction relations',()=>{
    expect(detectMemoryRelation('นำเด็กไป 10 คนนะ ครูอ๊อฟไปด้วย')).toBe('APPEND');
    expect(detectMemoryRelation('เปลี่ยนร้านเป็นร้านอาหารกัลยาฟ้าใส')).toBe('CORRECT');
    expect(detectMemoryRelation('ไม่ใช่ ขอแก้เป็นวันที่ 17')).toBe('CORRECT');
  });
  it('weights supported semantic anchors higher than generic words',()=>{
    const good=weightedContextSupport('ประเมิน PA โรงเรียนวัดดอนขาด','ก่อนหน้านี้ถามเรื่องประเมิน PA โรงเรียนวัดดอนขาด');
    const bad=weightedContextSupport('งานเลี้ยง ผอ.เผือก','ก่อนหน้านี้ถามเรื่องนิเทศครูดาว');
    expect(good).toBeGreaterThan(.8);expect(bad).toBeLessThan(.5);
  });
  it('accepts a clear action+entity candidate and rejects weak unrelated candidates',()=>{
    const strong=scoreMemoryCandidates('ส่ง PA วันไหน',[{id:'send17',kind:'events',title:'ส่งเล่ม PA ให้สำนักงานเขต',description:'กำหนดส่งเอกสาร PA',start_at:'2026-09-17T02:00:00Z',metadata:{}}]);
    expect(memoryQualityGate(strong).decision).toBe('accept');
    const weak=scoreMemoryCandidates('ดอนขาดประเมินวันไหน',[{id:'x',kind:'memories',title:'ซื้ออุปกรณ์สำนักงาน',content:'รายการทั่วไป'}]);
    expect(memoryQualityGate(weak).decision).toBe('reject');
  });
});
