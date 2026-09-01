import { rest, rpc, type Env } from './supabase';

const clean=(value:unknown,max=12000)=>String(value??'').normalize('NFC').replace(/\u0000/g,'').trim().slice(0,max);
const nowMs=()=>Date.now();
const meta=(row:any)=>row?.metadata&&typeof row.metadata==='object'&&!Array.isArray(row.metadata)?row.metadata:{};
const archived=(row:any)=>meta(row).archived===true;
const protectedNode=(row:any)=>row?.tier==='pinned'||row?.retention_policy==='permanent'||meta(row).pinned===true;
const daysOld=(row:any,now=nowMs())=>Math.max(0,(now-(Date.parse(String(row?.updated_at||row?.created_at||''))||now))/86400000);
const dayKey=(value:any)=>{const ms=Date.parse(String(value||''));return Number.isFinite(ms)?new Date(ms).toISOString().slice(0,10):''};

function normalized(value:unknown){return clean(value,20000).toLocaleLowerCase().replace(/^(?:memory|note|question)\s*:\s*/i,'').replace(/[\s\p{P}\p{S}]+/gu,'').trim()}
function trigrams(value:string){const s=`  ${value}  `,out=new Set<string>();for(let i=0;i<=s.length-3;i++)out.add(s.slice(i,i+3));return out}
export function memorySimilarity(a:unknown,b:unknown){
  const x=normalized(a),y=normalized(b);if(!x||!y)return 0;if(x===y)return 1;
  const min=Math.min(x.length,y.length),max=Math.max(x.length,y.length);if(min>=10&&(x.includes(y)||y.includes(x)))return Math.max(.82,min/max);
  if(min<8)return 0;const A=trigrams(x),B=trigrams(y);let inter=0;for(const t of A)if(B.has(t))inter++;const union=A.size+B.size-inter;return union?inter/union:0;
}
function canonicalScore(row:any){
  const m=meta(row);return (row.tier==='pinned'?120:0)+(row.retention_policy==='permanent'?70:0)+(m.canonical===true?45:0)+Number(row.importance||0)*12+Math.min(12,(Array.isArray(row.source_refs)?row.source_refs.length:0)*2)+Math.min(10,clean(row.content,2000).length/220)+(Date.parse(String(row.updated_at||''))||0)/1e15;
}
function compatibleDates(a:any,b:any){const x=dayKey(a?.event_at),y=dayKey(b?.event_at);return !x||!y||x===y}

export type MemoryMaintenancePlan={
  generatedAt:string;candidateCount:number;activeCount:number;archivedCount:number;
  duplicateGroups:Array<{canonicalId:string;canonicalTitle:string;memberIds:string[];duplicateIds:string[];similarity:number;protectedIds:string[]}>;
  tierActions:Array<{nodeId:string;title:string;from:string;to:string;reason:string;ageDays:number}>;
  archiveActions:Array<{nodeId:string;title:string;reason:string;ageDays:number}>;
  stats:{duplicateGroups:number;duplicateNodes:number;tierChanges:number;archiveCandidates:number;protected:number};
};

async function loadRows(env:Env,token:string,limit:number){
  const bounded=Math.max(20,Math.min(500,Math.round(Number(limit)||250)));
  return await rest<any[]>(env,token,`memory_nodes?select=*&node_type=in.(memory,event,task)&order=updated_at.desc&limit=${bounded}`).catch(()=>[]);
}

export async function planMemoryMaintenance(env:Env,token:string,{limit=250}:{limit?:number}={}):Promise<MemoryMaintenancePlan>{
  const rows=await loadRows(env,token,limit),active=rows.filter(row=>!archived(row));
  const parent=active.map((_,i)=>i);const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]!));const join=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
    const a=active[i]!,b=active[j]!;if(a.node_type!==b.node_type||!compatibleDates(a,b))continue;
    const sim=Math.max(memorySimilarity(a.title,b.title),memorySimilarity(a.content,b.content),memorySimilarity(`${a.title||''} ${a.content||''}`,`${b.title||''} ${b.content||''}`)),datedSame=Boolean(dayKey(a.event_at)&&dayKey(a.event_at)===dayKey(b.event_at));if(sim>=(datedSame?.68:.82))join(i,j);
  }
  const buckets=new Map<number,any[]>();for(let i=0;i<active.length;i++){const root=find(i),list=buckets.get(root)||[];list.push(active[i]);buckets.set(root,list)}
  const duplicateGroups=[] as MemoryMaintenancePlan['duplicateGroups'];
  for(const group of buckets.values()){
    if(group.length<2)continue;const sorted=[...group].sort((a,b)=>canonicalScore(b)-canonicalScore(a));const canonical=sorted[0],duplicates=sorted.slice(1);
    const sims=duplicates.map(x=>memorySimilarity(`${canonical.title||''} ${canonical.content||''}`,`${x.title||''} ${x.content||''}`));
    duplicateGroups.push({canonicalId:String(canonical.node_id),canonicalTitle:clean(canonical.title||canonical.content,180),memberIds:sorted.map(x=>String(x.node_id)),duplicateIds:duplicates.map(x=>String(x.node_id)),similarity:Math.round((Math.min(...sims))*1000)/1000,protectedIds:duplicates.filter(protectedNode).map(x=>String(x.node_id))});
  }
  const now=nowMs(),tierActions=[] as MemoryMaintenancePlan['tierActions'],archiveActions=[] as MemoryMaintenancePlan['archiveActions'];
  for(const row of active){
    const age=daysOld(row,now),from=String(row.tier||'hot');
    if(protectedNode(row)){if(from!=='pinned')tierActions.push({nodeId:String(row.node_id),title:clean(row.title,180),from,to:'pinned',reason:'protected_or_permanent',ageDays:Math.round(age)});continue}
    if(row.retention_policy==='temporary'&&age>=30){archiveActions.push({nodeId:String(row.node_id),title:clean(row.title,180),reason:'temporary_expired',ageDays:Math.round(age)});continue}
    let to=from,reason='';
    if(age>=180||Number(row.importance||0)<=1&&age>=120){to='cold';reason='old_low_relevance'}
    else if(age>=45){to='warm';reason='aging'}
    else if(age<30&&from!=='hot'){to='hot';reason='recent_active'}
    if(to!==from)tierActions.push({nodeId:String(row.node_id),title:clean(row.title,180),from,to,reason,ageDays:Math.round(age)});
  }
  const duplicateIds=new Set(duplicateGroups.flatMap(g=>g.duplicateIds));
  const safeArchive=archiveActions.filter(a=>!duplicateIds.has(a.nodeId));
  return {generatedAt:new Date().toISOString(),candidateCount:rows.length,activeCount:active.length,archivedCount:rows.length-active.length,duplicateGroups,tierActions,archiveActions:safeArchive,stats:{duplicateGroups:duplicateGroups.length,duplicateNodes:duplicateGroups.reduce((n,g)=>n+g.duplicateIds.length,0),tierChanges:tierActions.length,archiveCandidates:safeArchive.length,protected:rows.filter(protectedNode).length}};
}

export async function manageMemoryNode(env:Env,token:string,nodeId:string,action:string,payload:any={}){
  return await rpc<any>(env,token,'memory_node_manage',{p_node_id:clean(nodeId,160),p_action:clean(action,40),p_payload:payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{}});
}

export async function applyMemoryMaintenance(env:Env,token:string,{limit=250,maxActions=80}:{limit?:number;maxActions?:number}={}){
  const plan=await planMemoryMaintenance(env,token,{limit}),bounded=Math.max(1,Math.min(200,Math.round(Number(maxActions)||80)));let used=0;
  const applied:any[]=[];const skipped:any[]=[];
  for(const group of plan.duplicateGroups){
    if(used>=bounded)break;
    const safeDup=group.duplicateIds.filter(id=>!group.protectedIds.includes(id));if(!safeDup.length){skipped.push({kind:'duplicate_group',canonicalId:group.canonicalId,reason:'ALL_DUPLICATES_PROTECTED'});continue}
    try{const row=await manageMemoryNode(env,token,group.canonicalId,'mark_canonical',{derivedFrom:safeDup,metadata:{canonicalGroupSize:group.memberIds.length,gardenerAt:new Date().toISOString()}});applied.push({kind:'canonical',nodeId:group.canonicalId,row});used++;}catch(error:any){skipped.push({kind:'canonical',nodeId:group.canonicalId,reason:String(error?.message||error)});continue}
    for(const id of safeDup){if(used>=bounded)break;try{const row=await manageMemoryNode(env,token,id,'link_duplicate',{canonicalOf:group.canonicalId});applied.push({kind:'duplicate_archive',nodeId:id,canonicalOf:group.canonicalId,row});used++;}catch(error:any){skipped.push({kind:'duplicate_archive',nodeId:id,reason:String(error?.message||error)})}}
  }
  const duplicateTouched=new Set(applied.filter(x=>x.kind==='duplicate_archive').map(x=>x.nodeId));
  for(const action of plan.archiveActions){if(used>=bounded)break;if(duplicateTouched.has(action.nodeId))continue;try{const row=await manageMemoryNode(env,token,action.nodeId,'archive',{reason:action.reason});applied.push({kind:'archive',nodeId:action.nodeId,row});used++;}catch(error:any){skipped.push({kind:'archive',nodeId:action.nodeId,reason:String(error?.message||error)})}}
  for(const action of plan.tierActions){if(used>=bounded)break;if(duplicateTouched.has(action.nodeId))continue;try{const row=await manageMemoryNode(env,token,action.nodeId,'set_tier',{tier:action.to,metadata:{tierReason:action.reason,tierUpdatedAt:new Date().toISOString()}});applied.push({kind:'tier',nodeId:action.nodeId,to:action.to,row});used++;}catch(error:any){skipped.push({kind:'tier',nodeId:action.nodeId,reason:String(error?.message||error)})}}
  const result={appliedCount:applied.length,skippedCount:skipped.length,limited:used>=bounded,applied,skipped};
  await rest<any[]>(env,token,'memory_maintenance_runs?select=*',{method:'POST',body:{mode:'apply',status:skipped.length?'partial':'completed',plan,result},prefer:'return=minimal'}).catch(()=>[]);
  return {plan,result};
}
