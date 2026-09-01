import { useEffect, useState } from 'react';
import { Check, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { api } from './api';

type Approval={id:string;device_id:string;tool:string;arguments?:Record<string,unknown>;status:string;approval_state:string;origin:string;created_at:string;expires_at:string};

export default function ApprovalsPage(){
  const[rows,setRows]=useState<Approval[]>([]);const[busy,setBusy]=useState('');const[msg,setMsg]=useState('');
  const load=async()=>setRows((await api.approvals()).approvals);
  useEffect(()=>{void load();const id=setInterval(()=>void load(),10000);return()=>clearInterval(id)},[]);
  async function decide(row:Approval,decision:'approved'|'denied'){const yes=window.confirm((decision==='approved'?'อนุมัติ':'ปฏิเสธ')+' คำสั่ง '+row.tool+' ?');if(!yes)return;try{setBusy(row.id);await api.setApproval(row.id,decision);setMsg(decision==='approved'?'อนุมัติแล้ว เครื่องจะรับงานในรอบถัดไป':'ปฏิเสธและยกเลิก Job แล้ว');await load()}catch(e:any){setMsg(String(e?.message||e))}finally{setBusy('')}}
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Approvals</h1><p className="muted text-xs mt-1">คำสั่งที่ต้องยืนยันก่อน Ceo Runtime ลงมือ</p></div><button className="btn px-3" onClick={()=>void load()}><RefreshCw size={17}/></button></div>{msg&&<div className="card p-3 text-sm muted">{msg}</div>}<div className="space-y-3">{rows.map(row=><div className="card p-4" key={row.id}><div className="flex items-start gap-3"><ShieldAlert className="accent shrink-0" size={20}/><div className="min-w-0 flex-1"><div className="font-semibold">{row.tool}</div><div className="muted text-xs mt-1">{new Date(row.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {row.origin}</div><pre className="approval-args mt-3">{JSON.stringify(row.arguments||{},null,2)}</pre></div></div><div className="flex gap-2 mt-4"><button className="btn btn-primary flex-1" disabled={busy===row.id} onClick={()=>void decide(row,'approved')}><Check size={17}/> อนุมัติ</button><button className="btn danger-btn flex-1" disabled={busy===row.id} onClick={()=>void decide(row,'denied')}><X size={17}/> ปฏิเสธ</button></div></div>)}{!rows.length&&<div className="card p-7 text-center"><ShieldAlert className="mx-auto muted mb-2"/><div className="font-semibold">ไม่มีคำสั่งรออนุมัติ</div><div className="muted text-xs mt-1">งานอ่านไฟล์ Local ที่อ่อนไหวจะมารอที่หน้านี้ก่อนทำจริง</div></div>}</div></div>;
}
