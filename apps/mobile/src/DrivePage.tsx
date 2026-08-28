import { useEffect, useState } from 'react';
import { ArrowLeft, Cloud, FileText, Folder, Link2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { CeoDriveConfig, CeoDriveFile, CeoDriveImportResult, CeoDrivePreview } from '@ceo-knowledge/shared';
import { api } from './api';
import { ceoDriveProviderToken, ceoDriveTokenCapturedAt, clearCeoDriveProviderToken, connectCeoDrive } from './drive';

const fileBadge=(file:CeoDriveFile)=>file.importMode==='cloud-text'?'Cloud import':file.importMode==='folder'?'Folder':file.importMode==='runtime-required'?'Runtime required':'Unsupported';
const readableSize=(size:number|null)=>size===null?'':size<1024?size+' B':size<1048576?(size/1024).toFixed(1)+' KB':(size/1048576).toFixed(1)+' MB';

export default function DrivePage(){
  const[config,setConfig]=useState<CeoDriveConfig|null>(null);
  const[token,setToken]=useState(()=>ceoDriveProviderToken());
  const[status,setStatus]=useState<any>(null);
  const[files,setFiles]=useState<CeoDriveFile[]>([]);
  const[q,setQ]=useState('');
  const[folderStack,setFolderStack]=useState<Array<{id:string;name:string}>>([{id:'',name:'My Drive'}]);
  const[preview,setPreview]=useState<CeoDrivePreview|null>(null);
  const[imported,setImported]=useState<CeoDriveImportResult|null>(null);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const currentFolder=folderStack[folderStack.length-1]||{id:'',name:'My Drive'};

  async function loadConfig(){try{setConfig(await api.driveConfig())}catch(e:any){setError(String(e?.message||e))}}
  async function load(nextToken=token, search=q, folderId=currentFolder.id){
    if(!nextToken)return;
    setBusy(true);setError('');
    try{const[s,list]=await Promise.all([api.driveStatus(nextToken),api.driveFiles(nextToken,search,folderId)]);setStatus(s);setFiles(list.files);setPreview(null)}
    catch(e:any){const msg=String(e?.message||e);setError(msg);if(/DRIVE_RECONNECT_REQUIRED|DRIVE_CONNECT_REQUIRED/.test(msg)){clearCeoDriveProviderToken();setToken('');setStatus(null);setFiles([])}}
    finally{setBusy(false)}
  }
  useEffect(()=>{void loadConfig();const t=ceoDriveProviderToken();setToken(t);if(t)void load(t,'','')},[]);

  async function connect(){setError('');try{await connectCeoDrive()}catch(e:any){setError(String(e?.message||e))}}
  async function showPreview(file:CeoDriveFile){if(!token)return;setBusy(true);setError('');setImported(null);try{setPreview(await api.drivePreview(token,file.id))}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}}
  async function importCurrent(){if(!token||!preview?.importable)return;setBusy(true);setError('');try{setImported(await api.driveImport(token,preview.file.id));await load(token,q,currentFolder.id)}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}}
  async function openFolder(file:CeoDriveFile){setFolderStack(v=>[...v,{id:file.id,name:file.name}]);setQ('');setPreview(null);if(token)await load(token,'',file.id)}
  async function back(){if(folderStack.length<=1)return;const next=folderStack.slice(0,-1);setFolderStack(next);setQ('');setPreview(null);if(token)await load(token,'',next[next.length-1]?.id||'')}

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Ceo Drive</h1><p className="muted text-xs mt-1">เลือกไฟล์ก่อน · Preview ก่อน Import · ไม่เก็บ Google token ถาวร</p></div><button className="btn px-3" onClick={()=>{void loadConfig();if(token)void load()}} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-[#171b26] grid place-items-center"><Cloud className="accent" size={20}/></div><div><div className="font-semibold">Google Drive backend</div><div className="muted text-xs mt-1">สิทธิ์อ่านอย่างเดียว · browser session only</div></div></div><ShieldCheck className={config?.enabled?'text-green-400':'muted'} size={20}/></div>
      {!config?.enabled?<div className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm"><div className="font-semibold text-amber-200">Setup Required</div><p className="muted mt-1 leading-5">Maple ยังไม่ได้เปิด Google OAuth provider จึงยัง Connect Drive จริงไม่ได้ ตัว Ceo Drive/Worker พร้อมแล้ว แต่ต้องตั้ง Google OAuth Client ใน Supabase Auth หนึ่งครั้งก่อน</p></div>:token?<div className="mt-4 flex items-center justify-between gap-3"><div className="text-sm"><div className="text-green-300">Connected for this browser session</div><div className="muted text-xs mt-1">{status?.user?.emailAddress||status?.user?.displayName||'Google account'}{ceoDriveTokenCapturedAt()?' · '+new Date(ceoDriveTokenCapturedAt()).toLocaleTimeString('th-TH'):''}</div></div><button className="btn text-xs" onClick={()=>{clearCeoDriveProviderToken();setToken('');setStatus(null);setFiles([]);setPreview(null)}}>Disconnect</button></div>:<button className="btn btn-primary w-full mt-4" onClick={()=>void connect()}>Connect Ceo Drive</button>}
    </section>
    {token&&<>
      <div className="flex gap-2"><button className="btn px-3" disabled={folderStack.length<=1||busy} onClick={()=>void back()}><ArrowLeft size={18}/></button><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void load(token,q,currentFolder.id)} placeholder={'ค้นใน '+currentFolder.name}/></div><button className="btn" onClick={()=>void load(token,q,currentFolder.id)}>ค้น</button></div>
      <div className="flex items-center gap-2 text-xs muted"><Folder size={15}/><span>{folderStack.map(x=>x.name).join(' / ')}</span></div>
      <div className="space-y-2">{files.map(file=><div className="card p-4" key={file.id}><div className="flex justify-between gap-3"><div className="min-w-0 flex gap-3"><div className="mt-0.5">{file.importMode==='folder'?<Folder className="accent" size={20}/>:<FileText className="muted" size={20}/>}</div><div className="min-w-0"><div className="font-semibold truncate">{file.name}</div><div className="muted text-xs mt-1 truncate">{file.mimeType}{file.size!==null?' · '+readableSize(file.size):''}</div><div className="flex gap-2 mt-2 flex-wrap"><span className="badge">{fileBadge(file)}</span>{file.modifiedTime&&<span className="badge">{new Date(file.modifiedTime).toLocaleDateString('th-TH')}</span>}</div></div></div><div className="shrink-0">{file.importMode==='folder'?<button className="btn text-xs" onClick={()=>void openFolder(file)}>เปิด</button>:<button className="btn text-xs" onClick={()=>void showPreview(file)}>Preview</button>}</div></div></div>)}{!files.length&&!busy&&<div className="card p-6 text-center muted text-sm">ไม่พบไฟล์ในโฟลเดอร์นี้</div>}</div>
    </>}
    {preview&&<section className="card p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-lg">{preview.file.name}</div><div className="muted text-xs mt-1">{preview.exportMimeType||preview.file.mimeType}</div></div>{preview.file.webViewLink&&<a className="btn px-3 grid place-items-center" href={preview.file.webViewLink} target="_blank" rel="noreferrer" title="เปิดต้นฉบับ"><Link2 size={17}/></a>}</div>{preview.importable?<><pre className="drive-preview mt-4">{preview.content.slice(0,12000)}</pre>{preview.truncated&&<div className="muted text-xs mt-2">Preview ถูกจำกัดขนาดเพื่อความปลอดภัย</div>}<button className="btn btn-primary w-full mt-4" disabled={busy} onClick={()=>void importCurrent()}>{busy?'กำลัง Import…':'Import เข้า Ceo Knowledge'}</button></>:<div className="mt-4 rounded-xl border border-[#303646] p-3 text-sm"><div className="font-semibold">ยัง import บน Cloud ไม่ได้ใน V1</div><div className="muted mt-1">{preview.reason==='RUNTIME_IMPORT_REQUIRED'?'PDF/Word/Excel/PowerPoint จะให้ Ceo Runtime อ่านด้วย document engine ในรุ่นถัดไป':preview.reason}</div></div>}{imported&&<div className="mt-4 rounded-xl border border-green-900/50 bg-green-950/20 p-3 text-sm"><div className="text-green-300 font-semibold">Import สำเร็จ</div><div className="muted text-xs mt-1">Knowledge {imported.knowledgeId} · {imported.chunks} chunks</div></div>}</section>}
  </div>;
}
