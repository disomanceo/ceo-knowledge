import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_PREFERENCES, chooseVoice, loadVoicePreferences, normalizeSpeechText, normalizeVoicePreferences, saveVoicePreferences, smartSpeechText, speechTextForMode, splitSpeechText } from './voice';

describe('Ceo Chat Voice',()=>{
  it('defaults to MANUAL and clamps per-device preferences',()=>{
    expect(normalizeVoicePreferences({mode:'bad',rate:9,pitch:-1,volume:8})).toMatchObject({mode:'manual',rate:1.6,pitch:.5,volume:1,lang:'th-TH'});
  });

  it('stores preferences locally without any account/cloud dependency',()=>{
    const memory=new Map<string,string>();
    const storage={getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>{memory.set(key,value)}};
    saveVoicePreferences({...DEFAULT_VOICE_PREFERENCES,mode:'smart',rate:1.1},storage);
    expect(loadVoicePreferences(storage)).toMatchObject({mode:'smart',rate:1.1,lang:'th-TH'});
  });

  it('normalizes Thai technical speech and screen-only content',()=>{
    const text=normalizeSpeechText('Ceo : API และ MCP พร้อมเวลา 09:00 ดู https://example.com และ `gemini`');
    expect(text).toContain('เอพีไอ');expect(text).toContain('เอ็มซีพี');expect(text).toContain('9 นาฬิกา');expect(text).toContain('ลิงก์อยู่บนหน้าจอ');expect(text).not.toContain('https://');
  });

  it('SMART mode shortens long technical output instead of reading code/logs verbatim',()=>{
    const text=smartSpeechText('npm test ผ่านแล้ว ```const x = 1``` '+('รายละเอียดทางเทคนิค '.repeat(40)));
    expect(text).toBe('ดำเนินการด้านเทคนิคแล้วครับ รายละเอียดอยู่บนหน้าจอ');
    expect(speechTextForMode('ทดสอบครับ','manual')).toBe('');
    expect(speechTextForMode('ทดสอบครับ','auto')).toContain('ทดสอบ');
  });

  it('splits long speech into browser-safe utterances',()=>{
    const chunks=splitSpeechText('ประโยคหนึ่งครับ '+('คำยาว '.repeat(90)),80);
    expect(chunks.length).toBeGreaterThan(2);expect(chunks.every(chunk=>chunk.length<=80)).toBe(true);
  });

  it('prefers an exact configured voice then Thai language voices',()=>{
    const voices=[{voiceURI:'en',lang:'en-US',default:true},{voiceURI:'thai-a',lang:'th-TH',default:false},{voiceURI:'thai-b',lang:'th-TH',default:false}];
    expect(chooseVoice(voices,{lang:'th-TH',voiceURI:'thai-b'})?.voiceURI).toBe('thai-b');
    expect(chooseVoice(voices,{lang:'th-TH',voiceURI:''})?.voiceURI).toBe('thai-a');
  });
});
