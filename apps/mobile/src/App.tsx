import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Brain, CalendarDays, CheckCircle2, Circle, Cpu, Gauge, HardDrive, LogOut, MessageSquareText, Network, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { DeviceRecord, EventRecord, MemoryRecord, TaskRecord } from '@ceo-knowledge/shared';
import { api } from './api';
import { supabase } from './supabase';
import GraphPage from './GraphPage';
import DrivePage from './DrivePage';
import { captureCeoDriveProviderToken } from './drive';
import ConsolePage from './ConsolePage';

type Tab = 'console' | 'chat' | 'today' | 'memory' | 'tasks' | 'graph' | 'drive' | 'devices';
type ChatItem = { role: 'user' | 'ceo'; text: string; meta?: string };

async function waitForRuntimeJob(id: string, timeoutMs = 125_000) {
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
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<ChatItem[]>([{ role:'ceo', text:'Chat สำรองพร้อมครับ ถ้าเครื่อง Ceo Online ระบบจะใช้ Ollama; งานสนทนาหลักให้ใช้ ChatGPT และให้ Ceo ทำหน้าที่เป็นเครื่องมือ/ความจำ/Remote Runtime', meta:'FALLBACK AI' }]);
  const [busy,setBusy]=useState(false);
  const [provider,setProvider]=useState('AUTO · READY');
  const [thinking,setThinking]=useState('Ceo กำลังค้นความจำ…');
  async function send() {
    const text=message.trim(); if(!text||busy)return;
    setMessage(''); setItems(v=>[...v,{role:'user',text}]); setBusy(true); setThinking('Ceo กำลังเลือก Provider…');
    try {
      const r=await api.chat(text);
      if(r?.mode==='ollama-pending'&&r?.jobId){
        const model=String(r.model||'qwen3:4b');
        const device=String(r.device?.name||'Ceo Runtime');
        setProvider('AUTO · OLLAMA '+model);
        setThinking('Ollama '+model+' บน '+device+' กำลังคิด…');
        const job=await waitForRuntimeJob(String(r.jobId));
        const result=job?.result&&typeof job.result==='object'?job.result:{};
        const answer=String(result?.response||'').trim();
        if(job?.status==='completed'&&result?.available!==false&&answer){
          const actualModel=String(result?.model||model);
          setProvider('AUTO · OLLAMA '+actualModel);
          setItems(v=>[...v,{role:'ceo',text:answer,meta:'OLLAMA · '+actualModel}]);
        } else {
          const fallback=String(r.fallbackAnswer||'Ollama ยังตอบไม่ได้ในรอบนี้ และไม่พบคำตอบสำรองจาก Ceo Knowledge');
          const reason=String(result?.reason||job?.error?.message||job?.status||'OLLAMA_UNAVAILABLE');
          setProvider('AUTO · KNOWLEDGE FALLBACK');
          setItems(v=>[...v,{role:'ceo',text:fallback,meta:'KNOWLEDGE FALLBACK · '+reason}]);
        }
      } else {
        const mode=String(r?.mode||r?.intent||'knowledge');
        const label=mode==='cloud-ai'?'CLOUD · AI':mode==='knowledge'||mode==='knowledge-only'?'AUTO · KNOWLEDGE':'CLOUD · SECRETARY';
        setProvider(label);
        setItems(v=>[...v,{role:'ceo',text:r.answer||'เรียบร้อย',meta:label.replace('AUTO · ','')}]);
      }
    } catch(e:any){
      setProvider('AUTO · ERROR');
      setItems(v=>[...v,{role:'ceo',text:'เกิดข้อผิดพลาด: '+String(e?.message||e),meta:'ERROR'}]);
    } finally { setBusy(false); setThinking('Ceo กำลังค้นความจำ…'); }
  }
  return <div className="chat-shell flex flex-col min-h-0"><div className="flex items-center justify-between gap-3 pb-3"><div><div className="font-semibold">Ceo Chat / Ollama</div><div className="muted text-[11px]">Fallback AI · ใช้เมื่อไม่ได้สั่งผ่าน ChatGPT</div></div><span className="badge">{provider}</span></div><div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1">{items.map((item,i)=><div key={i} className={'chat-bubble '+(item.role==='user'?'chat-user':'chat-ceo')}>{item.text}{item.role==='ceo'&&item.meta&&<div className="chat-meta">{item.meta}</div>}</div>)}{busy&&<div className="chat-bubble chat-ceo muted">{thinking}</div>}</div><div className="chat-composer pt-3 flex gap-2"><input className="input" value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void send()} placeholder="พิมพ์ถาม Ceo…"/><button className="btn btn-primary px-4" onClick={()=>void send()} disabled={busy||!message.trim()}><MessageSquareText size={20}/></button></div></div>;
}
function TodayPage() {
  const [data,setData]=useState<{events:EventRecord[];tasks:TaskRecord[]}|null>(null); const [error,setError]=useState('');
  const load=async()=>{setError('');try{setData(await api.today());}catch(e:any){setError(String(e?.message||e));}};
  useEffect(()=>{void load();},[]);
  return <div className="space-y-5"><HeaderRow title="วันนี้" onRefresh={load}/>{error&&<p className="text-red-300">{error}</p>}<section><h2 className="font-semibold mb-2">นัด / กิจกรรม</h2><div className="space-y-2">{data?.events.length?data.events.map(e=><div className="card p-4" key={e.id}><div className="flex justify-between gap-3"><div><div className="font-semibold">{e.title}</div><div className="muted text-sm mt-1">{new Date(e.start_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}{e.location?` · ${e.location}`:''}</div></div><CalendarDays className="accent" size={20}/></div></div>):<Empty text="วันนี้ยังไม่มีนัด"/>}</div></section><section><h2 className="font-semibold mb-2">งานที่ยังเปิดอยู่</h2><div className="space-y-2">{data?.tasks.length?data.tasks.slice(0,12).map(t=><TaskCard task={t} onDone={load}/>):<Empty text="ไม่มีงานค้าง"/>}</div></section></div>;
}

function MemoryPage(){const[q,setQ]=useState('');const[rows,setRows]=useState<MemoryRecord[]>([]);const[text,setText]=useState('');const[busy,setBusy]=useState(false);const load=async()=>{setBusy(true);try{setRows((await api.memories(q)).memories);}finally{setBusy(false)}};useEffect(()=>{void load()},[]);async function remember(){if(!text.trim())return;await api.remember(text.trim());setText('');await load()}return <div className="space-y-4"><HeaderRow title="Memory" onRefresh={load}/><div className="card p-3 flex gap-2"><input className="input" value={text} onChange={e=>setText(e.target.value)} placeholder="เพิ่มสิ่งที่ต้องการให้ Ceo จำ"/><button className="btn btn-primary" onClick={()=>void remember()}><Plus size={18}/></button></div><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void load()} placeholder="ค้นความจำ"/></div><button className="btn" onClick={()=>void load()}>{busy?'…':'ค้น'}</button></div><div className="space-y-2">{rows.map(m=><div className="card p-4" key={m.id}><div className="flex justify-between gap-4"><div><div className="font-semibold">{m.title||m.memory_type}</div><p className="text-sm mt-2 leading-6 text-[#c7ccda]">{m.content}</p><div className="mt-3 flex gap-2 flex-wrap"><span className="badge">{m.memory_type}</span><span className="badge">สำคัญ {m.importance}/3</span></div></div><button className="text-xs muted self-start" onClick={async()=>{await api.forget(m.id);await load()}}>ลืม</button></div></div>)}{!rows.length&&!busy&&<Empty text="ยังไม่พบ Memory"/>}</div></div>}

function TaskCard({task,onDone}:{task:TaskRecord;onDone:()=>Promise<void>}){return <div className="card p-4 flex gap-3 items-start"><button className="mt-0.5" onClick={async()=>{if(task.status!=='completed'){await api.completeTask(task.id);await onDone()}}}>{task.status==='completed'?<CheckCircle2 className="text-green-400"/>:<Circle className="muted"/>}</button><div className="flex-1"><div className="font-semibold">{task.title}</div>{task.description&&<p className="muted text-sm mt-1">{task.description}</p>}<div className="flex gap-2 mt-2 flex-wrap"><span className="badge">{task.status}</span><span className="badge">{task.priority}</span>{task.due_at&&<span className="badge">ครบกำหนด {new Date(task.due_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</span>}</div></div></div>}
function TasksPage(){const[rows,setRows]=useState<TaskRecord[]>([]);const[text,setText]=useState('');const load=async()=>setRows((await api.tasks()).tasks);useEffect(()=>{void load()},[]);return <div className="space-y-4"><HeaderRow title="Tasks" onRefresh={load}/><div className="flex gap-2"><input className="input" value={text} onChange={e=>setText(e.target.value)} placeholder="เพิ่มงาน" onKeyDown={async e=>{if(e.key==='Enter'&&text.trim()){await api.addTask(text.trim());setText('');await load()}}}/><button className="btn btn-primary" onClick={async()=>{if(text.trim()){await api.addTask(text.trim());setText('');await load()}}}><Plus size={18}/></button></div><div className="space-y-2">{rows.map(t=><TaskCard key={t.id} task={t} onDone={load}/>)}{!rows.length&&<Empty text="ยังไม่มี Task"/>}</div></div>}

function DevicesPage(){const[rows,setRows]=useState<Array<DeviceRecord&{effective_status?:string}>>([]);const[code,setCode]=useState('');const[msg,setMsg]=useState('');const load=async()=>setRows((await api.devices()).devices);useEffect(()=>{void load();const id=setInterval(()=>void load(),15000);return()=>clearInterval(id)},[]);async function pair(){try{await api.pair(code);setCode('');setMsg('Pair เครื่องสำเร็จ');await load()}catch(e:any){setMsg(String(e?.message||e))}}return <div className="space-y-4"><HeaderRow title="Devices" onRefresh={load}/><div className="card p-4"><div className="flex items-center gap-2 mb-3"><ShieldCheck className="accent"/><div><div className="font-semibold">Pair เครื่อง Ceo Runtime</div><div className="muted text-xs">กรอกรหัส 6 หลักที่แสดงบนเครื่อง</div></div></div><div className="flex gap-2"><input className="input tracking-[.25em]" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" inputMode="numeric"/><button className="btn btn-primary" disabled={code.length!==6} onClick={()=>void pair()}>Pair</button></div>{msg&&<div className="text-sm mt-2 muted">{msg}</div>}</div><div className="space-y-2">{rows.map(d=><div className="card p-4" key={d.id}><div className="flex justify-between gap-3"><div><div className="font-semibold flex items-center gap-2"><Cpu size={17}/>{d.device_name}</div><div className="muted text-xs mt-1">{d.runtime_id||d.device_type}</div><div className="flex gap-2 mt-3"><span className="badge"><span className={`dot ${d.effective_status==='online'?'online':''}`}/>{d.effective_status||d.status}</span><span className="badge">{d.trusted?'TRUSTED':'PAIRING'}</span></div></div><button className="btn text-xs" disabled={!d.trusted||d.effective_status!=='online'} onClick={async()=>{try{const j=await api.runJob(d.id,'runtime.status');setMsg(`ส่ง Job แล้ว: ${j.id}`)}catch(e:any){setMsg(String(e?.message||e))}}}>ตรวจ Runtime</button></div></div>)}{!rows.length&&<Empty text="ยังไม่มีเครื่องที่ลงทะเบียน"/>}</div></div>}

function HeaderRow({title,onRefresh}:{title:string;onRefresh:()=>Promise<void>}){return <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">{title}</h1><button className="btn px-3" onClick={()=>void onRefresh()}><RefreshCw size={17}/></button></div>}
function Empty({text}:{text:string}){return <div className="card p-6 text-center muted text-sm">{text}</div>}

export default function App(){const initial=(()=>{const value=new URLSearchParams(window.location.search).get('tab');return(['console','chat','today','memory','tasks','graph','drive','devices'] as Tab[]).includes(value as Tab)?value as Tab:'console'})();const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);const[tab,setTab]=useState<Tab>(initial);useEffect(()=>{supabase.auth.getSession().then(({data})=>{captureCeoDriveProviderToken(data.session);setSession(data.session);setLoading(false)});const{data}=supabase.auth.onAuthStateChange((_e,s)=>{captureCeoDriveProviderToken(s);setSession(s)});if(new URLSearchParams(window.location.search).has('tab'))history.replaceState({},'',window.location.pathname);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>data.subscription.unsubscribe()},[]);const tabs=useMemo(()=>[{id:'console' as Tab,label:'Console',icon:Gauge},{id:'chat' as Tab,label:'Chat',icon:MessageSquareText},{id:'today' as Tab,label:'Today',icon:CalendarDays},{id:'tasks' as Tab,label:'Tasks',icon:CheckCircle2},{id:'graph' as Tab,label:'Graph',icon:Network},{id:'drive' as Tab,label:'Drive',icon:HardDrive},{id:'devices' as Tab,label:'Devices',icon:Cpu}],[]);if(loading)return <div className="min-h-screen grid place-items-center muted">กำลังเปิด Ceo…</div>;if(!session)return <Login onReady={()=>void supabase.auth.getSession().then(({data})=>{captureCeoDriveProviderToken(data.session);setSession(data.session)})}/>;const Page=tab==='chat'?ChatPage:tab==='today'?TodayPage:tab==='memory'?MemoryPage:tab==='tasks'?TasksPage:tab==='graph'?GraphPage:tab==='drive'?DrivePage:tab==='devices'?DevicesPage:null;return <div className="min-h-screen max-w-3xl mx-auto"><header className="h-16 px-4 flex items-center justify-between border-b border-[#202533] sticky top-0 bg-[#090b10]/95 backdrop-blur z-10"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-[#f4c95d] text-black grid place-items-center"><Brain size={19}/></div><div><div className="font-bold leading-4">Ceo</div><div className="text-[11px] muted">Remote Console · Secretary Dashboard</div></div></div><button className="btn px-3" title="ออกจากระบบ" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/></button></header><main className="p-4 pb-32">{tab==='console'?<ConsolePage onNavigate={target=>setTab(target as Tab)}/>:Page?<Page/>:null}</main><nav className="fixed bottom-0 left-0 right-0 safe-bottom glass z-20"><div className="max-w-3xl mx-auto grid grid-cols-7 px-1 pt-2">{tabs.map(t=>{const I=t.icon,active=tab===t.id;return <button key={t.id} onClick={()=>setTab(t.id)} className={'py-2 flex flex-col items-center gap-1 text-[10px] '+(active?'accent':'muted')}><I size={19}/><span>{t.label}</span></button>})}</div></nav></div>}
