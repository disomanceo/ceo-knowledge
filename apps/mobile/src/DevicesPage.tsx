import { useEffect, useState } from 'react';
import { Cpu, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import type { DeviceRecord } from '@ceo-knowledge/shared';
import { api } from './api';

type DeviceView = DeviceRecord & { effective_status?: string };

export default function DevicesPage(){
  const[rows,setRows]=useState<DeviceView[]>([]);const[code,setCode]=useState('');const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');
  const load=async()=>setRows((await api.devices()).devices);
  useEffect(()=>{void load();const id=setInterval(()=>void load(),15000);return()=>clearInterval(id)},[]);
  async function pair(){try{setBusy('pair');await api.pair(code);setCode('');setMsg('Pair เครื่องสำเร็จ');await load()}catch(e:any){setMsg(String(e?.message||e))}finally{setBusy('')}}
  async function access(device:DeviceView,action:'disable'|'enable'|'revoke'){
    const label=action==='disable'?'ปิดการเชื่อมต่อชั่วคราว':action==='enable'?'เปิดการเชื่อมต่ออีกครั้ง':'ถอนความไว้วางใจและต้อง Pair ใหม่';
    if(!window.confirm(label+' สำหรับ '+device.device_name+' ?'))return;
    try{setBusy(device.id+action);await api.deviceAccess(device.id,action);setMsg(action==='revoke'?'Revoke แล้ว — เครื่องนี้ต้อง Pair ใหม่':action==='disable'?'Disable แล้ว':'Enable แล้ว รอ heartbeat จากเครื่อง');await load()}catch(e:any){setMsg(String(e?.message||e))}finally{setBusy('')}
  }
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Devices</h1><p className="muted text-xs mt-1">เครื่องที่ผูกกับบัญชี Ceo ปัจจุบัน</p></div><button className="btn px-3" onClick={()=>void load()}><RefreshCw size={17}/></button></div>
    <div className="card p-4"><div className="flex items-center gap-2 mb-3"><ShieldCheck className="accent"/><div><div className="font-semibold">Pair เครื่อง Ceo Runtime</div><div className="muted text-xs">ใช้อีเมลเดียวกับ Ceo บนเครื่อง แล้วกรอกรหัส Pairing 6 หลัก</div></div></div><div className="flex gap-2"><input className="input tracking-[.25em]" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" inputMode="numeric"/><button className="btn btn-primary" disabled={code.length!==6||busy==='pair'} onClick={()=>void pair()}>{busy==='pair'?'…':'Pair'}</button></div>{msg&&<div className="text-sm mt-3 muted">{msg}</div>}</div>
    <div className="space-y-2">{rows.map(d=>{const disabled=d.status==='disabled'||d.effective_status==='disabled';return <div className="card p-4" key={d.id}><div className="flex justify-between gap-3"><div className="min-w-0"><div className="font-semibold flex items-center gap-2"><Cpu size={17}/><span className="truncate">{d.device_name}</span></div><div className="muted text-xs mt-1">{d.runtime_id||d.device_type}</div><div className="flex gap-2 mt-3 flex-wrap"><span className="badge"><span className={'dot '+(d.effective_status==='online'?'online':'')}/>{d.effective_status||d.status}</span><span className="badge">{d.trusted?'TRUSTED':'PAIR REQUIRED'}</span></div></div><button className="btn text-xs" disabled={!d.trusted||d.effective_status!=='online'} onClick={async()=>{try{const j=await api.runJob(d.id,'runtime.status');setMsg('ส่ง Runtime check แล้ว: '+j.id)}catch(e:any){setMsg(String(e?.message||e))}}}>ตรวจ Runtime</button></div>
      <div className="mt-4 pt-3 border-t border-[#242937] flex gap-2 flex-wrap">{d.trusted&&<button className="btn text-xs" disabled={Boolean(busy)} onClick={()=>void access(d,disabled?'enable':'disable')}>{disabled?'Enable':'Disable'}</button>}{d.trusted&&<button className="btn text-xs danger-btn" disabled={Boolean(busy)} onClick={()=>void access(d,'revoke')}><ShieldOff size={15}/> Revoke</button>}{!d.trusted&&<span className="muted text-xs">เครื่องนี้ถูกถอน Trust แล้ว ให้ Pair ใหม่จากรหัสบนเครื่อง</span>}</div>
    </div>})}{!rows.length&&<div className="card p-6 text-center muted text-sm">ยังไม่มีเครื่องที่ลงทะเบียน</div>}</div>
  </div>;
}
