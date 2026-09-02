import { describe, expect, it } from 'vitest';
import { cloudChatFallback, composeRecallAnswer, isBareRecallFieldQuestion, recallAnswerField, recallSearchQuery, recallSearchTerms, recallSubjectMatches, recallSubjectQuery } from '../src/chat';

describe('cloud chat fallback',()=>{
  it('strips Thai recall question tails for Knowledge search',()=>{
    expect(recallSearchQuery('เมื่อวานกินข้าวกับอะไร')).toBe('เมื่อวานกินข้าวกับ');
    expect(recallSearchQuery('ไปกับใคร?')).toBe('ไปกับ');
    expect(recallSearchQuery('ดูภาพยนต์วันไหน')).toBe('ดูภาพยนตร์');
    expect(recallSearchQuery('งานเกณียณวันไหน')).toBe('งานเกษียณ');
    expect(recallSearchQuery('งานเกษียณจัดวันไหน')).toBe('งานเกษียณ');
    expect(recallSearchQuery('จัดงานเกษียณวันไหน')).toBe('เกษียณ');
    expect(recallSearchQuery('งานเกษียณเริ่มกี่โมง')).toBe('งานเกษียณ');
    expect(recallSearchQuery('งาน PA ต้องส่งวันไหน')).toBe('งาน PA');
    expect(recallAnswerField('วันไหนบ้าง')).toBe('date');
    expect(isBareRecallFieldQuestion('วันไหนบ้าง')).toBe(true);
    expect(recallSearchQuery('งาน PA กี่โมง')).toBe('งาน PA');
    expect(recallSearchQuery('วันทุนปตท วันไหน')).toBe('ทุน ปตท');
    expect(recallSubjectQuery('ที่ไหน')).toBe('');
    expect(isBareRecallFieldQuestion('ที่ไหน')).toBe(true);
  });
  it('detects requested answer fields',()=>{
    expect(recallAnswerField('ดูภาพยนต์วันไหน')).toBe('date');
    expect(recallAnswerField('ดูภาพยนต์ที่ไหน')).toBe('location');
    expect(recallAnswerField('เริ่มกี่โมง')).toBe('time');
  });
  it('requires distinctive recall subject terms before composing an answer',()=>{
    const donKhat={kind:'events',title:'วันที่ 17 ก.ย. 2569 ประเมิน โรงเรียนวัดดอนขาด',description:'ประเมิน PA โรงเรียนวัดดอนขาด'};
    const bangChik={kind:'events',title:'ประเมิน PA โรงเรียนบางจิก',description:'วันที่ 14 กันยายน 2569'};
    const retireDinner={kind:'events',title:'งานเลี้ยงเกษียณ ผอ. เผือก',description:'ช่วงเย็น'};
    const retireSchool={kind:'events',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',description:'ช่วงเช้า'};
    expect(recallSubjectMatches('ประเมิน pa ดอนขาดวันไหน',donKhat)).toBe(true);
    expect(recallSubjectMatches('ประเมิน pa ดอนขาดวันไหน',bangChik)).toBe(false);
    expect(recallSubjectMatches('กินเลี้ยงเกษียณงาน ผอ. เผือกวันไหน',retireDinner)).toBe(true);
    expect(recallSubjectMatches('กินเลี้ยงเกษียณงาน ผอ. เผือกวันไหน',retireSchool)).toBe(false);
    expect(recallSubjectMatches('กินเลี้ยงพี่เผือกวันไหน',retireDinner)).toBe(true);
    expect(recallSubjectMatches('กินเลี้ยงพี่เผือกวันไหน',retireSchool)).toBe(false);
    expect(recallSearchTerms('กินเลี้ยงพี่เผือกวันไหน')).toBe('เลี้ยง เผือก');
    expect(recallSearchTerms('ดอนขาดประเมินวันไหน')).toBe('ดอนขาด ประเมิน');
    expect(recallSubjectMatches('ดอนขาดประเมินวันไหน',donKhat)).toBe(true);
    expect(recallSubjectMatches('ดอนขาดประเมินวันไหน',bangChik)).toBe(false);
    expect(recallSubjectMatches('จัดงานเกษียณวันไหน',retireSchool)).toBe(true);
  });
  it('answers greetings without pretending Knowledge is missing',()=>{
    expect(cloudChatFallback('สวัสดี',[])).toContain('Ceo พร้อม');
    expect(cloudChatFallback('hello',[])).toContain('Ceo พร้อม');
  });
  it('explains capabilities when asked',()=>{
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('Ceo Knowledge');
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('AI Provider');
  });
  it('keeps unmatched general questions concise',()=>{
    const answer=cloudChatFallback('ช่วยคิดชื่อโครงการใหม่',[]);
    expect(answer).toContain('ยังไม่พบข้อมูล');
    expect(answer).not.toContain('จากความจำที่ตรงที่สุด');
  });
  it('answers personal recall misses as a memory miss instead of a system warning',()=>{
    const answer=cloudChatFallback('เมื่อวานกินข้าวกับอะไร',[]);
    expect(answer).toContain('ยังไม่พบข้อมูลที่บันทึกไว้');
    expect(answer).not.toContain('AI Provider');
  });
  it('formats matching Knowledge without retrieval-debug wording',()=>{
    const answer=cloudChatFallback('runtime',[{title:'Runtime Plan',summary:'ทดสอบระบบ Runtime'}]);
    expect(answer).toContain('ทดสอบระบบ Runtime');
    expect(answer).not.toContain('จากความจำที่ตรงที่สุด');
  });
  it('answers structured event fields directly',()=>{
    const event={id:'e7',kind:'events',title:'พานักเรียนไปดูภาพยนตร์ที่ Big C สุพรรณบุรี',start_at:'2026-09-06T17:00:00.000Z',all_day:true,location:'Big C สุพรรณบุรี'};
    expect(composeRecallAnswer('ดูภาพยนต์วันไหน',[event]).answer).toBe('วันที่ 7 กันยายน 2569ครับ');
    expect(composeRecallAnswer('ดูภาพยนต์ที่ไหน',[event]).answer).toBe('ที่ Big C สุพรรณบุรีครับ');
    expect(composeRecallAnswer('ดูภาพยนต์กี่โมง',[event]).answer).toBe('กิจกรรมนี้ยังไม่ได้ระบุเวลาไว้ครับ');
  });
  it('returns multiple matching event dates for one subject',()=>{
    const events=[
      {id:'r1',kind:'events',title:'งานเลี้ยงเกษียณ ผอ. เผือก',start_at:'2026-09-18T10:00:00.000Z'},
      {id:'r2',kind:'events',title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน',start_at:'2026-09-25T02:00:00.000Z'},
    ];
    const answer=composeRecallAnswer('งานเกณียณวันไหน',events).answer;
    expect(answer).toContain('มี 2 งาน');expect(answer).toContain('18 กันยายน 2569');expect(answer).toContain('25 กันยายน 2569');
  });
});
