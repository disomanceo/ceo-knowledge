import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { ClaimRecord } from '@ceo-knowledge/shared';
import { api } from './api';

function statusLabel(value:string){return value==='confirmed'?'CONFIRMED':value==='single_source'?'1 SOURCE':value==='conflicting'?'CONFLICT':value==='refuted'?'REFUTED':'UNVERIFIED'}
function statusClass(value:string){return value==='confirmed'?'text-green-400':value==='conflicting'||value==='refuted'?'text-red-300':'accent'}

export default function ClaimsPage(){
  const[projectId,setProjectId]=useState('');
  const[rows,setRows]=useState<ClaimRecord[]>([]);
  const[claim,setClaim]=useState('');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[evidence,setEvidence]=useState<Record<string,string>>({});
  const filtered=useMemo(()=>rows,[rows]);
  async function load(){setBusy(true);setError('');try{setRows((await api.claims(projectId.trim())).claims||[])}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}}
  useEffect(()=>{void load()},[]);
  async function addClaim(){const text=claim.trim();if(!text)return;setBusy(true);setError('');try{await api.addClaim(text,projectId.trim());setClaim('');await load()}catch(e:any){setError(String(e?.message||e));setBusy(false)}}
  async function addEvidence(nodeId:string,relation:'SUPPORTED_BY'|'CONTRADICTS'){const ref=(evidence[nodeId]||'').trim();if(!ref)return;setBusy(true);setError('');try{await api.addClaimEvidence(nodeId,relation,ref);setEvidence(v=>({...v,[nodeId]:''}));await load()}catch(e:any){setError(String(e?.message||e));setBusy(false)}}
  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Claims & Evidence</h1><p className="muted text-xs mt-1">ข้ออ้าง/ข้อสรุปแยกจาก Fact และตรวจหลักฐานได้</p></div><button className="btn px-3" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <section className="card p-4 space-y-3"><div className="grid gap-2"><label className="muted text-xs">Project ID (ไม่ใส่ = ดูทุก Claim)</label><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={projectId} onChange={e=>setProjectId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void load()} placeholder="เช่น project_ceo"/></div><button className="btn" onClick={()=>void load()}>กรอง</button></div></div></section>
    <section className="card p-4 space-y-3"><div className="font-semibold">เพิ่ม Claim</div><textarea className="input min-h-24 resize-y" value={claim} onChange={e=>setClaim(e.target.value)} placeholder="เช่น วิธี A เร็วกว่าวิธี B เมื่อใช้ข้อมูลขนาดใหญ่"/><button className="btn btn-primary w-full" disabled={busy||!claim.trim()} onClick={()=>void addClaim()}><Plus size={17}/> เพิ่ม Claim</button></section>
    <div className="space-y-3">{filtered.map(row=><section className="card p-4" key={row.node_id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold">{row.title||'Claim'}</div><p className="text-sm mt-2 leading-6 text-[#c7ccda]">{row.content}</p></div><div className={'text-xs font-semibold whitespace-nowrap '+statusClass(row.evidence_status)}>{statusLabel(row.evidence_status)}</div></div><div className="mt-3 flex gap-2 flex-wrap"><span className="badge">REV {row.revision}</span>{row.project_ref&&<span className="badge">{row.project_ref}</span>}<span className="badge">EVIDENCE {row.evidence?.length||0}</span></div>{row.evidence?.length>0&&<div className="mt-3 space-y-1">{row.evidence.map((item,i)=><div key={i} className="text-xs muted flex gap-2 items-start">{item.relation==='SUPPORTED_BY'?<CheckCircle2 size={14} className="text-green-400 mt-0.5"/>:<AlertTriangle size={14} className="text-red-300 mt-0.5"/>}<span className="break-all">{item.relation} · {item.sourceRef}</span></div>)}</div>}<div className="mt-4 grid gap-2"><input className="input" value={evidence[row.node_id]||''} onChange={e=>setEvidence(v=>({...v,[row.node_id]:e.target.value}))} placeholder="Source ref / URL / source ID"/><div className="grid grid-cols-2 gap-2"><button className="btn" disabled={busy||!(evidence[row.node_id]||'').trim()} onClick={()=>void addEvidence(row.node_id,'SUPPORTED_BY')}><ShieldCheck size={16}/> สนับสนุน</button><button className="btn" disabled={busy||!(evidence[row.node_id]||'').trim()} onClick={()=>void addEvidence(row.node_id,'CONTRADICTS')}><AlertTriangle size={16}/> ขัดแย้ง</button></div></div></section>)}{!filtered.length&&!busy&&<div className="card p-6 text-center muted text-sm">ยังไม่มี Claim ในขอบเขตนี้</div>}</div>
  </div>
}