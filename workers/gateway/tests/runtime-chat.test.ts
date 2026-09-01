import { describe, expect, it } from 'vitest';
import { buildOllamaChatPrompt, deviceSupportsOllama, deviceSupportsProviderChat, ollamaJobAnswer, providerJobAnswer, selectOllamaDevice, selectProviderChatDevice } from '../src/runtime-chat';

describe('Ollama runtime chat router',()=>{
  const base={trusted:true,status:'online',last_seen_at:new Date().toISOString(),capabilities:{remoteTools:['runtime.status','ollama.chat']}};
  it('selects the freshest trusted online device that exposes ollama.chat',()=>{
    const now=Date.now();
    const picked=selectOllamaDevice([
      {...base,id:'old',last_seen_at:new Date(now-30_000).toISOString()},
      {...base,id:'new',last_seen_at:new Date(now-2_000).toISOString()},
      {...base,id:'no-ollama',last_seen_at:new Date(now-1_000).toISOString(),capabilities:{remoteTools:['runtime.status']}},
    ],now);
    expect(picked?.id).toBe('new');
  });
  it('rejects stale, disabled and untrusted devices',()=>{
    const now=Date.now();
    expect(deviceSupportsOllama({...base,last_seen_at:new Date(now-61_000).toISOString()},now)).toBe(false);
    expect(deviceSupportsOllama({...base,status:'disabled'},now)).toBe(false);
    expect(deviceSupportsOllama({...base,trusted:false},now)).toBe(false);
  });
  it('selects only trusted online devices that expose provider.chat',()=>{
    const now=Date.now();
    const providerBase={...base,capabilities:{remoteTools:['runtime.status','provider.chat']}};
    expect(deviceSupportsProviderChat(providerBase,now)).toBe(true);
    expect(deviceSupportsProviderChat({...providerBase,trusted:false},now)).toBe(false);
    expect(selectProviderChatDevice([{...providerBase,id:'provider'},{...base,id:'ollama'}],now)?.id).toBe('provider');
  });
  it('builds a bounded Ceo Knowledge context without inventing tool execution',()=>{
    const prompt=buildOllamaChatPrompt('ช่วยคิดชื่อโครงการ',[{kind:'knowledge_entries',title:'PMS',content:'ระบบบริหารโรงเรียน',_score:90}],'qwen3:4b');
    expect(prompt).toContain('/no_think');
    expect(prompt).toContain('Provider=Ollama, Model=qwen3:4b, Status=READY');
    expect(prompt).toContain('ช่วยคิดชื่อโครงการ');
    expect(prompt).toContain('PMS');
    expect(prompt).toContain('ห้ามแต่งข้อมูลส่วนบุคคล');
  });
  it('does not inject qwen3 control token into the faster qwen2.5 fallback model',()=>{
    const prompt=buildOllamaChatPrompt('สวัสดี',[],'qwen2.5vl:3b');
    expect(prompt).toContain('Provider=Ollama, Model=qwen2.5vl:3b, Status=READY');
    expect(prompt).not.toContain('/no_think');
  });

  it('extracts completed provider and ollama job answers and rejects unavailable results',()=>{
    expect(providerJobAnswer({status:'completed',result:{available:true,response:'ตอบผ่าน Gemini',provider:'gemini',model:'gemini-3.6-flash'}})).toEqual({ok:true,answer:'ตอบผ่าน Gemini',provider:'gemini',model:'gemini-3.6-flash',reason:'READY'});
    expect(providerJobAnswer({status:'failed',error:{message:'provider failed'}}).ok).toBe(false);
    expect(ollamaJobAnswer({status:'completed',result:{available:true,response:'สวัสดีครับ',model:'qwen3:4b'}})).toEqual({ok:true,answer:'สวัสดีครับ',provider:'ollama',model:'qwen3:4b',reason:'READY'});
    expect(ollamaJobAnswer({status:'completed',result:{available:false,reason:'OLLAMA_MODEL_NOT_INSTALLED',model:'x'}}).ok).toBe(false);
    expect(ollamaJobAnswer({status:'running'}).ok).toBe(false);
  });
});
