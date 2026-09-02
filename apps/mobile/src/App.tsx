import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Brain, CalendarDays, CheckCircle2, Circle, Cpu, Gauge, HardDrive, LogOut, MessageSquareText, Network, Plus, RefreshCw, Search, ShieldCheck, Square, Volume2, VolumeX } from 'lucide-react';
import type { DeviceRecord, EventRecord, MemoryRecord, TaskRecord } from '@ceo-knowledge/shared';
import { api } from './api';
import { supabase } from './supabase';
import GraphPage from './GraphPage';
import DrivePage from './DrivePage';
import { captureCeoDriveProviderToken } from './drive';
import ConsolePage from './ConsolePage';
import DevicesPage from './DevicesPage';
import ApprovalsPage from './ApprovalsPage';
import OAuthConsentPage from './OAuthConsentPage';
import ClaimsPage from './ClaimsPage';
import ResearchPage from './ResearchPage';
import { chooseVoice, loadVoicePreferences, normalizeSpeechText, saveVoicePreferences, speechSynthesisSupported, speechTextForMode, splitSpeechText, type VoiceMode, type VoicePreferences } from './voice';

type Tab = 'console' | 'chat' | 'today' | 'memory' | 'tasks' | 'graph' | 'drive' | 'devices' | 'approvals' | 'claims' | 'research';
type ChatItem = { role: 'user' | 'ceo'; text: string; meta?: string; at?: number; context?: { sourceId?: string; query?: string; field?: string } };

async function waitForRuntimeJob(id: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await api.job(id);
    if (['completed','failed','cancelled','expired'].includes(String(job?.status || ''))) return job;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { id, status: 'timeout' };
}

function Login({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (result.data.session) onReady();
      else setError('สมัครแล้ว กรุณาตรวจอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ');
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen px-5 py-10 flex items-center justify-center">
    <section className="w-full max-w-md card p-6">
      <div className="flex items-center gap-3 mb-7"><div className="w-12 h-12 rounded-2xl bg-[#f4c95d] text-black grid place-items-center"><Brain /></div><div><h1 className="text-2xl font-bold">Ceo Mobile</h1><p className="muted text-sm">Remote Console · Secretary Dashboard</p></div></div>
      <div className="text-xs muted card p-3 mb-3">สำคัญ: ใช้อีเมลเดียวกับบัญชี Ceo บนเครื่องที่ต้องการควบคุม มิฉะนั้น Device/Knowledge จะเป็นคนละชุด</div>
      <div className="space-y-3">
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="อีเมล" type="email" autoComplete="email" />
        <input className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="รหัสผ่าน" type="password" autoComplete={mode==='login'?'current-password':'new-password'} onKeyDown={e=>e.key==='Enter'&&void submit()} />
        {error && <div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
        <button className="btn btn-primary w-full" disabled={busy||!email||!password} onClick={()=>void submit()}>{busy?'กำลังเชื่อมต่อ…':mode==='login'?'เข้าสู่ระบบ':'สมัครบัญชี'}</button>
        <button className="w-full text-sm muted py-2" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'ยังไม่มีบัญชี? สมัครใช้งาน':'มีบัญชีแล้ว? เข้าสู่ระบบ'}</button>
      </div>
    </section>
  </main>;
}

function ChatPage() {
  const CHAT_LOG_KEY='ceo-chat-log-v1',CHAT_ID_KEY='ceo-chat-conversation-v1';
  const greeting:ChatItem={role:'ceo',text:'พร้อมครับ ถามเรื่องงาน นัดหมาย ความจำ หรือคุยต่อจากข้อความก่อนหน้าได้เลย',meta:'AUTO ROUTER',at:Date.now()};
  const [conversationId,setConversationId]=useState(()=>{try{const saved=localStorage.getItem(CHAT_ID_KEY);if(saved)return saved;const id='mobile:'+crypto.randomUUID();localStorage.setItem(CHAT_ID_KEY,id);return id}catch{return'mobile:'+crypto.randomUUID()}});
  const [message,setMessage]=useState('');
  const [items,setItems]=useState<ChatItem[]>(()=>{try{const raw=localStorage.getItem(CHAT_LOG_KEY),parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)&&parsed.length?parsed.slice(-200):[greeting]}catch{return[greeting]}});
  const [busy,setBusy]=useState(false);
  const [provider,setProvider]=useState('AUTO · READY');
  const [thinking,setThinking]=useState('Ceo กำลังค้นความจำ…');
  const [followLatest,setFollowLatest]=useState(true);
  const [newBelow,setNewBelow]=useState(false);
  const [voicePrefs,setVoicePrefs]=useState<VoicePreferences>(()=>loadVoicePreferences());
  const [voiceState,setVoiceState]=useState<'ready'|'speaking'|'error'|'unsupported'>(()=>speechSynthesisSupported()?'ready':'unsupported');
  const [voiceMenuOpen,setVoiceMenuOpen]=useState(false);
  const listRef=useRef<HTMLDivElement>(null);
  const voicePrefsRef=useRef<VoicePreferences>(voicePrefs);
  const voiceSequenceRef=useRef(0);
  useEffect(()=>{try{localStorage.setItem(CHAT_LOG_KEY,JSON.stringify(items.slice(-200)))}catch{}},[items]);
  useEffect(()=>{voicePrefsRef.current=voicePrefs;saveVoicePreferences(voicePrefs)},[voicePrefs]);
  useEffect(()=>{if(!speechSynthesisSupported()){setVoiceState('unsupported');return}setVoiceState('ready');return()=>{voiceSequenceRef.current+=1;window.speechSynthesis.cancel()}},[]);
  useEffect(()=>{if(!followLatest){setNewBelow(true);return}const id=requestAnimationFrame(()=>{const el=listRef.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});setNewBelow(false)});return()=>cancelAnimationFrame(id)},[items,busy,followLatest]);
  const jumpLatest=()=>{setFollowLatest(true);setNewBelow(false);requestAnimationFrame(()=>{const el=listRef.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'smooth'})})};
  const stopVoice=()=>{voiceSequenceRef.current+=1;if(speechSynthesisSupported())window.speechSynthesis.cancel();setVoiceState(speechSynthesisSupported()?'ready':'unsupported')};
  const speakDevice=(raw:string,manual=false)=>{
    if(!speechSynthesisSupported()){setVoiceState('unsupported');return false}
    const prefs=voicePrefsRef.current,text=manual?normalizeSpeechText(raw):speechTextForMode(raw,prefs.mode);if(!text)return false;
    const synth=window.speechSynthesis,chunks=splitSpeechText(text),selected=chooseVoice(synth.getVoices(),prefs);if(!chunks.length)return false;try{synth.resume()}catch{}
    voiceSequenceRef.current+=1;const sequence=voiceSequenceRef.current;synth.cancel();setVoiceState('speaking');let finished=0;
    for(const chunk of chunks){const utterance=new SpeechSynthesisUtterance(chunk);utterance.lang=prefs.lang;utterance.rate=prefs.rate;utterance.pitch=prefs.pitch;utterance.volume=prefs.volume;if(selected)utterance.voice=selected as SpeechSynthesisVoice;utterance.onend=()=>{finished+=1;if(sequence===voiceSequenceRef.current&&finished>=chunks.length)setVoiceState('ready')};utterance.onerror=(event:any)=>{const reason=String(event?.error||'');if(sequence!==voiceSequenceRef.current||reason==='interrupted'||reason==='canceled')return;setVoiceState('error')};synth.speak(utterance)}
    try{sessionStorage.setItem('ceo-voice-activated-v1','1')}catch{}return true;
  };
  const setVoiceMode=(mode:VoiceMode)=>{if(mode==='off')stopVoice();setVoicePrefs(v=>({...v,mode}));setVoiceMenuOpen(false)};
  const appendCeo=(text:string,meta:string,autoSpeak=true,context?:ChatItem['context'])=>{const item:ChatItem={role:'ceo',text,meta,at:Date.now(),...(context?{context}:{})};setItems(v=>[...v,item]);const mode=voicePrefsRef.current.mode;if(autoSpeak&&(mode==='auto'||mode==='smart'))setTimeout(()=>speakDevice(text,false),0)};
  const clearLog=()=>{if(!window.confirm('เคลียร์ประวัติแชตในอุปกรณ์นี้?'))return;stopVoice();const id='mobile:'+crypto.randomUUID();setConversationId(id);try{localStorage.setItem(CHAT_ID_KEY,id);localStorage.removeItem(CHAT_LOG_KEY)}catch{}setItems([{...greeting,at:Date.now()}]);setProvider('AUTO · READY');setFollowLatest(true);setNewBelow(false)};
  async function send() {
    const text=message.trim();if(!text||busy)return;
    const recentContext=items.slice(-8).map(item=>({role:item.role,text:item.text,sourceId:item.context?.sourceId,query:item.context?.query}));
    setMessage('');setItems(v=>[...v,{role:'user',text,at:Date.now()}]);setBusy(true);setThinking('Ceo กำลังค้น Knowledge…');setFollowLatest(true);setNewBelow(false);
    try {
      const r=await api.chat(text,conversationId,recentContext);
      if(r?.mode==='runtime-provider-pending'&&r?.jobId){
        const device=String(r.device?.name||'Ceo Runtime');setProvider('AUTO · RUNTIME');setThinking('Ceo Auto Router บน '+device+' กำลังเลือก Model…');
        const job=await waitForRuntimeJob(String(r.jobId));const result=job?.result&&typeof job.result==='object'?job.result:{};const answer=String(result?.response||'').trim();
        if(job?.status==='completed'&&result?.available!==false&&answer){const actualProvider=String(result?.provider||'auto').toUpperCase(),actualModel=String(result?.model||'').trim(),routeLabel=[actualProvider,actualModel].filter(Boolean).join(' · ');setProvider('AUTO · '+routeLabel);appendCeo(answer,routeLabel);}
        else {const fallback=String(r.fallbackAnswer||'ยังไม่พบคำตอบที่เชื่อถือได้ในรอบนี้ครับ'),reason=String(result?.reason||job?.error?.message||job?.status||'PROVIDER_UNAVAILABLE');setProvider('AUTO · KNOWLEDGE FALLBACK');appendCeo(fallback,'KNOWLEDGE FALLBACK · '+reason);}
      } else if(r?.mode==='ollama-pending'&&r?.jobId){
        const model=String(r.model||'qwen3:4b'),device=String(r.device?.name||'Ceo Runtime');setProvider('AUTO · OLLAMA '+model);setThinking('Ollama '+model+' บน '+device+' กำลังคิด…');
        const job=await waitForRuntimeJob(String(r.jobId));const result=job?.result&&typeof job.result==='object'?job.result:{};const answer=String(result?.response||'').trim();
        if(job?.status==='completed'&&result?.available!==false&&answer){const actualModel=String(result?.model||model);setProvider('AUTO · OLLAMA '+actualModel);appendCeo(answer,'OLLAMA · '+actualModel);}
        else {const fallback=String(r.fallbackAnswer||'ยังไม่พบคำตอบที่เชื่อถือได้ในรอบนี้ครับ'),reason=String(result?.reason||job?.error?.message||job?.status||'OLLAMA_UNAVAILABLE');setProvider('AUTO · KNOWLEDGE FALLBACK');appendCeo(fallback,'KNOWLEDGE FALLBACK · '+reason);}
      } else {
        const mode=String(r?.mode||r?.intent||'knowledge'),cloudProvider=String(r?.provider||'AI').toUpperCase(),cloudModel=String(r?.model||'').trim(),grounded=r?.grounded===true;
        const cloudLabel=['CLOUD',cloudProvider,cloudModel,grounded?'SEARCH':''].filter(Boolean).join(' · '),label=mode==='cloud-ai'?cloudLabel:mode==='knowledge'||mode==='knowledge-only'?'AUTO · KNOWLEDGE':'CLOUD · SECRETARY';setProvider(label);appendCeo(r.answer||'เรียบร้อยครับ',label.replace('AUTO · ',''),true,r?.context);
      }
    } catch(e:any){setProvider('AUTO · ERROR');appendCeo('เกิดข้อผิดพลาด: '+String(e?.message||e),'ERROR');}
    finally{setBusy(false);setThinking('Ceo กำลังค้นความจำ…')}
  }
  const voiceStatus=voiceState==='unsupported'?'ไม่รองรับ':voiceState==='speaking'?'กำลังพูด':voiceState==='error'?'ลองกดทดสอบ':'พร้อม';
  return <div className="chat-shell flex flex-col min-h-0">
    <div className="flex items-center justify-between gap-3 pb-3"><div><div className="font-semibold">Ceo Chat / Auto Router</div><div className="muted text-[11px]">Knowledge ก่อน · AI เมื่อจำเป็น · เก็บ Chat Log ในอุปกรณ์</div></div><div className="flex items-center gap-2"><span className="badge">{provider}</span><button className="badge" onClick={clearLog}>เคลียร์ Log</button></div></div>
    <div ref={listRef} onScroll={e=>{const el=e.currentTarget,near=el.scrollHeight-el.scrollTop-el.clientHeight<90;setFollowLatest(near);if(near)setNewBelow(false)}} className="chat-log flex-1 min-h-0 overflow-auto space-y-3 pr-1">
      {items.map((item,i)=><div key={(item.at||i)+'-'+i} className={'chat-bubble '+(item.role==='user'?'chat-user':'chat-ceo')}>{item.role==='ceo'?<><div><span className="chat-ceo-name">Ceo : </span>{item.text}</div>{item.meta&&<div className="chat-meta">{item.meta}</div>}{voicePrefs.mode!=='off'&&<div className="chat-voice-actions"><button className="voice-inline" title="ฟังคำตอบ" aria-label="ฟังคำตอบ" onClick={()=>speakDevice(item.text,true)} disabled={voiceState==='unsupported'}><Volume2 size={14}/></button>{voiceState==='speaking'&&<button className="voice-inline" title="หยุดเสียง" aria-label="หยุดเสียง" onClick={stopVoice}><Square size={12}/></button>}</div>}</>:item.text}</div>)}
      {busy&&<div className="chat-bubble chat-ceo muted"><span className="chat-ceo-name">Ceo : </span>{thinking}</div>}
    </div>
    {newBelow&&<button className="chat-jump-latest" onClick={jumpLatest}>↓ ข้อความล่าสุด</button>}
    <div className="chat-composer pt-3">
      {voiceMenuOpen&&<div className="voice-popover"><div className="voice-popover-head"><div><b>Voice</b><span>{voiceStatus} · DEVICE TTS</span></div><button className="voice-popover-close" aria-label="ปิดเมนูเสียง" onClick={()=>setVoiceMenuOpen(false)}>×</button></div><div className="voice-mode-grid">{([['off','ปิด'],['manual','กดฟัง'],['auto','อัตโนมัติ'],['smart','Smart']] as [VoiceMode,string][]).map(([mode,label])=><button key={mode} className={'voice-mode-option '+(voicePrefs.mode===mode?'active':'')} onClick={()=>setVoiceMode(mode)}>{label}</button>)}</div><div className="voice-popover-note">{voiceState==='unsupported'?'อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับระบบอ่านข้อความ':voicePrefs.mode==='off'?'ปิดเสียงทั้งหมด':voicePrefs.mode==='manual'?'แตะไอคอนลำโพงในคำตอบเพื่อฟัง':voicePrefs.mode==='auto'?'คำตอบใหม่จะพูดอัตโนมัติ':'Smart จะย่อข้อความยาวก่อนพูด'}</div><div className="voice-popover-actions"><button onClick={()=>speakDevice('ซีอีโอพร้อมพูดแล้วครับ',true)} disabled={voiceState==='unsupported'}><Volume2 size={14}/>ทดสอบ</button>{voiceState==='speaking'&&<button onClick={stopVoice}><Square size={12}/>หยุด</button>}</div></div>}
      <div className="chat-composer-row"><input className="input" value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void send()} placeholder="พิมพ์ถาม Ceo…"/><button className={'btn voice-trigger '+(voicePrefs.mode!=='off'?'voice-on':'')} title="ตั้งค่า Voice" aria-label="ตั้งค่า Voice" aria-expanded={voiceMenuOpen} onClick={()=>setVoiceMenuOpen(v=>!v)}>{voicePrefs.mode==='off'?<VolumeX size={20}/>:<Volume2 size={20}/>}<span className="voice-dot"/></button><button className="btn btn-primary send-trigger" aria-label="ส่งข้อความ" onClick={()=>void send()} disabled={busy||!message.trim()}><MessageSquareText size={20}/></button></div>
    </div>
  </div>;
}
function TodayPage() {
  const [data,setData]=useState<{events:EventRecord[];tasks:TaskRecord[]}|null>(null); const [error,setError]=useState('');
  const load=async()=>{setError('');try{setData(await api.today());}catch(e:any){setError(String(e?.message||e));}};
  useEffect(()=>{void load();},[]);
  return <div className="space-y-5"><HeaderRow title="วันนี้" onRefresh={load}/>{error&&<p className="text-red-300">{error}</p>}<section><h2 className="font-semibold mb-2">นัด / กิจกรรม</h2><div className="space-y-2">{data?.events.length?data.events.map(e=><div className="card p-4" key={e.id}><div className="flex justify-between gap-3"><div><div className="font-semibold">{e.title}</div><div className="muted text-sm mt-1">{new Date(e.start_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}{e.location?` · ${e.location}`:''}</div></div><CalendarDays className="accent" size={20}/></div></div>):<Empty text="วันนี้ยังไม่มีนัด"/>}</div></section><section><h2 className="font-semibold mb-2">งานที่ยังเปิดอยู่</h2><div className="space-y-2">{data?.tasks.length?data.tasks.slice(0,12).map(t=><TaskCard task={t} onDone={load}/>):<Empty text="ไม่มีงานค้าง"/>}</div></section></div>;
}

function MemoryPage(){
  type MemoryRow=MemoryRecord&{repeat_count?:number;event_at?:string|null;tier?:string;retention_policy?:string;source_kind?:string;metadata?:Record<string,any>;replica?:boolean;node_id?:string};
  type MemoryFilter='all'|'important'|'today'|'pinned'|'temporary'|'archived';
  const[q,setQ]=useState('');const[rows,setRows]=useState<MemoryRow[]>([]);const[text,setText]=useState('');const[busy,setBusy]=useState(false);const[hasMore,setHasMore]=useState(false);const[filter,setFilter]=useState<MemoryFilter>('all');const[expanded,setExpanded]=useState<Record<string,boolean>>({});const[hiddenQuestions,setHiddenQuestions]=useState(0);const[garden,setGarden]=useState<any>(null);const[gardenBusy,setGardenBusy]=useState(false);const[gardenNote,setGardenNote]=useState('');
  const load=async(reset=true)=>{if(busy)return;setBusy(true);try{const offset=reset?0:rows.length;const data=await api.memories(q,offset,30,filter==='all'?'':filter);setRows(current=>reset?data.memories:[...current,...data.memories]);setHasMore(Boolean(data.hasMore));setHiddenQuestions(Number(data.hiddenQuestionCount||0));}finally{setBusy(false)}};
  useEffect(()=>{void load(true)},[filter]);
  async function remember(){if(!text.trim())return;await api.remember(text.trim());setText('');await load(true)}
  async function analyzeGarden(){setGardenBusy(true);setGardenNote('');try{const plan=await api.memoryMaintenancePlan();setGarden(plan);setGardenNote(`พบซ้ำ ${plan?.stats?.duplicateNodes||0} · เปลี่ยน Tier ${plan?.stats?.tierChanges||0} · Archive ${plan?.stats?.archiveCandidates||0}`)}catch(e:any){setGardenNote(String(e?.message||e))}finally{setGardenBusy(false)}}
  async function applyGarden(){setGardenBusy(true);setGardenNote('');try{const result=await api.memoryMaintenanceApply();setGarden(result.plan);setGardenNote(`จัดระเบียบแล้ว ${result?.result?.appliedCount||0} รายการ · ข้าม ${result?.result?.skippedCount||0}`);await load(true)}catch(e:any){setGardenNote(String(e?.message||e))}finally{setGardenBusy(false)}}
  async function manage(row:MemoryRow,action:'set_tier'|'archive'|'restore',payload:Record<string,unknown>={}){const nodeId=String(row.node_id||row.id);await api.manageMemory(nodeId,action,payload);await load(true)}
  const dayKey=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const dayLabel=(value:string)=>{const d=new Date(value),today=dayKey(new Date().toISOString()),yesterday=dayKey(new Date(Date.now()-86400000).toISOString()),key=dayKey(value);if(key===today)return'วันนี้';if(key===yesterday)return'เมื่อวาน';return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(d)};
  const groups=useMemo(()=>{const map=new Map<string,MemoryRow[]>();for(const row of rows){const key=dayKey(row.updated_at||row.created_at);const list=map.get(key)||[];list.push(row);map.set(key,list)}return[...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]))},[rows]);
  const filters:[MemoryFilter,string][]=[['all','Active'],['important','สำคัญ'],['pinned','Pinned'],['temporary','ชั่วคราว'],['archived','Archive'],['today','วันนี้']];
  return <div className="space-y-4"><HeaderRow title="Memory" onRefresh={()=>load(true)}/>
    <div className="card p-3 flex gap-2"><input className="input" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void remember()} placeholder="พิมพ์ข้อมูลให้ Ceo จำ/จัดประเภท"/><button className="btn btn-primary" onClick={()=>void remember()}><Plus size={18}/></button></div>
    <div className="card p-4 space-y-3"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold text-sm">Memory Gardener</div><div className="muted text-[11px] mt-1">Rule คัดก่อน · ไม่ hard delete · Pinned/Permanent ถูกป้องกัน</div></div><span className="badge">M1–M6</span></div><div className="grid grid-cols-2 gap-2"><button className="btn" disabled={gardenBusy} onClick={()=>void analyzeGarden()}>{gardenBusy?'…':'วิเคราะห์'}</button><button className="btn btn-primary" disabled={gardenBusy||!garden} onClick={()=>void applyGarden()}>จัดระเบียบ</button></div>{garden&&<div className="grid grid-cols-4 gap-2 text-center"><div className="memory-stat"><b>{garden.stats?.duplicateNodes||0}</b><span>ซ้ำ</span></div><div className="memory-stat"><b>{garden.stats?.tierChanges||0}</b><span>Tier</span></div><div className="memory-stat"><b>{garden.stats?.archiveCandidates||0}</b><span>Archive</span></div><div className="memory-stat"><b>{garden.stats?.protected||0}</b><span>Protected</span></div></div>}{gardenNote&&<div className="muted text-xs">{gardenNote}</div>}</div>
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void load(true)} placeholder="ค้นความจำ..."/></div><button className="btn" onClick={()=>void load(true)}>{busy?'…':'ค้น'}</button></div>
    <div className="memory-filter-row">{filters.map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={'graph-filter '+(filter===id?'graph-filter-active':'')}>{label}</button>)}</div>
    <div className="card p-3 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">Memory Timeline</div><div className="muted text-[11px]">Canonical/Active ถูกใช้ Recall ก่อน · Archive ไม่เข้า Recall ปกติ</div></div><div className="text-right"><div className="font-semibold">{rows.length}</div><div className="muted text-[10px]">โหลดแล้ว</div></div></div>
    {hiddenQuestions>0&&<div className="muted text-[11px] px-1">ซ่อนข้อความที่เป็นคำถามจาก Auto Memory {hiddenQuestions} รายการ</div>}
    <div className="space-y-3">{groups.map(([key,list],groupIndex)=>{const open=expanded[key]??groupIndex<2;const important=list.filter(x=>x.importance>=2).length;const types=[...new Set(list.map(x=>x.memory_type).filter(Boolean))].slice(0,4);return <section className="card overflow-hidden" key={key}><button className="w-full p-4 text-left flex items-center justify-between gap-3" onClick={()=>setExpanded(v=>({...v,[key]:!open}))}><div><div className="font-semibold">{dayLabel(list[0]!.updated_at||list[0]!.created_at)}</div><div className="muted text-xs mt-1">{list.length} ความจำ · สำคัญ {important}{types.length?` · ${types.join(' / ')}`:''}</div></div><span className="badge">{open?'ย่อ':'เปิด'}</span></button>{open&&<div className="border-t border-[#252b38] px-3 pb-3"><div className="memory-day-summary">{list.length===1?'มีความจำ 1 รายการในวันนี้':`วันนี้มี ${list.length} ความจำ โดย ${important} รายการมีความสำคัญระดับ 2 ขึ้นไป`}</div><div className="space-y-2">{list.map(m=>{const mm=m.metadata||{},isArchived=mm.archived===true,isPinned=m.tier==='pinned'||mm.pinned===true,isPermanent=m.retention_policy==='permanent';return <div className="memory-row" key={m.id}><div className="flex justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-sm">{m.title||m.memory_type}</div><p className="text-sm mt-1 leading-6 text-[#c7ccda] line-clamp-3">{m.content}</p><div className="mt-2 flex gap-2 flex-wrap"><span className="badge">{m.memory_type}</span><span className="badge">สำคัญ {m.importance}/3</span>{m.tier&&<span className="badge">{m.tier}</span>}{mm.canonical===true&&<span className="badge accent">Canonical</span>}{mm.canonicalOf&&<span className="badge">Duplicate</span>}{isArchived&&<span className="badge">Archived</span>}{m.repeat_count&&m.repeat_count>1&&<span className="badge accent">รวมซ้ำ ×{m.repeat_count}</span>}{m.replica&&<span className="badge">SYNC</span>}{m.event_at&&<span className="badge">{new Date(m.event_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>}</div></div><div className="flex flex-col gap-2 shrink-0">{m.replica&&isArchived&&<button className="text-xs muted" onClick={async e=>{e.stopPropagation();await manage(m,'restore')}}>คืน</button>}{m.replica&&!isArchived&&!isPinned&&<button className="text-xs muted" onClick={async e=>{e.stopPropagation();await manage(m,'set_tier',{tier:'pinned'})}}>Pin</button>}{m.replica&&!isArchived&&!isPinned&&!isPermanent&&<button className="text-xs muted" onClick={async e=>{e.stopPropagation();await manage(m,'archive',{reason:'manual'})}}>Archive</button>}{!m.replica&&<button className="text-xs muted" onClick={async e=>{e.stopPropagation();await api.forget(m.id);await load(true)}}>ลืม</button>}</div></div></div>})}</div></div>}</section>})}{!rows.length&&!busy&&<Empty text="ยังไม่พบ Memory"/>}</div>
    {hasMore&&<button className="btn w-full" disabled={busy} onClick={()=>void load(false)}>{busy?'กำลังโหลด…':'โหลดความจำเก่าเพิ่ม'}</button>}
  </div>
}
function TaskCard({task,onDone}:{task:TaskRecord;onDone:()=>Promise<void>}){return <div className="card p-4 flex gap-3 items-start"><button className="mt-0.5" onClick={async()=>{if(task.status!=='completed'){await api.completeTask(task.id);await onDone()}}}>{task.status==='completed'?<CheckCircle2 className="text-green-400"/>:<Circle className="muted"/>}</button><div className="flex-1"><div className="font-semibold">{task.title}</div>{task.description&&<p className="muted text-sm mt-1">{task.description}</p>}<div className="flex gap-2 mt-2 flex-wrap"><span className="badge">{task.status}</span><span className="badge">{task.priority}</span>{task.due_at&&<span className="badge">ครบกำหนด {new Date(task.due_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</span>}</div></div></div>}
function TasksPage(){
  const[rows,setRows]=useState<TaskRecord[]>([]);const[text,setText]=useState('');const[view,setView]=useState<'active'|'completed'|'all'>('active');
  const load=async()=>setRows((await api.tasks()).tasks);useEffect(()=>{void load()},[]);
  const visible=rows.filter(t=>view==='all'?true:view==='completed'?t.status==='completed':t.status!=='completed'&&t.status!=='cancelled');
  return <div className="space-y-4"><HeaderRow title="Tasks" onRefresh={load}/>
    <div className="card p-4"><div className="font-semibold text-sm">Task = สิ่งที่ต้องลงมือทำ</div><p className="muted text-xs mt-1 leading-5">เช่น ส่งเอกสาร โทรติดต่อ เตรียมของ หรือทำงานก่อนกำหนด เมื่อทำเสร็จกดวงกลม ✓ รายการจะย้ายออกจากงานที่ต้องทำ แต่ประวัติยังอยู่ในระบบ</p></div>
    <div className="flex gap-2"><input className="input" value={text} onChange={e=>setText(e.target.value)} placeholder="เพิ่มงานที่ต้องทำ" onKeyDown={async e=>{if(e.key==='Enter'&&text.trim()){await api.addTask(text.trim());setText('');await load()}}}/><button className="btn btn-primary" onClick={async()=>{if(text.trim()){await api.addTask(text.trim());setText('');await load()}}}><Plus size={18}/></button></div>
    <div className="memory-filter-row">{([['active','ต้องทำ'],['completed','เสร็จแล้ว'],['all','ทั้งหมด']] as const).map(([id,label])=><button key={id} className={'graph-filter '+(view===id?'graph-filter-active':'')} onClick={()=>setView(id)}>{label}<span>{id==='active'?rows.filter(t=>t.status!=='completed'&&t.status!=='cancelled').length:id==='completed'?rows.filter(t=>t.status==='completed').length:rows.length}</span></button>)}</div>
    <div className="space-y-2">{visible.map(t=><TaskCard key={t.id} task={t} onDone={load}/>)}{!visible.length&&<Empty text={view==='active'?'ตอนนี้ไม่มีงานที่ต้องทำ':'ยังไม่มี Task ในหมวดนี้'}/>}</div>
  </div>
}
function HeaderRow({title,onRefresh}:{title:string;onRefresh:()=>Promise<void>}){return <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{title}</h1><button className="btn px-3" onClick={()=>void onRefresh()}><RefreshCw size={17}/></button></div>}
function Empty({text}:{text:string}){return <div className="card p-6 text-center muted text-sm">{text}</div>}

export default function App(){const initial=(()=>{const value=new URLSearchParams(window.location.search).get('tab');return(['console','chat','today','memory','tasks','graph','drive','devices','approvals','claims','research'] as Tab[]).includes(value as Tab)?value as Tab:'console'})();const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);const[tab,setTab]=useState<Tab>(initial);useEffect(()=>{supabase.auth.getSession().then(({data})=>{captureCeoDriveProviderToken(data.session);setSession(data.session);setLoading(false)});const{data}=supabase.auth.onAuthStateChange((_e,s)=>{captureCeoDriveProviderToken(s);setSession(s)});if(new URLSearchParams(window.location.search).has('tab'))history.replaceState({},'',window.location.pathname);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>data.subscription.unsubscribe()},[]);const tabs=useMemo(()=>[{id:'console' as Tab,label:'Console',icon:Gauge},{id:'chat' as Tab,label:'Chat',icon:MessageSquareText},{id:'today' as Tab,label:'Today',icon:CalendarDays},{id:'memory' as Tab,label:'Memory',icon:Brain},{id:'tasks' as Tab,label:'Tasks',icon:CheckCircle2},{id:'graph' as Tab,label:'Graph',icon:Network},{id:'drive' as Tab,label:'Drive',icon:HardDrive},{id:'devices' as Tab,label:'Devices',icon:Cpu}],[]);if(loading)return <div className="min-h-screen grid place-items-center muted">กำลังเปิด Ceo…</div>;if(window.location.pathname.replace(/\/+$/,'')==='/oauth/consent')return <OAuthConsentPage session={session} onSessionReady={next=>{captureCeoDriveProviderToken(next);setSession(next)}}/>;if(!session)return <Login onReady={()=>void supabase.auth.getSession().then(({data})=>{captureCeoDriveProviderToken(data.session);setSession(data.session)})}/>;const Page=tab==='chat'?ChatPage:tab==='today'?TodayPage:tab==='memory'?MemoryPage:tab==='tasks'?TasksPage:tab==='graph'?GraphPage:tab==='drive'?DrivePage:tab==='devices'?DevicesPage:tab==='approvals'?ApprovalsPage:tab==='claims'?ClaimsPage:tab==='research'?ResearchPage:null;return <div className="min-h-screen max-w-3xl mx-auto"><header className="h-16 px-4 flex items-center justify-between border-b border-[#202533] sticky top-0 bg-[#090b10]/95 backdrop-blur z-10"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-[#f4c95d] text-black grid place-items-center"><Brain size={19}/></div><div><div className="font-bold leading-4">Ceo</div><div className="text-[11px] muted max-w-[220px] truncate">{session.user.email||'Remote Console'}</div></div></div><button className="btn px-3" title="ออกจากระบบ" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/></button></header><main className="p-4 pb-32">{tab==='console'?<ConsolePage onNavigate={target=>setTab(target as Tab)}/>:Page?<Page/>:null}</main><nav className="fixed bottom-0 left-0 right-0 safe-bottom glass z-20"><div className="max-w-3xl mx-auto grid grid-cols-8 px-1 pt-2">{tabs.map(t=>{const I=t.icon,active=tab===t.id;return <button key={t.id} onClick={()=>setTab(t.id)} className={'py-2 flex flex-col items-center gap-1 text-[10px] '+(active?'accent':'muted')}><I size={19}/><span>{t.label}</span></button>})}</div></nav></div>}
