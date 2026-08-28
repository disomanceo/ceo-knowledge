import { useEffect, useState } from 'react';
import { Brain, CalendarDays, CheckCircle2, Cpu, HardDrive, MessageSquareText, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DeviceRecord, EventRecord, TaskRecord } from '@ceo-knowledge/shared';
import { api } from './api';

export type ConsoleTarget = 'chat' | 'today' | 'memory' | 'tasks' | 'graph' | 'drive' | 'devices';
type RuntimeJob = { id:string; device_id:string; tool:string; status:string; approval_state:string; origin:string; created_at:string; finished_at?:string|null; error?:any };

type Snapshot = {
  events: EventRecord[];
  tasks: TaskRecord[];
  devices: Array<DeviceRecord & { effective_status?: string }>;
  jobs: RuntimeJob[];
  driveEnabled: boolean;
};

function Stat({label,value,note,active=false}:{label:string;value:string|number;note:string;active?:boolean}){
  return <div className="card console-stat p-4"><div className="muted text-xs">{label}</div><div className={'text-2xl font-bold mt-1 '+(active?'accent':'')}>{value}</div><div className="muted text-[11px] mt-1">{note}</div></div>;
}

function Action({icon:Icon,title,note,onClick}:{icon:any;title:string;note:string;onClick:()=>void}){
  return <button className="card console-action p-4 text-left" onClick={onClick}><div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-[#171b26] grid place-items-center"><Icon size={19} className="accent"/></div><div><div className="font-semibold">{title}</div><div className="muted text-xs mt-1 leading-5">{note}</div></div></div></button>;
}

export default function ConsolePage({onNavigate}:{onNavigate:(target:ConsoleTarget)=>void}){
  const[data,setData]=useState<Snapshot|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{const[today,devices,jobs,drive]=await Promise.all([api.today(),api.devices(),api.jobs(8),api.driveConfig().catch(()=>({enabled:false} as any))]);setData({events:today.events,tasks:today.tasks,devices:devices.devices,jobs:jobs.jobs,driveEnabled:Boolean(drive.enabled)})}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}}
  useEffect(()=>{void load();const id=setInterval(()=>void load(),30000);return()=>clearInterval(id)},[]);
  const online=data?.devices.filter(d=>d.effective_status==='online').length||0;
  const trusted=data?.devices.filter(d=>d.trusted).length||0;
  const activeJobs=data?.jobs.filter(j=>['pending','accepted','running'].includes(j.status)).length||0;
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Ceo Remote Console</h1><p className="muted text-xs mt-1">Secretary Dashboard · ควบคุมและตรวจสถานะ Ceo จากมือถือ</p></div><button className="btn px-3" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <div className="grid grid-cols-2 gap-3"><Stat label="Runtime Online" value={online} note={trusted+' trusted device'} active={online>0}/><Stat label="งานค้าง" value={data?.tasks.length||0} note="เปิดอยู่ใน Ceo Tasks"/><Stat label="กิจกรรมวันนี้" value={data?.events.length||0} note="Cloud Secretary"/><Stat label="Remote Jobs" value={activeJobs} note="pending / running" active={activeJobs>0}/></div>
    <section className="card p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><ShieldCheck size={20} className={online>0?'text-green-400':'muted'}/><div><div className="font-semibold">System readiness</div><div className="muted text-xs mt-1">{online>0?'Ceo Runtime พร้อมรับงานจาก Cloud':'ไม่มี Runtime online — Cloud data ยังเปิดดูได้'}</div></div></div><span className="badge"><span className={'dot '+(online>0?'online':'')}/>{online>0?'READY':'CLOUD ONLY'}</span></div></section>
    <section><div className="flex items-center justify-between mb-2"><h2 className="font-semibold">ทางลัด</h2><span className="muted text-xs">ChatGPT = สมองหลัก · Ceo = ระบบปฏิบัติการ</span></div><div className="grid grid-cols-2 gap-3"><Action icon={MessageSquareText} title="Chat / Ollama" note="AI สำรองเมื่อไม่ได้ใช้ ChatGPT" onClick={()=>onNavigate('chat')}/><Action icon={CalendarDays} title="Today" note="นัดและงานของวันนี้" onClick={()=>onNavigate('today')}/><Action icon={CheckCircle2} title="Tasks" note="เพิ่ม/ปิดงานจากมือถือ" onClick={()=>onNavigate('tasks')}/><Action icon={Brain} title="Memory" note="ดูและจัดการ Ceo Knowledge" onClick={()=>onNavigate('memory')}/><Action icon={Network} title="Graph" note="ดูความเชื่อมโยง Knowledge" onClick={()=>onNavigate('graph')}/><Action icon={HardDrive} title="Drive" note={data?.driveEnabled?'Google backend พร้อมเชื่อม':'Google OAuth ยัง Setup Required'} onClick={()=>onNavigate('drive')}/><Action icon={Cpu} title="Devices" note="Pair / ตรวจ Runtime / Remote Job" onClick={()=>onNavigate('devices')}/></div></section>
    <section><div className="flex items-center justify-between mb-2"><h2 className="font-semibold">Remote Jobs ล่าสุด</h2><button className="text-xs accent" onClick={()=>onNavigate('devices')}>เปิด Devices</button></div><div className="space-y-2">{data?.jobs.length?data.jobs.slice(0,6).map(job=><div className="card p-3" key={job.id}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-sm truncate">{job.tool}</div><div className="muted text-[11px] mt-1">{new Date(job.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {job.origin}</div></div><span className="badge">{job.status}</span></div></div>):<div className="card p-5 text-center muted text-sm">ยังไม่มี Remote Job ล่าสุด</div>}</div></section>
  </div>;
}
