import { describe, expect, it } from 'vitest';
import { cloudChatFallback } from '../src/chat';

describe('cloud chat fallback',()=>{
  it('answers greetings without pretending Knowledge is missing',()=>{
    expect(cloudChatFallback('สวัสดี',[])).toContain('Ceo พร้อม');
    expect(cloudChatFallback('hello',[])).toContain('Ceo พร้อม');
  });
  it('explains capabilities when asked',()=>{
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('Ceo Knowledge');
    expect(cloudChatFallback('Ceo ทำอะไรได้บ้าง',[])).toContain('AI Provider');
  });
  it('clearly labels knowledge-only mode for unmatched general questions',()=>{
    const answer=cloudChatFallback('ช่วยคิดชื่อโครงการใหม่',[]);
    expect(answer).toContain('โหมด Ceo Knowledge');
    expect(answer).toContain('ระบบไม่ได้เสีย');
    expect(answer).toContain('AI Provider');
  });
  it('formats matching Knowledge instead of mode warning',()=>{
    const answer=cloudChatFallback('runtime',[{title:'Runtime Plan',summary:'ทดสอบระบบ Runtime'}]);
    expect(answer).toContain('Runtime Plan');
    expect(answer).not.toContain('ระบบไม่ได้เสีย');
  });
});
