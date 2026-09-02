import { describe,expect,it } from 'vitest';
import { interpretSemanticContext } from '../src/semantic-interpreter';
import { buildEvidencePack } from '../src/evidence-pack';

const env:any={APP_ENV:'test'};
describe('Semantic Intelligence V4 token-efficient pipeline',()=>{
  it('does not spend AI on a clear standalone recall query',async()=>{
    const frame=await interpretSemanticContext(env,'รับทุน ปตท วันไหน',[]);
    expect(frame.aiRequired).toBe(false);expect(frame.aiUsed).toBe(false);expect(frame.relation).toBe('NEW_TOPIC');expect(frame.requestedField).toBe('date');expect(frame.estimatedInputTokens).toBeLessThan(80);
  });
  it('uses compact prior context for ambiguous follow-up',async()=>{
    const frame=await interpretSemanticContext(env,'ไปกับใคร',[{role:'user',text:'รับทุน ปตท วันไหน'},{role:'ceo',text:'วันที่ 11 กันยายน 2569ครับ',sourceId:'ptt11',query:'รับทุน ปตท วันไหน'}]);
    expect(frame.aiRequired).toBe(true);expect(frame.requestedField).toBe('person');expect(frame.estimatedInputTokens).toBeLessThan(220);expect(frame.standaloneQuery).toContain('รับทุน');
  });
  it('caps evidence by item count and character budget',()=>{
    const rows=Array.from({length:20},(_,i)=>({id:`m${i}`,kind:'memories',title:`ข้อมูล ${i}`,content:'ข้อความประกอบ '.repeat(80)}));
    const pack=buildEvidencePack('คำถาม',rows,{limit:6,maxChars:3000});
    expect(pack.items.length).toBeLessThanOrEqual(6);expect(pack.estimatedTokens).toBeLessThan(1100);expect(pack.truncated).toBe(true);
  });
});
