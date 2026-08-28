import type { CeoDriveConfig, CeoDriveFile, CeoDriveImportResult, CeoDrivePreview } from '@ceo-knowledge/shared';
import { sha256Hex } from './security';
import { rest, type Env } from './supabase';

const DRIVE_API='https://www.googleapis.com/drive/v3';
export const CEO_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const GOOGLE_FOLDER='application/vnd.google-apps.folder';
const GOOGLE_DOC='application/vnd.google-apps.document';
const GOOGLE_SHEET='application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDES='application/vnd.google-apps.presentation';
const GOOGLE_SCRIPT='application/vnd.google-apps.script';
const TEXT_MIMES=new Set(['text/plain','text/markdown','text/csv','text/tab-separated-values','text/html','text/xml','application/json','application/xml','application/javascript','application/x-javascript','application/yaml','application/x-yaml','text/yaml']);
const BINARY_RUNTIME_MIMES=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']);

const clean=(value:unknown,max=10000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const safeId=(value:unknown)=>{const id=clean(value,200);if(!/^[A-Za-z0-9_-]{6,200}$/.test(id))throw Object.assign(new Error('DRIVE_FILE_ID_INVALID'),{status:400});return id};
const params=(input:Record<string,string|number|boolean|undefined|null>)=>{const q=new URLSearchParams();for(const[k,v]of Object.entries(input))if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v));return q.toString()};

export function driveProviderToken(request:Request):string {
  const token=clean(request.headers.get('x-ceo-drive-token'),8192);
  if(!token)throw Object.assign(new Error('DRIVE_CONNECT_REQUIRED'),{status:401});
  if(token.length<20)throw Object.assign(new Error('DRIVE_TOKEN_INVALID'),{status:401});
  return token;
}

function exportMime(mimeType:string):string {
  if(mimeType===GOOGLE_DOC)return 'text/markdown';
  if(mimeType===GOOGLE_SHEET)return 'text/csv';
  if(mimeType===GOOGLE_SLIDES)return 'text/plain';
  if(mimeType===GOOGLE_SCRIPT)return 'application/vnd.google-apps.script+json';
  return '';
}

export function driveImportMode(mimeType:string):CeoDriveFile['importMode'] {
  if(mimeType===GOOGLE_FOLDER)return 'folder';
  if(exportMime(mimeType)||TEXT_MIMES.has(mimeType))return 'cloud-text';
  if(BINARY_RUNTIME_MIMES.has(mimeType))return 'runtime-required';
  return 'unsupported';
}

function normalizeFile(raw:any):CeoDriveFile {
  const mimeType=clean(raw?.mimeType,300);
  const size=raw?.size===undefined||raw?.size===null?null:Number(raw.size);
  return {
    id:clean(raw?.id,200),name:clean(raw?.name,500),mimeType,size:Number.isFinite(size)?size:null,
    modifiedTime:clean(raw?.modifiedTime,100)||null,createdTime:clean(raw?.createdTime,100)||null,
    webViewLink:clean(raw?.webViewLink,2000),parents:Array.isArray(raw?.parents)?raw.parents.map((x:any)=>clean(x,200)).filter(Boolean):[],
    canDownload:raw?.capabilities?.canDownload!==false,importMode:driveImportMode(mimeType),
  };
}

async function googleFetch<T=any>(providerToken:string,path:string,fetchImpl:typeof fetch=fetch):Promise<T> {
  const response=await fetchImpl(path.startsWith('http')?path:DRIVE_API+path,{headers:{authorization:'Bearer '+providerToken,accept:'application/json'}});
  if(response.status===401||response.status===403)throw Object.assign(new Error('DRIVE_RECONNECT_REQUIRED'),{status:401});
  if(!response.ok){const text=await response.text();throw Object.assign(new Error('DRIVE_HTTP_'+response.status),{status:response.status,detail:text.slice(0,1000)});}
  return await response.json() as T;
}

async function googleText(providerToken:string,url:string,fetchImpl:typeof fetch=fetch):Promise<string> {
  const response=await fetchImpl(url,{headers:{authorization:'Bearer '+providerToken,accept:'text/plain,text/markdown,text/csv,application/json,*/*'}});
  if(response.status===401||response.status===403)throw Object.assign(new Error('DRIVE_RECONNECT_REQUIRED'),{status:401});
  if(!response.ok)throw Object.assign(new Error('DRIVE_CONTENT_HTTP_'+response.status),{status:response.status});
  const text=await response.text();
  return text.replace(/\u0000/g,'').slice(0,800000);
}

export async function ceoDriveConfig(env:Env,fetchImpl:typeof fetch=fetch):Promise<CeoDriveConfig> {
  let enabled=false;
  try {
    const response=await fetchImpl(env.SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:env.SUPABASE_ANON_KEY}});
    if(response.ok){const body:any=await response.json();enabled=body?.external?.google===true;}
  } catch {}
  return {provider:'google',enabled,scope:CEO_DRIVE_SCOPE,tokenPersistence:'browser-session-only',importableTypes:['Google Docs','Google Sheets','Google Slides','Markdown','Text','CSV','JSON','XML/YAML']};
}

export async function ceoDriveStatus(providerToken:string,fetchImpl:typeof fetch=fetch) {
  const data:any=await googleFetch(providerToken,DRIVE_API+'/about?'+params({fields:'user(displayName,emailAddress,photoLink),storageQuota(limit,usage),canCreateDrives'}),fetchImpl);
  return {connected:true,user:data?.user||{},storageQuota:data?.storageQuota||{},canCreateDrives:Boolean(data?.canCreateDrives)};
}

function escapeDriveQuery(value:string){return value.split('\\').join('\\\\').split("'").join("\\'")};

export async function ceoDriveFiles(providerToken:string,input:{q?:string;folderId?:string;pageToken?:string;pageSize?:number}={},fetchImpl:typeof fetch=fetch) {
  const pageSize=Math.max(1,Math.min(100,Math.round(Number(input.pageSize)||40)));
  const terms=["trashed = false"];
  if(input.folderId)terms.push("'"+escapeDriveQuery(input.folderId)+"' in parents");
  else if(!input.q)terms.push("'root' in parents");
  if(input.q)terms.push("name contains '"+escapeDriveQuery(clean(input.q,200))+"'");
  const url=DRIVE_API+'/files?'+params({q:terms.join(' and '),pageSize,pageToken:clean(input.pageToken,1000),orderBy:'folder,name',spaces:'drive',fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,capabilities(canDownload))',supportsAllDrives:true,includeItemsFromAllDrives:true});
  const data:any=await googleFetch(providerToken,url,fetchImpl);
  return {files:(Array.isArray(data?.files)?data.files:[]).map(normalizeFile),nextPageToken:clean(data?.nextPageToken,1000)};
}

export async function ceoDrivePreview(providerToken:string,fileId:string,fetchImpl:typeof fetch=fetch):Promise<CeoDrivePreview> {
  const id=safeId(fileId);
  const raw:any=await googleFetch(providerToken,DRIVE_API+'/files/'+encodeURIComponent(id)+'?'+params({fields:'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,capabilities(canDownload)',supportsAllDrives:true}),fetchImpl);
  const file=normalizeFile(raw);
  if(file.importMode!=='cloud-text')return {file,importable:false,reason:file.importMode==='runtime-required'?'RUNTIME_IMPORT_REQUIRED':file.importMode==='folder'?'DRIVE_FOLDER':'DRIVE_TYPE_UNSUPPORTED',exportMimeType:'',content:'',truncated:false};
  if(!file.canDownload)return {file,importable:false,reason:'DRIVE_DOWNLOAD_RESTRICTED',exportMimeType:'',content:'',truncated:false};
  const e=exportMime(file.mimeType);
  const url=e?DRIVE_API+'/files/'+encodeURIComponent(id)+'/export?'+params({mimeType:e}):DRIVE_API+'/files/'+encodeURIComponent(id)+'?'+params({alt:'media',supportsAllDrives:true});
  const content=await googleText(providerToken,url,fetchImpl);
  return {file,importable:Boolean(content.trim()),reason:content.trim()?'READY':'DRIVE_TEXT_EMPTY',exportMimeType:e||file.mimeType,content,truncated:content.length>=800000};
}

export function chunkCeoDriveText(value:string,chunkChars=3200,overlapChars=240):string[] {
  const text=String(value||'').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)return [];
  const max=Math.max(800,Math.min(10000,Math.round(chunkChars||3200)));
  const overlap=Math.max(0,Math.min(Math.floor(max/3),Math.round(overlapChars||240)));
  const out:string[]=[];
  let start=0;
  while(start<text.length){
    let end=Math.min(text.length,start+max);
    if(end<text.length){const slice=text.slice(start,end);const cut=Math.max(slice.lastIndexOf('\n\n'),slice.lastIndexOf('. '),slice.lastIndexOf(' '));if(cut>max*.6)end=start+cut+(slice[cut]==='.'?1:0);}
    const part=text.slice(start,end).trim();
    if(part)out.push(part);
    if(end>=text.length)break;
    start=Math.max(start+1,end-overlap);
  }
  return [...new Set(out)].slice(0,300);
}

function restQs(input:Record<string,string|number|undefined|null>){const q=new URLSearchParams();for(const[k,v]of Object.entries(input))if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v));const s=q.toString();return s?'?'+s:''}

export async function ceoDriveImport(env:Env,userToken:string,providerToken:string,fileId:string,fetchImpl:typeof fetch=fetch):Promise<CeoDriveImportResult> {
  const preview=await ceoDrivePreview(providerToken,fileId,fetchImpl);
  if(!preview.importable)throw Object.assign(new Error(preview.reason||'DRIVE_FILE_NOT_IMPORTABLE'),{status:400,detail:{file:preview.file}});
  const file=preview.file,content=preview.content.trim();
  const existingSources=await rest<any[]>(env,userToken,'sources'+restQs({select:'*',external_provider:'eq.ceo-drive-google',external_id:'eq.'+file.id,limit:1}));
  const sourcePayload={source_type:'web',name:file.name,url:file.webViewLink||('https://drive.google.com/open?id='+file.id),mime_type:file.mimeType,file_size:file.size,availability:'online',external_provider:'ceo-drive-google',external_id:file.id,last_checked_at:new Date().toISOString(),metadata:{provider:'ceo-drive',backend:'google-drive',modifiedTime:file.modifiedTime,createdTime:file.createdTime,exportMimeType:preview.exportMimeType,canDownload:file.canDownload}};
  let source:any;
  if(existingSources[0]){const rows=await rest<any[]>(env,userToken,'sources'+restQs({id:'eq.'+existingSources[0].id,select:'*'}),{method:'PATCH',body:sourcePayload,prefer:'return=representation'});source=rows[0]||existingSources[0];}
  else {const rows=await rest<any[]>(env,userToken,'sources?select=*',{method:'POST',body:sourcePayload,prefer:'return=representation'});source=rows[0];}
  if(!source?.id)throw Object.assign(new Error('DRIVE_SOURCE_SAVE_FAILED'),{status:500});

  const runs=await rest<any[]>(env,userToken,'ingest_runs?select=*',{method:'POST',body:{source_id:source.id,status:'saving',engine:'ceo-drive-cloud',model:'',bytes_read:new TextEncoder().encode(content).byteLength,detail:{provider:'ceo-drive',backend:'google-drive',fileId:file.id}},prefer:'return=representation'});
  const run=runs[0]||null;
  try {
    const fingerprint=await sha256Hex(['ceo-drive',file.id,content].join('\u001f').toLocaleLowerCase().replace(/\s+/g,' ').trim());
    const knowledgeRows=await rest<any[]>(env,userToken,'knowledge_entries'+restQs({select:'*',on_conflict:'user_id,fingerprint'}),{method:'POST',body:{source_id:source.id,title:file.name,summary:content.slice(0,1400),content,knowledge_type:'reference',topic:'Ceo Drive',importance:2,confidence:.9,status:'active',tags:['ceo-drive','google-drive'],fingerprint,metadata:{provider:'ceo-drive',backend:'google-drive',externalId:file.id,modifiedTime:file.modifiedTime,exportMimeType:preview.exportMimeType}},prefer:'resolution=merge-duplicates,return=representation'});
    const knowledge=knowledgeRows[0];
    if(!knowledge?.id)throw new Error('DRIVE_KNOWLEDGE_SAVE_FAILED');
    const chunks=chunkCeoDriveText(content);
    const keepIds:string[]=[];
    for(const [i,part] of chunks.entries()){const contentHash=await sha256Hex(part);const rows=await rest<any[]>(env,userToken,'knowledge_chunks'+restQs({select:'*',on_conflict:'knowledge_id,ordinal,content_hash'}),{method:'POST',body:{knowledge_id:knowledge.id,source_id:source.id,ordinal:i,content:part,content_hash:contentHash,token_estimate:Math.ceil(part.length/4),status:'active',metadata:{provider:'ceo-drive',externalId:file.id}},prefer:'resolution=merge-duplicates,return=representation'});if(rows[0]?.id)keepIds.push(rows[0].id);}
    if(keepIds.length!==chunks.length)throw new Error('DRIVE_CHUNK_SAVE_INCOMPLETE');
    if(keepIds.length){await rest<any[]>(env,userToken,'knowledge_chunks'+restQs({knowledge_id:'eq.'+knowledge.id,status:'eq.active',id:'not.in.('+keepIds.join(',')+')',select:'id'}),{method:'PATCH',body:{status:'archived'},prefer:'return=representation'}).catch(()=>[]);}
    if(run?.id)await rest<any[]>(env,userToken,'ingest_runs'+restQs({id:'eq.'+run.id,select:'*'}),{method:'PATCH',body:{status:'completed',finished_at:new Date().toISOString(),extracted_entities:1,detail:{provider:'ceo-drive',backend:'google-drive',fileId:file.id,knowledgeId:knowledge.id,chunks:chunks.length,truncated:preview.truncated}},prefer:'return=representation'}).catch(()=>[]);
    return {file,sourceId:source.id,knowledgeId:knowledge.id,ingestRunId:run?.id||null,chunks:chunks.length,updated:Boolean(existingSources[0])};
  } catch(error:any) {
    if(run?.id)await rest<any[]>(env,userToken,'ingest_runs'+restQs({id:'eq.'+run.id,select:'id'}),{method:'PATCH',body:{status:'failed',finished_at:new Date().toISOString(),error:{code:'CEO_DRIVE_IMPORT_FAILED',message:clean(error?.message||error,1000)}}}).catch(()=>[]);
    throw error;
  }
}
