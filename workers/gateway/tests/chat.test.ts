import { describe, expect, it } from 'vitest';
import { cloudChatFallback, recallSearchQuery } from '../src/chat';

describe('cloud chat fallback',()=>{
  it('strips Thai recall question tails for Knowledge search',()=>{
    expect(recallSearchQuery('เมื่อวานกินข้าวกับอะไร')).toBe('เมื่อวานกินข้าวกับ');
    expect(recallSearchQuery('ไปกับใคร?')).toBe('ไปกับ');
    expect(recallSearchQuery('ดูภาพยนต์วันไหน')).toBe('ดูภาพยนต์');
    expect(recallSearchQuery('งาน PA กี่โมง')).toBe('งาน PA');
  });
  it('answers greetings without pretending Knowledge is missing',()=>{
    expect(cloudChatFallback('สวัสดี',[])).toContain('Ceo พร้อม');
    expect(cloudChatFallback('hello',[])).toContain('Ceo พร้อม');
  });
  it('explains capabilities when asked',()=>{
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('Ceo Knowledge');
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('AI Provider');
  });
  it('keeps unmatched general questions concise and explains AI Provider only when relevant',()=>{
    const answer=cloudChatFallback('ช่วยคิดชื่อโครงการใหม่',[]);
    expect(answer).toContain('ยังไม่พบข้อมูล');
    expect(answer).toContain('AI Provider');
    expect(answer).not.toContain('ระบบไม่ได้เสีย');
  });
  it('answers personal recall misses as a memory miss instead of a system warning',()=>{
    const answer=cloudChatFallback('เมื่อวานกินข้าวกับอะไร',[]);
    expect(answer).toContain('ยังไม่พบข้อมูลที่บันทึกไว้');
    expect(answer).toContain('Auto Memory');
    expect(answer).not.toContain('AI Provider');
  });
  it('formats matching Knowledge instead of mode warning',()=>{
    const answer=cloudChatFallback('runtime',[{title:'Runtime Plan',summary:'ทดสอบระบบ Runtime'}]);
    expect(answer).toContain('Runtime Plan');
    expect(answer).not.toContain('ระบบไม่ได้เสีย');
  });
  it('formats structured event recall with its Bangkok date',()=>{
    const answer=cloudChatFallback('ดูภาพยนต์วันไหน',[{kind:'events',title:'พานักเรียนไปดูภาพยนตร์ที่ Big C สุพรรณบุรี',start_at:'2026-09-06T17:00:00.000Z',all_day:true,location:'Big C สุพรรณบุรี'}]);
    expect(answer).toContain('7 กันยายน 2569');
    expect(answer).toContain('Big C สุพรรณบุรี');
  });
});
