import { filterActiveKnowledgeGraph, type DeviceRecord, type EventRecord, type KnowledgeGraphLink, type KnowledgeGraphNode, type MemoryRecord, type TaskRecord } from '@ceo-knowledge/shared';
import { assertRemoteTool, bearerToken, jsonBody, newIdempotencyKey, parseApprovalDecision, parseDeviceAccessAction, remoteApprovalState, safeLimit, searchOr, sha256Hex } from './security';
import { ceoDriveConfig, ceoDriveFiles, ceoDriveImport, ceoDrivePreview, ceoDriveStatus, driveProviderToken } from './drive';
import { cloudChatFallback, composeRecallAnswer, dedupeSemanticEvents, isBareRecallFieldQuestion, recallAction, recallAnswerField, recallSearchQuery, recallSearchTerms, recallSubjectMatches, recallSubjectQuery } from './chat';
import { composeTaskAnswer, composeTemporalAnswer, dedupeTemporalKnowledge, detectChatIntent, eventMatchesCalendarScope, isQuestionLike, memoryLooksLikeQuestion, memoryMatchesCalendarScope, temporalTextMatchesIntent, topicMatches, type TimeIntent } from './chat-intelligence';
import { enqueueOllamaChat, enqueueProviderChat, selectOllamaDevice, selectProviderChatDevice } from './runtime-chat';
import { askCloudAi, cloudAiConfig } from './cloud-ai';
import { contextResolutionPublic, isContextualQuestion, resolveConversationContext } from './context-resolver';
import { resolveLiveDirect } from './live-resolver';
import { analyzeIntelligenceV2, eventConstraintMatches } from './intelligence-v2';
import { researchTelemetry, researchWeb } from './web-research';
import { composeResearchAnswer } from './answer-intelligence';
import { rerankMemoryCandidates } from './memory-reranker';
import { deriveConversationStateV3 } from './conversation-state-v3';
import { applyActiveEventRelation } from './memory-relations';
import { recordCorrection, retrievalTelemetry } from './retrieval-telemetry';
import { insertRuntimeJob } from './runtime-jobs';
import { rest, rpc, verifyUser, type Env, type AuthUser } from './supabase';
import { autoCapture, containsAutoMemorySecret, resolveMemoryCaptureTurn } from './auto-memory';
import { handleMcpRequest, type McpToolCallContext } from './mcp';
import { applyMemoryMaintenance, manageMemoryNode, planMemoryMaintenance } from './memory-gardener';

const corsHeaders: HeadersInit = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-request-id, x-ceo-drive-token',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-max-age': '86400',
};

function response(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders, ...extra },
  });
}

function ok<T>(data: T, status = 200): Response { return response({ ok: true, data }, status); }
function fail(code: string, message: string, status = 400, detail?: unknown): Response { return response({ ok: false, error: { code, message, ...(detail === undefined ? {} : { detail }) } }, status); }

function qs(params: Record<string, string | number | null | undefined>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') out.set(key, String(value));
  const text = out.toString();
  return text ? `?${text}` : '';
}

function clean(value: unknown, max = 10_000): string { return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max); }
function tags(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.map(v => clean(v, 100)).filter(Boolean))].slice(0, 40) : []; }
function tokenDice(a:string,b:string):number{const x=clean(a,120).toLocaleLowerCase(),y=clean(b,120).toLocaleLowerCase();if(!x||!y)return 0;if(x===y)return 1;if(x.length<2||y.length<2)return 0;const grams=(s:string)=>{const out=new Map<string,number>();for(let i=0;i<s.length-1;i++){const g=s.slice(i,i+2);out.set(g,(out.get(g)||0)+1)}return out},gx=grams(x),gy=grams(y);let hit=0;for(const [g,n] of gx){const m=gy.get(g)||0;hit+=Math.min(n,m)}return(2*hit)/([...gx.values()].reduce((a,b)=>a+b,0)+[...gy.values()].reduce((a,b)=>a+b,0));}
function fuzzyRecallMatch(queryTokens:string[],row:any):number{if(!queryTokens.length)return 0;const words=clean([row?.title,row?.description,row?.location,row?.content].filter(Boolean).join(' '),5000).toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').split(/\s+/).filter(Boolean);if(!words.length)return 0;const scores=queryTokens.map(token=>Math.max(...words.map(word=>word.includes(token)||token.includes(word)?Math.min(1,Math.min(word.length,token.length)/Math.max(word.length,token.length)+.2):tokenDice(token,word))));return scores.reduce((a,b)=>a+b,0)/scores.length;}

function bangkokDayRange(date = new Date()): { from: string; to: string } {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const y = bangkok.getUTCFullYear(), m = bangkok.getUTCMonth(), d = bangkok.getUTCDate();
  const from = new Date(Date.UTC(y, m, d, -7, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d + 1, -7, 0, 0, 0) - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function authenticated(env: Env, request: Request): Promise<{ token: string; user: AuthUser }> {
  const token = bearerToken(request);
  const user = await verifyUser(env, token);
  return { token, user };
}

async function listToday(env: Env, token: string, url: URL) {
  const range = url.searchParams.get('from') && url.searchParams.get('to')
    ? { from: String(url.searchParams.get('from')), to: String(url.searchParams.get('to')) }
    : bangkokDayRange();
  const events = await rest<EventRecord[]>(env, token, `events${qs({ select: '*', start_at: `gte.${range.from}`, order: 'start_at.asc', limit: 100 })}`);
  const tasks = await rest<TaskRecord[]>(env, token, `tasks${qs({ select: '*', status: 'in.(open,in_progress,waiting,overdue)', order: 'due_at.asc.nullslast,updated_at.desc', limit: 100 })}`);
  const reminders = await rest<unknown[]>(env, token, `reminders${qs({ select: '*', status: 'eq.pending', remind_at: `gte.${range.from}`, order: 'remind_at.asc', limit: 100 })}`).catch(() => []);
  return {
    range,
    events: events.filter(item => Date.parse(item.start_at) <= Date.parse(range.to)),
    tasks,
    reminders: Array.isArray(reminders) ? reminders.filter((item: any) => !item?.remind_at || Date.parse(item.remind_at) <= Date.parse(range.to)) : [],
  };
}

async function temporalKnowledge(env: Env, token: string, intent: TimeIntent) {
  const topic=intent.kind==='temporal'?intent.topic:'';
  const seed=topic||(intent.kind==='date'?String(intent.day):'');
  const textOr=seed?searchOr(['title','content'],seed):'';
  const [events,tasks,eventMemories,legacyText,replicaText]=await Promise.all([
    rest<EventRecord[]>(env,token,`events${qs({select:'*',start_at:`gte.${intent.from}`,order:'start_at.asc',limit:200})}`).then(rows=>rows.filter(row=>Date.parse(row.start_at)<=Date.parse(intent.to)&&row.status!=='cancelled'&&eventMatchesCalendarScope(row,intent.scope)&&topicMatches(`${row.title||''} ${row.description||''} ${row.location||''}`,topic))).catch(()=>[]),
    rest<TaskRecord[]>(env,token,`tasks${qs({select:'*',due_at:`gte.${intent.from}`,order:'due_at.asc.nullslast,updated_at.desc',limit:200})}`).then(rows=>rows.filter(row=>(intent.scope==='all'||intent.scope==='tasks')&&Boolean(row.due_at)&&Date.parse(String(row.due_at))<=Date.parse(intent.to)&&topicMatches(`${row.title||''} ${row.description||''} ${row.waiting_for||''}`,topic))).catch(()=>[]),
    rest<any[]>(env,token,`memory_nodes${qs({select:'node_id,title,content,memory_kind,importance,event_at,project_ref,source_refs,reference_path,tier,retention_policy,metadata,updated_at',node_type:'eq.memory',event_at:`gte.${intent.from}`,order:'event_at.asc',limit:200})}`).then(rows=>rows.filter(row=>row?.metadata?.archived!==true&&row.event_at&&Date.parse(row.event_at)<=Date.parse(intent.to)&&!memoryLooksLikeQuestion(row)&&memoryMatchesCalendarScope(row,intent.scope)&&topicMatches(`${row.title||''} ${row.content||''}`,topic))).catch(()=>[]),
    rest<any[]>(env,token,`memories${qs({select:'id,title,content,memory_type,importance,scope,status,tags,created_at,updated_at',status:'eq.active',...(textOr?{or:textOr}:{}),order:'updated_at.desc',limit:250})}`).catch(()=>[]),
    rest<any[]>(env,token,`memory_nodes${qs({select:'node_id,title,content,memory_kind,importance,event_at,project_ref,source_refs,reference_path,tier,retention_policy,metadata,updated_at',node_type:'eq.memory',...(textOr?{or:textOr}:{}),order:'updated_at.desc',limit:250})}`).catch(()=>[]),
  ]);
  const mirrored=new Set(replicaText.flatMap(row=>Array.isArray(row.source_refs)?row.source_refs:[]));
  const textual=[...replicaText,...legacyText.filter(row=>!mirrored.has(String(row.id||'')))]
    .filter(row=>row?.metadata?.archived!==true)
    .filter(row=>!memoryLooksLikeQuestion(row))
    .filter(row=>memoryMatchesCalendarScope(row,intent.scope))
    .filter(row=>topicMatches(`${clean(row.title,500)} ${clean(row.content,5000)}`,topic))
    .filter(row=>temporalTextMatchesIntent(`${clean(row.title,500)} ${clean(row.content,5000)}`,intent));
  const memorySeen=new Set<string>(),memories=[...eventMemories,...textual].filter(row=>{const key=clean(row.node_id||row.id||row.title||row.content,500).toLocaleLowerCase();if(!key||memorySeen.has(key))return false;memorySeen.add(key);return true});
  const uniq=(rows:any[])=>{const seen=new Set<string>();return rows.filter(row=>{const key=clean(row.id||row.title||row.content,500).toLocaleLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true})};
  return dedupeTemporalKnowledge({events:uniq(events),tasks:uniq(tasks),memories});
}
async function searchKnowledge(env: Env, token: string, query: string, limit = 10, answerField = recallAnswerField(query), preferredSourceId = '') {
  const q = clean(query, 240);
  const recallQ = recallSearchQuery(q);
  const normalizedSearch = recallSearchTerms(q) || recallQ;
  const recallTerms = [...new Set(normalizedSearch.split(/\s+/).filter(Boolean).flatMap(token => token.length >= 6 ? [token, token.slice(0, -1)] : [token]))].join(' ');
  const perTable = Math.max(5, Math.min(25, limit * 2));
  const structuredRecall=answerField!=='general'||recallAction(q)!=='none'||/(?:โรงเรียน|\bPA\b|ทุน|นัด|ประชุม|ประเมิน|เกษียณ|นิเทศ|อบรม|สอบ|ทดสอบ)/i.test(q);
  const specs = [
    ['memories', ['title', 'content'], 'id,title,content,memory_type,importance,scope,status,tags,created_at,updated_at'],
    ['decisions', ['title', 'content', 'rationale'], 'id,title,content,rationale,importance,status,tags,decided_at,created_at,updated_at'],
    ...(!structuredRecall?[[ 'conversation_summaries', ['title', 'summary'], 'id,title,summary,decisions,open_loops,facts,status,metadata,created_at,updated_at' ] as const]:[]),
    ['knowledge_entries', ['title', 'summary', 'content'], 'id,title,summary,content,knowledge_type,topic,importance,confidence,status,tags,created_at,updated_at'],
  ] as const;
  const rows: any[] = [];
  for (const [table, fields, select] of specs) {
    const or = recallTerms ? searchOr([...fields], recallTerms) : '';
    const found = await rest<any[]>(env, token, `${table}${qs({ select, status: 'eq.active', ...(or ? { or } : {}), order: 'updated_at.desc', limit: perTable })}`).catch(() => []);
    rows.push(...found.map(row => ({ ...row, kind: table })));
  }
  const eventOr = recallTerms ? searchOr(['title','description','location'], recallTerms) : '';
  const taskOr = recallTerms ? searchOr(['title','description','waiting_for'], recallTerms) : '';
  const [eventRows, taskRows] = await Promise.all([
    eventOr ? rest<any[]>(env, token, `events${qs({ select:'*', status:'neq.cancelled', or:eventOr, order:'start_at.asc', limit:perTable })}`).catch(() => []) : Promise.resolve<any[]>([]),
    taskOr ? rest<any[]>(env, token, `tasks${qs({ select:'*', status:'neq.cancelled', or:taskOr, order:'due_at.asc.nullslast,updated_at.desc', limit:perTable })}`).catch(() => []) : Promise.resolve<any[]>([]),
  ]);
  if(!eventRows.length&&structuredRecall&&recallTerms){
    const fuzzyTokens=recallTerms.toLocaleLowerCase().split(/\s+/).filter(token=>token.length>=2);
    const broadEvents=await rest<any[]>(env,token,`events${qs({select:'*',status:'neq.cancelled',order:'start_at.asc',limit:100})}`).catch(()=>[]);
    const fuzzy=broadEvents.map(row=>({row,score:fuzzyRecallMatch(fuzzyTokens,row)})).filter(item=>item.score>=0.68).sort((a,b)=>b.score-a.score).slice(0,perTable);
    eventRows.push(...fuzzy.map(item=>({...item.row,_fuzzyScore:item.score})));
  }
  rows.push(...eventRows.map(row => ({ ...row, kind:'events', content:clean([row.description,row.location,row.start_at].filter(Boolean).join(' · '),5000), importance:2, updated_at:row.updated_at || row.start_at || row.created_at })));
  rows.push(...taskRows.map(row => ({ ...row, kind:'tasks', content:clean([row.description,row.waiting_for,row.due_at].filter(Boolean).join(' · '),5000), importance:2 })));
  if(preferredSourceId){
    const [lockedEvents,lockedTasks,lockedMemories]=await Promise.all([
      rest<any[]>(env,token,`events${qs({select:'*',id:`eq.${preferredSourceId}`,limit:1})}`).catch(()=>[]),
      rest<any[]>(env,token,`tasks${qs({select:'*',id:`eq.${preferredSourceId}`,limit:1})}`).catch(()=>[]),
      rest<any[]>(env,token,`memories${qs({select:'*',id:`eq.${preferredSourceId}`,limit:1})}`).catch(()=>[]),
    ]);
    rows.push(...lockedEvents.map(row=>({...row,kind:'events',content:clean([row.description,row.location,row.start_at].filter(Boolean).join(' · '),5000),importance:3,_sourceLocked:true})),...lockedTasks.map(row=>({...row,kind:'tasks',content:clean([row.description,row.waiting_for,row.due_at].filter(Boolean).join(' · '),5000),importance:3,_sourceLocked:true})),...lockedMemories.map(row=>({...row,kind:'memories',_sourceLocked:true})));
  }
  const replicaOr = recallTerms ? searchOr(['title','content'], recallTerms) : '';
  const replicaRows = await rest<any[]>(env, token, `memory_nodes${qs({ select:'node_id,title,content,memory_kind,importance,project_ref,source_refs,evidence_status,reference_path,tier,retention_policy,source_kind,truth_status,metadata,created_at,updated_at', node_type:'eq.memory', ...(replicaOr ? { or:replicaOr } : {}), order:'updated_at.desc', limit:perTable })}`).catch(() => []);
  const mirroredLegacyIds = new Set(replicaRows.flatMap(row => Array.isArray(row.source_refs) ? row.source_refs : []));
  const legacyOnly = rows.filter(row => !mirroredLegacyIds.has(String(row.id || '')) && !(row.kind === 'memories' && memoryLooksLikeQuestion(row)));
  rows.length = 0;
  rows.push(...legacyOnly, ...replicaRows.filter(row => row?.metadata?.archived!==true && !memoryLooksLikeQuestion(row)).map(row => ({ ...row, id:row.node_id, kind:'memory_nodes', memory_type:row.memory_kind, scope:row.project_ref ? 'project' : 'global', status:'active', tags:[] })));
  const tokens = recallTerms.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const lockedRows=preferredSourceId?rows.filter(row=>String(row.id||row.node_id||'')===preferredSourceId):[];
  const strictRows = rows.filter(row => recallSubjectMatches(q,row));
  const fuzzyRows=!strictRows.length&&structuredRecall?rows.map(row=>({row,score:fuzzyRecallMatch(tokens,row)})).filter(item=>item.score>=0.68).sort((a,b)=>b.score-a.score).map(item=>({...item.row,_fuzzyScore:item.score})):[];
  const candidateRows = lockedRows.length ? [...lockedRows,...strictRows.filter(row=>!lockedRows.includes(row))] : strictRows.length ? strictRows : fuzzyRows.length ? fuzzyRows : rows;
  const ranked = candidateRows.map(row => {
    const title = clean(row.title || row.full_name || '', 500).toLocaleLowerCase();
    const body = clean(row.content || row.summary || row.rationale || '', 5000).toLocaleLowerCase();
    const hay = `${title} ${body}`;
    const hits = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 10 : 0) + (title.includes(token) ? 4 : 0), 0);
    const importance = Number(row.importance || 1) * 5;
    const timestamp = Date.parse(row.updated_at || row.decided_at || row.created_at || '') || 0;
    const recency = timestamp ? Math.max(0, 10 - (Date.now() - timestamp) / 604800000) : 0;
    const structuredBoost = answerField==='location' ? (row.kind==='events'&&row.location?70:0)
      : answerField==='date' ? (row.kind==='events'&&row.start_at?70:row.kind==='tasks'&&row.due_at?55:0)
      : answerField==='time' ? (row.kind==='events'&&row.start_at?70:row.kind==='tasks'&&row.due_at?55:0)
      : answerField==='status' ? ((row.kind==='tasks'||row.kind==='events')&&row.status?55:0)
      : 0;
    const asksRestaurant=answerField==='location'&&/(?:ร้านอาหาร|ร้านไหน|ร้านอะไร)/i.test(q);
    const restaurantTypeBoost=asksRestaurant?(hay.includes('ร้านอาหาร')||/(?:ร้าน)[^\s]{0,40}/i.test(hay)?60:(row.kind==='events'&&clean(row.location,300)?-50:0)):0;
    const memoryMeta=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
    const governanceBoost=row.kind==='memory_nodes'?((memoryMeta.canonical===true?45:0)+(row.tier==='pinned'?35:row.tier==='hot'?12:row.tier==='warm'?6:row.tier==='cold'?-4:0)+(row.retention_policy==='permanent'?18:0)):0;
    const isAuto=memoryMeta.autoMemory===true||(Array.isArray(row.tags)&&row.tags.includes('auto-memory'));
    const sourceAuthority=row.kind==='events'?(isAuto?(memoryMeta.pinned===true?20:-35):80)
      : row.kind==='tasks'?(isAuto?(memoryMeta.pinned===true?18:-25):65)
      : row.kind==='conversation_summaries'?(isAuto?-45:-10)
      : row.kind==='memory_nodes'?(row.source_kind==='user'?40:isAuto?-25:10)
      : row.kind==='memories'?(Array.isArray(row.tags)&&row.tags.includes('pinned')?45:20)
      : 0;
    const sourceLock=preferredSourceId&&String(row.id||row.node_id||'')===preferredSourceId?180:0;
    return { ...row, _sourceLocked:sourceLock>0, _score: Math.round((hits + importance + recency + structuredBoost + restaurantTypeBoost + governanceBoost + sourceAuthority + sourceLock) * 100) / 100 };
  }).sort((a, b) => b._score - a._score).slice(0, limit);
  return { query: q, count: ranked.length, results: ranked };
}

async function saveMemory(env: Env, token: string, body: any) {
  const content = clean(body.content, 20_000);
  if (!content) throw Object.assign(new Error('MEMORY_CONTENT_REQUIRED'), { status: 400 });
  const title = clean(body.title, 300);
  const memoryType = ['fact', 'preference', 'rule', 'decision', 'context', 'note'].includes(body.memoryType) ? body.memoryType : 'note';
  const scope = ['global', 'project', 'session'].includes(body.scope) ? body.scope : 'global';
  const fingerprint = await sha256Hex(['memory', memoryType, scope, clean(body.projectId, 80), title, content].join('\u001f').toLocaleLowerCase().replace(/\s+/g, ' ').trim());
  const payload = {
    title,
    content,
    memory_type: memoryType,
    importance: Math.max(0, Math.min(3, Math.round(Number(body.importance ?? 2)))),
    scope,
    confidence: Math.max(0, Math.min(1, Number(body.confidence ?? 1))),
    status: 'active',
    tags: tags(body.tags),
    fingerprint,
    ...(body.projectId ? { project_id: clean(body.projectId, 80) } : {}),
  };
  const rows = await rest<MemoryRecord[]>(env, token, `memories${qs({ select: '*', on_conflict: 'user_id,fingerprint' })}`, { method: 'POST', body: payload, prefer: 'resolution=merge-duplicates,return=representation' });
  const memory = rows[0] || null;
  if (!memory) return null;
  const nodeDigest = await sha256Hex('memory\u001f' + fingerprint);
  const nodeId = 'mem_' + nodeDigest.slice(0, 20);
  const contentHash = await sha256Hex(content);
  const eventDigest = await sha256Hex([nodeId, '1', contentHash].join('\u001f'));
  const snapshot = {
    nodeId, nodeType:'memory', referencePath:`ceo://memory/${nodeId}`, title, content, projectId:clean(body.projectId,80),
    memoryKind: memoryType === 'rule' ? 'procedural' : 'semantic', sourceKind:'user', truthStatus:'reported', evidenceStatus:'single_source',
    importance:payload.importance, retentionPolicy:'standard', tier:'hot', topicIds:[], entityIds:[], sourceRefs:[memory.id], derivedFrom:[],
    eventAt:null, datePrecision:null, revision:1, contentHash, schemaVersion:2, metadata:{ legacyMemoryId:memory.id, origin:clean(body.origin,40)||'mobile' },
  };
  const replica = await rpc<any>(env, token, 'memory_replica_apply', { p_snapshot:snapshot, p_base_revision:0, p_client_event_id:'mem_evt_' + eventDigest.slice(0,24), p_device_id:null });
  return { ...memory, node_id:nodeId, replica };
}
function memoryReplicaAsRecord(row: any): MemoryRecord & { replica: true; node_id: string; reference_path?: string; revision?: number; evidence_status?: string } {
  return {
    id: String(row.node_id || ''),
    title: clean(row.title, 300),
    content: clean(row.content, 20_000),
    memory_type: clean(row.memory_kind, 40) || 'note',
    importance: Math.max(0, Math.min(3, Math.round(Number(row.importance ?? 2)))),
    scope: row.project_ref ? 'project' : 'global',
    status: 'active',
    tags: [],
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    replica: true,
    node_id: String(row.node_id || ''),
    reference_path: String(row.reference_path || ''),
    revision: Number(row.revision || 1),
    evidence_status: String(row.evidence_status || 'unverified'),
  };
}

function memoryNodeSnapshot(row: any) {
  return {
    nodeId:String(row.node_id||''),nodeType:String(row.node_type||'memory'),objectType:row.object_type||null,objectId:row.object_id||null,
    referencePath:String(row.reference_path||''),title:String(row.title||''),content:String(row.content||''),projectId:String(row.project_ref||''),
    memoryKind:row.memory_kind||null,sourceKind:row.source_kind||'user',truthStatus:row.truth_status||'reported',evidenceStatus:row.evidence_status||'unverified',
    importance:Number(row.importance||0),retentionPolicy:row.retention_policy||'standard',tier:row.tier||'hot',topicIds:Array.isArray(row.topic_ids)?row.topic_ids:[],
    entityIds:Array.isArray(row.entity_ids)?row.entity_ids:[],sourceRefs:Array.isArray(row.source_refs)?row.source_refs:[],derivedFrom:Array.isArray(row.derived_from)?row.derived_from:[],
    eventAt:row.event_at||null,datePrecision:row.date_precision||null,revision:Number(row.revision||1),contentHash:String(row.content_hash||''),schemaVersion:Number(row.schema_version||2),
    metadata:row.metadata&&typeof row.metadata==='object'?row.metadata:{},createdAt:row.created_at,updatedAt:row.updated_at,
  };
}

function claimRow(row:any){
  const evidence=Array.isArray(row?.metadata?.claimEvidence)?row.metadata.claimEvidence.filter((item:any)=>item&&['SUPPORTED_BY','CONTRADICTS'].includes(String(item.relation||'').toUpperCase())&&String(item.sourceRef||'').trim()).map((item:any)=>({relation:String(item.relation).toUpperCase(),sourceRef:String(item.sourceRef),metadata:item.metadata&&typeof item.metadata==='object'?item.metadata:{}})):[];
  return {node_id:String(row.node_id||''),title:String(row.title||''),content:String(row.content||''),project_ref:String(row.project_ref||''),truth_status:String(row.truth_status||'inferred'),evidence_status:String(row.evidence_status||'unverified'),importance:Number(row.importance||0),revision:Number(row.revision||1),reference_path:String(row.reference_path||''),evidence,created_at:String(row.created_at||''),updated_at:String(row.updated_at||'')};
}

async function maybeLlm(env: Env, prompt: string, context: unknown): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;
  const base = clean(env.LLM_BASE_URL || 'https://api.openai.com/v1', 500).replace(/\/$/, '');
  const model = clean(env.LLM_MODEL || 'gpt-5-mini', 120);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.LLM_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are Ceo, a concise Thai secretary. Answer only from supplied Ceo Knowledge context. If context is insufficient, say so. Never invent appointments, tasks, people, or decisions.' },
          { role: 'user', content: `คำถาม: ${prompt}\n\nCeo Knowledge context:\n${JSON.stringify(context).slice(0, 16000)}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const data: any = await response.json();
    return clean(data?.choices?.[0]?.message?.content, 6000) || null;
  } catch { return null; }
}

async function secretaryCloudQuery(env: Env, token: string, messageRaw: unknown) {
  const message=clean(messageRaw,4000);
  if(!message)throw Object.assign(new Error('MESSAGE_REQUIRED'),{status:400});
  const intent=detectChatIntent(message);
  if(intent.kind==='live')return{intent:'live',answer:'คำถามนี้ต้องใช้ข้อมูลปัจจุบันจากอินเทอร์เน็ต ซึ่งอยู่นอก Ceo Knowledge Cloud MCP ครับ',mode:'knowledge-only'};
  if(intent.kind==='date'||intent.kind==='temporal'){
    const temporal=await temporalKnowledge(env,token,intent);
    return{intent:intent.kind,answer:composeTemporalAnswer(intent,temporal),temporal,range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope},mode:'knowledge'};
  }
  if(intent.kind==='today'){
    const today=await listToday(env,token,new URL('https://ceo.local/api/today'));
    return{intent:'today',answer:`วันนี้มี ${today.events.length} นัด/กิจกรรม และมีงานที่ยังเปิดอยู่ ${today.tasks.length} งานครับ`,today,mode:'knowledge'};
  }
  if(intent.kind==='tasks'){
    const tasks=await rest<TaskRecord[]>(env,token,`tasks${qs({select:'*',status:'in.(open,in_progress,waiting,overdue)',order:'due_at.asc.nullslast,updated_at.desc',limit:30})}`);
    return{intent:'tasks',answer:composeTaskAnswer(tasks),tasks,mode:'knowledge'};
  }
  const search=await searchKnowledge(env,token,message,10,recallAnswerField(message));
  const direct=composeRecallAnswer(message,search.results);
  return{intent:'recall',answer:direct.answer||cloudChatFallback(message,search.results),search,mode:search.results.length?'knowledge':'knowledge-only'};
}

async function executeCloudMcpTool(env: Env, context: McpToolCallContext) {
  const a=context.arguments||{};
  if(context.name==='ceo_secretary_query')return secretaryCloudQuery(env,context.token,a.message);
  if(context.name==='ceo_recall')return searchKnowledge(env,context.token,clean(a.query,240),safeLimit(a.limit,10,30));
  if(context.name==='ceo_today')return listToday(env,context.token,new URL('https://ceo.local/api/today'));
  if(context.name==='ceo_tasks'){
    const status=clean(a.status,40),allowed=new Set(['open','in_progress','waiting','completed','cancelled','overdue','suggested']);
    if(status&&!allowed.has(status))throw Object.assign(new Error('TASK_STATUS_INVALID'),{status:400});
    const tasks=await rest<TaskRecord[]>(env,context.token,`tasks${qs({select:'*',...(status?{status:`eq.${status}`}:{status:'in.(open,in_progress,waiting,overdue)'}),order:'due_at.asc.nullslast,updated_at.desc',limit:safeLimit(a.limit,30,100)})}`);
    return{tasks};
  }
  if(context.name==='ceo_events'){
    const from=clean(a.from,100)||new Date(Date.now()-86400000).toISOString(),to=clean(a.to,100)||new Date(Date.now()+31*86400000).toISOString();
    if(Number.isNaN(Date.parse(from))||Number.isNaN(Date.parse(to))||Date.parse(to)<Date.parse(from))throw Object.assign(new Error('EVENT_RANGE_INVALID'),{status:400});
    const events=await rest<EventRecord[]>(env,context.token,`events${qs({select:'*',start_at:`gte.${from}`,order:'start_at.asc',limit:safeLimit(a.limit,50,100)})}`);
    return{from,to,events:events.filter(event=>Date.parse(event.start_at)<=Date.parse(to)&&event.status!=='cancelled')};
  }
  if(context.name==='ceo_remember'){
    const content=clean(a.content,20000);if(!content)throw Object.assign(new Error('MEMORY_CONTENT_REQUIRED'),{status:400});
    if(containsAutoMemorySecret(content))throw Object.assign(new Error('MEMORY_SECRET_BLOCKED'),{status:400});
    const autoMemory=await autoCapture(env,context.token,{message:'จำไว้ว่า '+content,source:'api',sourceRef:'cloud-mcp:ceo_remember',timezone:'Asia/Bangkok',archive:false});
    if(!autoMemory?.written){
      if(autoMemory?.decision?.needsConfirmation)throw Object.assign(new Error('MEMORY_NEEDS_CONFIRMATION'),{status:400});
      throw Object.assign(new Error('MEMORY_WRITE_SKIPPED'),{status:500});
    }
    const kind=String(autoMemory.written.kind||autoMemory.decision?.kind||'memory');
    const answer=kind==='task'?'บันทึกเป็น Task ใน Ceo Knowledge Cloud แล้วครับ':kind==='event'?'บันทึกเป็นกิจกรรมใน Ceo Knowledge Cloud แล้วครับ':'จำไว้ใน Ceo Knowledge Cloud แล้วครับ';
    const record=autoMemory.written.record||null;
    const memory=kind==='memory'&&record?{...record,node_id:autoMemory.written.nodeId,replica:autoMemory.written.replica}:record;
    return{answer,kind,memory,record,autoMemory};
  }
  throw Object.assign(new Error(`MCP_TOOL_NOT_IMPLEMENTED:${context.name}`),{status:404});
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const mcp=await handleMcpRequest(request,env,context=>executeCloudMcpTool(env,context));
  if(mcp)return mcp;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  if (url.pathname === '/health' || url.pathname === '/api/health') return ok({ service: 'ceo-knowledge-gateway', version: '2.0.0-dev', intelligence:'V3', research:researchTelemetry(), retrieval:retrievalTelemetry(), environment: env.APP_ENV || 'unknown', chat_mode: cloudAiConfig(env).configured ? 'auto-runtime-provider-router-cloud-ai' : 'auto-runtime-provider-router', cloud_ai: cloudAiConfig(env).primary, context_resolver:'state-v3-weighted-anchor-quality-gate', time: new Date().toISOString() });

  try {
    const { token, user } = await authenticated(env, request);
    if (url.pathname === '/api/me' && request.method === 'GET') return ok({ id: user.id, email: user.email || '', metadata: user.user_metadata || {} });

    if (url.pathname === '/api/ai/status' && request.method === 'GET') {
      const devices=await rest<any[]>(env,token,'devices?select=id,device_name,runtime_id,status,trusted,last_seen_at,capabilities&trusted=eq.true&limit=30').catch(()=>[]);
      const runtimeDevice=selectProviderChatDevice(devices),ollamaDevice=selectOllamaDevice(devices),cloud=cloudAiConfig(env);
      const active=runtimeDevice
        ? {source:'desktop',provider:'auto',model:'Active model on Ceo MCP Agent',device:{id:runtimeDevice.id,name:clean(runtimeDevice.device_name,200)}}
        : ollamaDevice
          ? {source:'desktop',provider:'ollama',model:clean(env.OLLAMA_CHAT_MODEL||'qwen2.5vl:3b',120),device:{id:ollamaDevice.id,name:clean(ollamaDevice.device_name,200)}}
          : cloud.configured
            ? {source:'cloud',provider:cloud.primary,model:cloud.primary==='gemini'?cloud.gemini.model:cloud.legacy.model,device:null}
            : {source:'knowledge',provider:'knowledge',model:'',device:null};
      return ok({policy:'auto',active,runtime:{providerChat:Boolean(runtimeDevice),ollama:Boolean(ollamaDevice),online:Boolean(runtimeDevice||ollamaDevice)},cloud,contextResolver:{enabled:cloud.configured,mode:'deterministic-first-ai-on-ambiguity',confidence:{answer:0.85,expand:0.6,clarifyBelow:0.6},grounding:'database-required-for-personal-context'}});
    }

    if (url.pathname === '/api/intelligence/status' && request.method === 'GET') return ok({version:'V3',research:researchTelemetry(),retrieval:retrievalTelemetry(),routing:'state-memory-direct-web-runtime-cloud',context:'structured-state+weighted-anchor',memory:'relation-aware+quality-gate+constrained-ai-judge',speech:'structured-display-spoken-chunks'});
    if (url.pathname === '/api/today' && request.method === 'GET') return ok(await listToday(env, token, url));

    if ((url.pathname === '/api/memory/auto-capture' || url.pathname === '/api/auto-memory/capture') && request.method === 'POST') {
      const body = await jsonBody<any>(request);
      const result = await autoCapture(env, token, body);
      return ok(result, body?.dryRun || (!result.written && !result.archive) ? 200 : 201);
    }

    if (url.pathname === '/api/memory/maintenance/plan' && request.method === 'GET') {
      const plan=await planMemoryMaintenance(env,token,{limit:safeLimit(url.searchParams.get('limit'),250,500)});
      return ok(plan);
    }
    if (url.pathname === '/api/memory/maintenance/apply' && request.method === 'POST') {
      const body=await jsonBody<any>(request);
      return ok(await applyMemoryMaintenance(env,token,{limit:safeLimit(body?.limit,250,500),maxActions:safeLimit(body?.maxActions,80,200)}));
    }
    if (url.pathname === '/api/memory/maintenance/history' && request.method === 'GET') {
      const runs=await rest<any[]>(env,token,`memory_maintenance_runs${qs({select:'*',order:'created_at.desc',limit:safeLimit(url.searchParams.get('limit'),20,100)})}`).catch(()=>[]);
      return ok({runs});
    }
    const memoryManageMatch=url.pathname.match(/^\/api\/memory\/nodes\/((?:topic|mem|evt|task|person|project|place|decision|doc|src|summary|claim|conv)_[A-Za-z0-9_-]{8,80})\/manage$/);
    if(memoryManageMatch&&request.method==='POST'){
      const body=await jsonBody<any>(request),action=clean(body?.action,40);
      return ok(await manageMemoryNode(env,token,memoryManageMatch[1]!,action,body?.payload||{}));
    }
    if (url.pathname === '/api/memories' && request.method === 'GET') {
      const query = clean(url.searchParams.get('q'), 240), limit = safeLimit(url.searchParams.get('limit'), 30, 60), offset = Math.max(0,Math.min(5000,Number(url.searchParams.get('offset')||0)||0));
      const filter = clean(url.searchParams.get('filter'),30), fetchLimit=Math.min(250,offset+limit+30);
      const or = query ? searchOr(['title', 'content'], query) : '';
      const [legacy, replicas] = await Promise.all([
        rest<MemoryRecord[]>(env, token, `memories${qs({ select: '*', status: 'eq.active', ...(or ? { or } : {}), order: 'updated_at.desc', limit:fetchLimit })}`),
        rest<any[]>(env, token, `memory_nodes${qs({ select:'node_id,title,content,memory_kind,importance,project_ref,source_refs,evidence_status,reference_path,revision,event_at,tier,retention_policy,source_kind,metadata,created_at,updated_at', node_type:'eq.memory', ...(or ? { or } : {}), order:'updated_at.desc', limit:fetchLimit })}`).catch(() => []),
      ]);
      const mirrored = new Set(replicas.flatMap(row => Array.isArray(row.source_refs) ? row.source_refs : []));
      const combined:any[]=[...replicas.map(row=>({...memoryReplicaAsRecord(row),event_at:row.event_at||null,tier:row.tier||'hot',retention_policy:row.retention_policy||'standard',source_kind:row.source_kind||'',metadata:row.metadata||{}})), ...legacy.filter(row => !mirrored.has(row.id))];
      const hiddenQuestionCount=combined.filter(memoryLooksLikeQuestion).length;
      const raw:any[]=combined.filter(row=>!memoryLooksLikeQuestion(row))
        .filter(row=>{const m=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};if(filter==='archived')return m.archived===true;if(filter==='duplicates')return Boolean(m.canonicalOf);if(m.archived===true)return false;if(filter==='important')return Number(row.importance)>=2;if(filter==='today')return Date.parse(row.updated_at)>=Date.parse(bangkokDayRange().from);if(filter==='pinned')return row.tier==='pinned'||m.pinned===true;if(filter==='temporary')return row.retention_policy==='temporary'||['daily_log','consolidation'].includes(String(m.retention||''));return true})
        .sort((x,y)=>String(y.updated_at||'').localeCompare(String(x.updated_at||'')));
      const groups=new Map<string,any>();
      for(const row of raw){const key=clean(row.content||row.title,2000).toLocaleLowerCase().replace(/^(?:memory|note)\s*:\s*/i,'').replace(/[\s\p{P}]+/gu,' ').trim();if(!key)continue;const existing=groups.get(key);if(existing){existing.repeat_count=(existing.repeat_count||1)+1;if(String(row.updated_at)>String(existing.updated_at))Object.assign(existing,{...row,repeat_count:existing.repeat_count})}else groups.set(key,{...row,repeat_count:1})}
      const consolidated=[...groups.values()];
      const memories=consolidated.slice(offset,offset+limit),hasMore=consolidated.length>offset+limit||legacy.length===fetchLimit||replicas.length===fetchLimit;
      return ok({ memories, replicaCount:replicas.length, hiddenQuestionCount, offset, nextOffset:hasMore?offset+memories.length:null, hasMore, consolidatedCount:consolidated.length });
    }    if (url.pathname === '/api/memories' && request.method === 'POST') return ok(await saveMemory(env, token, await jsonBody<any>(request)), 201);
    const forgetMatch = url.pathname.match(/^\/api\/memories\/([0-9a-f-]{36})\/forget$/i);
    if (forgetMatch && request.method === 'POST') {
      const rows = await rest<MemoryRecord[]>(env, token, `memories${qs({ id: `eq.${forgetMatch[1]}`, select: '*' })}`, { method: 'PATCH', body: { status: 'forgotten' }, prefer: 'return=representation' });
      return ok(rows[0] || null);
    }

    if (url.pathname === '/api/memory/replicas' && request.method === 'GET') {
      const after = clean(url.searchParams.get('after'), 100) || '1970-01-01T00:00:00.000Z';
      if (Number.isNaN(Date.parse(after))) throw Object.assign(new Error('MEMORY_AFTER_INVALID'), { status:400 });
      const replicas = await rpc<any[]>(env, token, 'memory_replica_pull', { p_after:new Date(after).toISOString(), p_limit:safeLimit(url.searchParams.get('limit'),200,500) });
      return ok({ after, replicas:Array.isArray(replicas) ? replicas : [] });
    }
    if (url.pathname === '/api/memory/conflicts' && request.method === 'GET') {
      const status = clean(url.searchParams.get('status'),20) || 'pending';
      if (!['pending','resolved','superseded'].includes(status)) throw Object.assign(new Error('MEMORY_CONFLICT_STATUS_INVALID'), { status:400 });
      const conflicts = await rest<any[]>(env, token, `memory_conflicts${qs({ select:'*', status:'eq.'+status, order:'created_at.desc', limit:safeLimit(url.searchParams.get('limit'),100,200) })}`);
      return ok({ conflicts });
    }
    const conflictResolve = url.pathname.match(/^\/api\/memory\/conflicts\/([0-9a-f-]{36})\/resolve$/i);
    if (conflictResolve && request.method === 'POST') {
      const body = await jsonBody<any>(request), resolution = clean(body.resolution,20);
      if (!['local','cloud','merge'].includes(resolution)) throw Object.assign(new Error('MEMORY_CONFLICT_RESOLUTION_INVALID'), { status:400 });
      const snapshot = body.snapshot && typeof body.snapshot === 'object' && !Array.isArray(body.snapshot) ? body.snapshot : null;
      if (resolution !== 'cloud' && !snapshot) throw Object.assign(new Error('MEMORY_CONFLICT_SNAPSHOT_REQUIRED'), { status:400 });
      const eventHash = await sha256Hex([conflictResolve[1],resolution,JSON.stringify(snapshot || {})].join('\u001f'));
      const result = await rpc<any>(env, token, 'memory_conflict_resolve', { p_conflict_id:conflictResolve[1], p_resolution:resolution, p_snapshot:snapshot, p_client_event_id:'mem_resolve_'+eventHash.slice(0,24) });
      return ok(result);
    }
    const provenanceMatch = url.pathname.match(/^\/api\/memory\/nodes\/((?:topic|mem|evt|task|person|project|place|decision|doc|src|summary|claim|conv)_[A-Za-z0-9_-]{8,80})\/provenance$/);
    if (provenanceMatch && request.method === 'GET') {
      const provenance = await rpc<any[]>(env, token, 'memory_provenance_get', { p_node_id:provenanceMatch[1] });
      return ok({ nodeId:provenanceMatch[1], provenance:Array.isArray(provenance) ? provenance : [] });
    }
    if (url.pathname === '/api/claims' && request.method === 'GET') {
      const projectId=clean(url.searchParams.get('projectId'),160),limit=safeLimit(url.searchParams.get('limit'),50,200);
      const rows=await rest<any[]>(env,token,`memory_nodes${qs({select:'*',node_type:'eq.claim',...(projectId?{project_ref:'eq.'+projectId}:{}),order:'updated_at.desc',limit})}`);
      return ok({claims:rows.map(claimRow)});
    }
    if (url.pathname === '/api/claims' && request.method === 'POST') {
      const body=await jsonBody<any>(request),claim=clean(body.claim||body.content,20000),projectId=clean(body.projectId,160);
      if(!claim)throw Object.assign(new Error('CLAIM_CONTENT_REQUIRED'),{status:400});
      const digest=await sha256Hex(['claim',projectId,claim.toLocaleLowerCase().replace(/\s+/g,' ').trim()].join('\u001f'));
      const nodeId='claim_'+digest.slice(0,20),contentHash=await sha256Hex(claim),eventDigest=await sha256Hex([nodeId,'1',contentHash].join('\u001f'));
      const snapshot={nodeId,nodeType:'claim',referencePath:`ceo://claim/${nodeId}`,title:clean(body.title,300)||claim.slice(0,120),content:claim,projectId,memoryKind:'semantic',sourceKind:clean(body.sourceKind,40)||'user',truthStatus:clean(body.truthStatus,40)||'reported',evidenceStatus:'unverified',importance:Math.max(0,Math.min(3,Math.round(Number(body.importance??2)))),retentionPolicy:'standard',tier:'hot',topicIds:Array.isArray(body.topicIds)?body.topicIds.slice(0,30):[],entityIds:Array.isArray(body.entityIds)?body.entityIds.slice(0,30):[],sourceRefs:Array.isArray(body.sourceRefs)?body.sourceRefs.slice(0,60):[],derivedFrom:Array.isArray(body.derivedFrom)?body.derivedFrom.slice(0,60):[],eventAt:null,datePrecision:null,revision:1,contentHash,schemaVersion:2,metadata:{claimEvidence:[],origin:'mobile'}};
      const result=await rpc<any>(env,token,'memory_replica_apply',{p_snapshot:snapshot,p_base_revision:0,p_client_event_id:'mem_evt_'+eventDigest.slice(0,24),p_device_id:null});
      return ok(result,201);
    }
    const claimEvidence=url.pathname.match(/^\/api\/claims\/((?:claim)_[A-Za-z0-9_-]{8,80})\/evidence$/);
    if(claimEvidence&&request.method==='POST'){
      const body=await jsonBody<any>(request),relation=String(body.relation||'').toUpperCase(),sourceRef=clean(body.sourceRef,500);
      if(!['SUPPORTED_BY','CONTRADICTS'].includes(relation)||!sourceRef)throw Object.assign(new Error('CLAIM_EVIDENCE_INVALID'),{status:400});
      const rows=await rest<any[]>(env,token,`memory_nodes${qs({select:'*',node_id:'eq.'+claimEvidence[1],node_type:'eq.claim',limit:1})}`); const row=rows[0]; if(!row)throw Object.assign(new Error('CLAIM_NOT_FOUND'),{status:404});
      const current=memoryNodeSnapshot(row),evidence=Array.isArray(current.metadata?.claimEvidence)?[...current.metadata.claimEvidence]:[];
      const key=relation+'\u001f'+sourceRef;if(!evidence.some((item:any)=>String(item?.relation||'').toUpperCase()+'\u001f'+String(item?.sourceRef||'')===key))evidence.push({relation,sourceRef,metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{}});
      const revision=Number(current.revision||1)+1,contentHash=await sha256Hex([current.content,JSON.stringify(evidence.map((item:any)=>[item.relation,item.sourceRef]))].join('\u001f'));
      const snapshot={...current,revision,contentHash,metadata:{...(current.metadata||{}),claimEvidence:evidence}};
      const eventDigest=await sha256Hex([current.nodeId,String(revision),contentHash].join('\u001f'));
      const result=await rpc<any>(env,token,'memory_replica_apply',{p_snapshot:snapshot,p_base_revision:Number(current.revision||1),p_client_event_id:'mem_evt_'+eventDigest.slice(0,24),p_device_id:null});
      return ok(result);
    }
    if (url.pathname === '/api/research' && request.method === 'GET') {
      const projectId=clean(url.searchParams.get('projectId'),160);if(!projectId)throw Object.assign(new Error('PROJECT_ID_REQUIRED'),{status:400});
      const rows=await rest<any[]>(env,token,`memory_nodes${qs({select:'*',project_ref:'eq.'+projectId,order:'updated_at.desc',limit:safeLimit(url.searchParams.get('limit'),200,500)})}`);
      const data={projectId,claims:[] as any[],summaries:[] as any[],memories:[] as any[],decisions:[] as any[],documents:[] as any[],sources:[] as any[],other:[] as any[]};
      for(const row of rows){if(row.node_type==='claim')data.claims.push(claimRow(row));else if(row.node_type==='summary')data.summaries.push(row);else if(row.node_type==='memory')data.memories.push(row);else if(row.node_type==='decision')data.decisions.push(row);else if(row.node_type==='document')data.documents.push(row);else if(row.node_type==='source')data.sources.push(row);else data.other.push(row);}
      return ok(data);
    }
    if (url.pathname === '/api/summaries/current' && request.method === 'GET') {
      const projectId=clean(url.searchParams.get('projectId'),160);if(!projectId)throw Object.assign(new Error('PROJECT_ID_REQUIRED'),{status:400});
      const rows=await rest<any[]>(env,token,`memory_nodes${qs({select:'*',node_type:'eq.summary',project_ref:'eq.'+projectId,order:'updated_at.desc',limit:1})}`);
      return ok({projectId,summary:rows[0]||null});
    }

    if (url.pathname === '/api/tasks' && request.method === 'GET') {
      const status = clean(url.searchParams.get('status'), 40), limit = safeLimit(url.searchParams.get('limit'), 50, 100);
      const tasks = await rest<TaskRecord[]>(env, token, `tasks${qs({ select: '*', ...(status ? { status: `eq.${status}` } : {}), order: 'updated_at.desc', limit })}`);
      return ok({ tasks });
    }
    if (url.pathname === '/api/tasks' && request.method === 'POST') {
      const body = await jsonBody<any>(request);
      const title = clean(body.title, 300); if (!title) throw Object.assign(new Error('TASK_TITLE_REQUIRED'), { status: 400 });
      const payload = { title, description: clean(body.description), status: body.suggested ? 'suggested' : 'open', priority: ['low','normal','high','urgent'].includes(body.priority) ? body.priority : 'normal', due_at: body.dueAt || null, waiting_for: clean(body.waitingFor, 500), tags: tags(body.tags) };
      const rows = await rest<TaskRecord[]>(env, token, `tasks?select=*`, { method: 'POST', body: payload, prefer: 'return=representation' });
      return ok(rows[0] || null, 201);
    }
    const completeMatch = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})\/complete$/i);
    if (completeMatch && request.method === 'POST') {
      const rows = await rest<TaskRecord[]>(env, token, `tasks${qs({ id: `eq.${completeMatch[1]}`, select: '*' })}`, { method: 'PATCH', body: { status: 'completed', completed_at: new Date().toISOString() }, prefer: 'return=representation' });
      return ok(rows[0] || null);
    }

    if (url.pathname === '/api/events' && request.method === 'GET') {
      const from = url.searchParams.get('from') || new Date(Date.now() - 86400000).toISOString();
      const to = url.searchParams.get('to') || new Date(Date.now() + 31 * 86400000).toISOString();
      const events = await rest<EventRecord[]>(env, token, `events${qs({ select: '*', start_at: `gte.${from}`, order: 'start_at.asc', limit: safeLimit(url.searchParams.get('limit'), 100, 100) })}`);
      return ok({ from, to, events: events.filter(event => Date.parse(event.start_at) <= Date.parse(to)) });
    }
    if (url.pathname === '/api/events' && request.method === 'POST') {
      const body = await jsonBody<any>(request), title = clean(body.title, 300), startAt = clean(body.startAt, 100);
      if (!title || !startAt || Number.isNaN(Date.parse(startAt))) throw Object.assign(new Error('EVENT_TITLE_AND_START_REQUIRED'), { status: 400 });
      const payload = { title, description: clean(body.description), event_type: ['meeting','appointment','deadline','reminder','activity','other'].includes(body.eventType) ? body.eventType : 'meeting', start_at: new Date(startAt).toISOString(), end_at: body.endAt ? new Date(body.endAt).toISOString() : null, timezone: clean(body.timezone, 80) || 'Asia/Bangkok', location: clean(body.location, 500), status: 'planned', priority: ['low','normal','high','urgent'].includes(body.priority) ? body.priority : 'normal', tags: tags(body.tags) };
      const rows = await rest<EventRecord[]>(env, token, 'events?select=*', { method: 'POST', body: payload, prefer: 'return=representation' });
      return ok(rows[0] || null, 201);
    }

    if (url.pathname === '/api/search' && request.method === 'GET') return ok(await searchKnowledge(env, token, clean(url.searchParams.get('q'), 240), safeLimit(url.searchParams.get('limit'), 10, 30)));

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const body = await jsonBody<{ message?: string; conversationId?: string; projectId?: string; sourceRef?: string; conversationSummary?: string; topics?: string[]; recentContext?: Array<{role?:string;text?:string;sourceId?:string;query?:string}>; router?:{mode?:string;provider?:string;model?:string;backgroundModel?:string}; clientContext?:{latitude?:number;longitude?:number;timezone?:string} }>(request), message = clean(body.message, 4000);
      if (!message) throw Object.assign(new Error('MESSAGE_REQUIRED'), { status: 400 });
      const routerMode=['auto','provider','model'].includes(clean(body.router?.mode,20))?clean(body.router?.mode,20):'auto';
      const requestedProvider=['gemini','openai','claude','ollama'].includes(clean(body.router?.provider,40))?clean(body.router?.provider,40):'auto';
      const routeProvider=routerMode==='auto'?'auto':requestedProvider;
      const routeModel=routerMode==='model'?clean(body.router?.model,120):'';
      const backgroundModel=routerMode==='auto'?'':clean(body.router?.backgroundModel,120);
      const recentContext=(Array.isArray(body.recentContext)?body.recentContext:[]).slice(-8).map(item=>({role:clean(item?.role,20),text:clean(item?.text,1000),sourceId:clean(item?.sourceId,200),query:clean(item?.query,1000)})).filter(item=>item.text);
      const stateV3=deriveConversationStateV3(message,recentContext);
      const previousUser=[...recentContext].reverse().find(item=>item.role==='user'&&recallSubjectQuery(item.text).length>=2);
      const previousSource=[...recentContext].reverse().find(item=>item.role==='ceo'&&item.sourceId);
      const saveStatusQuestion=/(?:บันทึก|จำ)(?:ไว้|ให้)?(?:แล้ว)?\s*(?:ไหม|หรือยัง|ไว้ยัง|หรือเปล่า|ป่าว|ยัง)\s*$/i.test(message);
      if(saveStatusQuestion&&previousUser){const verify=await searchKnowledge(env,token,previousUser.text,5,recallAnswerField(previousUser.text));const matched=verify.results.filter((row:any)=>recallSubjectMatches(previousUser.text,row));const first=matched[0]||verify.results[0];const sourceId=clean(first?.id||first?.node_id,200);return ok({intent:'remember-status',answer:first?'บันทึกไว้แล้วครับ':'ยังไม่พบว่าข้อความก่อนหน้าถูกบันทึกใน Ceo Knowledge ครับ',mode:'knowledge',provider:'knowledge',ai:false,search:verify,autoMemory:null,context:{conversationId:clean(body.conversationId,200),query:previousUser.text,field:'status',sourceId}});}
      const bareField=isBareRecallFieldQuestion(message);
      const bareSchoolList=/^\s*(?:รร\.?|โรงเรียน)\s*(?:ไหน|อะไร)(?:บ้าง)?\s*(?:ครับ|ค่ะ|คะ|นะ)?\s*$/i.test(message);
      const listContextQuery=bareSchoolList&&previousUser?`${previousUser.text.replace(/กี่\s*โรงเรียน|จำนวน\s*โรงเรียน|ทั้งหมดกี่\s*โรงเรียน/gi,'').trim()} โรงเรียนไหนบ้าง`:'';
      const legacyContextualQuery=listContextQuery||(bareField&&previousUser?previousUser.text:message);
      const contextResolution=await resolveConversationContext(env,message,recentContext,{model:backgroundModel});
      const resolvedQuery=listContextQuery||(contextResolution.confidence>=0.6?contextResolution.resolvedQuery:legacyContextualQuery);
      const stateUsesSource=['FIELD_FOLLOW_UP','FOLLOW_UP','UPDATE','CORRECTION','CONFIRMATION'].includes(stateV3.mode);
      const preferredSourceId=(bareField||contextResolution.dependsOnPriorContext||stateUsesSource)?clean(stateV3.activeSourceId||previousSource?.sourceId,200):'';
      const contextMeta=contextResolutionPublic(contextResolution);
      const memoryTurn=resolveMemoryCaptureTurn(message,recentContext);
      const originalV2=analyzeIntelligenceV2(message), intelligenceV2=analyzeIntelligenceV2(resolvedQuery);
      const intent = detectChatIntent(resolvedQuery);
      if(preferredSourceId&&['UPDATE','CORRECTION'].includes(stateV3.mode)){
        const earlyRelation=await applyActiveEventRelation(env,token,preferredSourceId,message);
        if(earlyRelation.applied){
          if(stateV3.mode==='CORRECTION')recordCorrection({conversationId:clean(body.conversationId,200),sourceId:preferredSourceId,message,previousQuery:stateV3.activeQuery});
          return ok({intent:'memory-update',answer:stateV3.mode==='CORRECTION'?'แก้ไขข้อมูลในกิจกรรมเดิมให้แล้วครับ':'เพิ่มข้อมูลในกิจกรรมเดิมให้แล้วครับ',mode:'knowledge',provider:'knowledge',ai:false,relation:earlyRelation,autoMemory:null,stateV3,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:stateV3.activeQuery||resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        }
      }
      if(contextResolution.clarificationRequired){
        return ok({intent:'clarification',answer:'ขอระบุอีกนิดครับว่าหมายถึงเรื่องไหน เพื่อไม่ให้ผมเดาผิดบริบท',mode:'clarification',provider:'knowledge',ai:true,aiConfigured:cloudAiConfig(env).configured,autoMemory:null,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
      }
      if (intent.kind === 'live' || ['news','current_fact','web','research'].includes(intelligenceV2.intent)) {
        const direct=await resolveLiveDirect(resolvedQuery,fetch,{latitude:Number(body.clientContext?.latitude),longitude:Number(body.clientContext?.longitude),timezone:clean(body.clientContext?.timezone,80)||'Asia/Bangkok'}).catch(()=>null);
        if(direct?.ok){const spoken=String(direct.answer||'').replace(/\s*·\s*/g,' ');return ok({intent:'live',semanticIntent:intelligenceV2.intent,answer:direct.answer,displayText:direct.answer,spokenText:spoken,speechChunks:[spoken],search:{query:resolvedQuery,results:[]},ai:false,aiConfigured:cloudAiConfig(env).configured,mode:'live-direct',provider:'direct',source:direct.source,sources:[{title:direct.source,url:direct.sourceUrl}],liveData:direct.data,intelligenceV2,autoMemory:null,live:true,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});}
        const shouldResearch=intelligenceV2.intent==='news'||intelligenceV2.intent==='web'||intelligenceV2.intent==='research'||intelligenceV2.intent==='current_fact';
        if(shouldResearch){
          const research=await researchWeb(resolvedQuery,{kind:intelligenceV2.intent==='news'?'news':'web',limit:intelligenceV2.intent==='news'?Math.max(3,intelligenceV2.requestedCount):5}).catch(()=>null);
          if(research?.ok){const composed=composeResearchAnswer(research,intelligenceV2.intent==='news'?intelligenceV2.requestedCount:1);return ok({intent:'live',semanticIntent:intelligenceV2.intent,...composed,search:{query:resolvedQuery,results:research.evidence},ai:false,aiConfigured:cloudAiConfig(env).configured,mode:'web-research',provider:'web',research:{kind:research.kind,reason:research.reason,latencyMs:research.latencyMs},intelligenceV2,autoMemory:null,live:true,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});}
        }
        const fallbackAnswer='ตอนนี้ยังค้นข้อมูลล่าสุดจากอินเทอร์เน็ตไม่สำเร็จครับ';
        const routed=await enqueueProviderChat(env,token,resolvedQuery,[],{provider:routeProvider,model:routeModel,strategy:'cloud-first',task:'reasoning',live:true}).catch(()=>null);
        if(routed?.job?.id)return ok({intent:'live',semanticIntent:intelligenceV2.intent,answer:'กำลังค้นข้อมูลล่าสุดให้ครับ…',fallbackAnswer,search:{query:resolvedQuery,results:[]},ai:true,aiConfigured:true,mode:'runtime-provider-pending',provider:'auto',jobId:routed.job.id,device:routed.device,directReason:direct?.reason,intelligenceV2,autoMemory:null,live:true,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        const cloud=await askCloudAi(env,resolvedQuery,[],{live:true,provider:routeProvider,model:routeModel});
        if(cloud.ok)return ok({intent:'live',semanticIntent:intelligenceV2.intent,answer:cloud.answer,displayText:cloud.answer,spokenText:cloud.answer,search:{query:resolvedQuery,results:[]},ai:true,aiConfigured:true,mode:'cloud-ai',provider:cloud.provider,model:cloud.model,grounded:cloud.grounded,sources:cloud.sources,directReason:direct?.reason,intelligenceV2,autoMemory:null,live:true,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        return ok({intent:'live',semanticIntent:intelligenceV2.intent,answer:fallbackAnswer,displayText:fallbackAnswer,spokenText:fallbackAnswer,search:{query:resolvedQuery,results:[]},ai:contextResolution.usedAI,aiConfigured:cloudAiConfig(env).configured,mode:'live-unavailable',provider:'knowledge',directReason:direct?.reason,cloudReason:cloud.reason,intelligenceV2,autoMemory:null,live:true,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
      }
      const question = isContextualQuestion(message,contextResolution);
      let autoMemory: any = null;
      if(!question&&preferredSourceId&&['UPDATE','CORRECTION'].includes(stateV3.mode)){
        const relation=await applyActiveEventRelation(env,token,preferredSourceId,message);
        if(relation.applied){
          if(stateV3.mode==='CORRECTION')recordCorrection({conversationId:clean(body.conversationId,200),sourceId:preferredSourceId,message,previousQuery:stateV3.activeQuery});
          return ok({intent:'memory-update',answer:stateV3.mode==='CORRECTION'?'แก้ไขข้อมูลในกิจกรรมเดิมให้แล้วครับ':'เพิ่มข้อมูลในกิจกรรมเดิมให้แล้วครับ',mode:'knowledge',provider:'knowledge',ai:false,relation,autoMemory:null,stateV3,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:stateV3.activeQuery||resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        }
      }
      if (!question) {
        if(memoryTurn.followUp&&!memoryTurn.message)return ok({intent:'remember',answer:'ยังไม่มีข้อความก่อนหน้าที่ชัดเจนให้บันทึกครับ',memory:null,autoMemory:null,mode:'knowledge',provider:'knowledge'});
        try {
          const contextualCapture=contextResolution.dependsOnPriorContext&&resolvedQuery&&resolvedQuery!==message?resolvedQuery:'';
          const captureMessage=memoryTurn.message||contextualCapture||message;
          autoMemory = await autoCapture(env, token, { message:captureMessage, conversationId: body.conversationId, projectId: body.projectId, sourceRef: preferredSourceId||body.sourceRef, conversationSummary: body.conversationSummary, topics: body.topics, source: 'mobile' });
          if (autoMemory?.decision?.blocked && autoMemory?.decision?.explicit) return ok({ intent: 'remember', answer: 'ไม่บันทึกข้อความนี้ เพราะตรวจพบข้อมูลลับหรือข้อมูลอ่อนไหว', memory: null, autoMemory });
          const durableWrite=Boolean(autoMemory?.written)&&(Boolean(autoMemory?.decision?.explicit)||(['event','task'].includes(String(autoMemory?.decision?.kind))&&Number(autoMemory?.decision?.confidence||0)>=0.9));
          if(durableWrite){
            const kind=String(autoMemory?.decision?.kind||'memory');
            const answer=kind==='event'?'รับทราบครับ บันทึกเป็นกิจกรรมไว้ใน Ceo Knowledge แล้วครับ':kind==='task'?'รับทราบครับ บันทึกเป็นงานไว้ใน Ceo Knowledge แล้วครับ':'จำไว้ใน Ceo Knowledge แล้วครับ';
            return ok({ intent:'remember', answer, memory:autoMemory.written.record||null, autoMemory, mode:'knowledge', provider:'knowledge' });
          }
        } catch (error: any) {
          autoMemory = { ok: false, error: clean(error?.message || error || 'AUTO_MEMORY_FAILED', 300) };
        }
      }
      const rememberMatch = message.match(/^(?:จำไว้(?:ว่า)?|จำว่า|remember\s*:?)\s*(.+)$/i);
      if (rememberMatch?.[1]) {
        const memory = await saveMemory(env, token, { title: 'จาก Ceo Mobile Chat', content: rememberMatch[1], memoryType: 'note', importance: 2, scope: 'global', tags: ['mobile-chat'] });
        return ok({ intent: 'remember', answer: 'จำไว้ใน Ceo Knowledge แล้วครับ', memory, autoMemory });
      }
      if (intent.kind === 'date' || intent.kind === 'temporal') {
        const temporal = await temporalKnowledge(env, token, intent);
        if(originalV2.aggregate==='count'&&originalV2.eventConstraint!=='none'){
          const constrained=dedupeSemanticEvents(temporal.events.filter((row:any)=>eventConstraintMatches(originalV2.eventConstraint,row)));
          const schoolKeys=new Set(constrained.map((row:any)=>clean(`${row.title||''} ${row.description||''}`,1200).match(/โรงเรียน(?:วัด)?\s*([^—–,·\n]+?)(?=\s*(?:วันที่|เวลา|$))/u)?.[1]?.replace(/^วัด\s*/,'').trim()).filter(Boolean));
          const count=schoolKeys.size||constrained.length;
          const answer=count?`เดือนนี้มี ${count} โรงเรียนที่ต้องประเมินครับ`:'เดือนนี้ยังไม่พบโรงเรียนที่ต้องประเมินจากข้อมูลที่บันทึกไว้ครับ';
          return ok({intent:intent.kind,answer,aggregate:{type:'count',count,events:constrained},temporal,range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope},ai:false,mode:'knowledge',provider:'knowledge',autoMemory:null,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        }
        const temporalField=contextResolution.answerField!=='general'?contextResolution.answerField:recallAnswerField(message);
        if(temporalField!=='general'){
          const rows=[...temporal.events.map((row:any)=>({...row,kind:'events'})),...temporal.tasks.map((row:any)=>({...row,kind:'tasks'})),...temporal.memories];
          const constrained=originalV2.eventConstraint!=='none'?rows.filter((row:any)=>eventConstraintMatches(originalV2.eventConstraint,row)):rows;
          const direct=composeRecallAnswer(message,constrained.length?constrained:rows);
          if(direct.confident)return ok({intent:intent.kind,answer:direct.answer,temporal,range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope},ai:false,mode:'knowledge',provider:'knowledge',autoMemory:null,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:direct.field,sourceId:direct.sourceId||preferredSourceId}});
        }
        const fallbackAnswer=composeTemporalAnswer(intent,temporal);
        if(intent.scope==='appointments'&&contextResolution.ambiguous&&(temporal.events.length||temporal.tasks.length||temporal.memories.length)){ 
          const groundedRows=[
            ...temporal.events.map((e:any)=>({kind:'event',title:clean(e.title||e.description,240),content:clean(`start=${e.start_at||''}; end=${e.end_at||''}; allDay=${Boolean(e.all_day)}; type=${e.event_type||''}; location=${e.location||''}; detail=${e.description||''}`,1600)})),
            ...temporal.tasks.map((t:any)=>({kind:'task',title:clean(t.title||t.description,240),content:clean(`due=${t.due_at||''}; status=${t.status||''}; detail=${t.description||''}`,1600)})),
            ...temporal.memories.map((m:any)=>({kind:'memory',title:clean(m.title||m.content,240),content:clean(m.content||m.title,1600)})),
          ].slice(0,8);
          const analysisPrompt=`คำถามเดิมของผู้ใช้: ${message}\nความหมายที่ resolve แล้ว: ${resolvedQuery}\nวิเคราะห์ตารางจาก Ceo Knowledge context ที่ให้มาเท่านั้น ตอบเป็นภาษาไทยแบบเลขานุการสั้น กระชับ: รวมรายการที่หมายถึงเหตุการณ์เดียวกัน, แยกนัด/กำหนดการหลักออกจากกิจกรรมต่อเนื่อง, ห้ามแต่งวัน เวลา หรือสถานที่, และถ้า allDay=true ห้ามตีความ 00:00 ว่าเป็นเวลานัด`;
          const routed=await enqueueProviderChat(env,token,analysisPrompt,groundedRows,{provider:routeProvider,model:backgroundModel||routeModel,task:'reasoning',strategy:'balanced'}).catch(()=>null);
          if(routed?.job?.id)return ok({intent:intent.kind,answer:'กำลังวิเคราะห์ตารางให้ครับ…',fallbackAnswer,temporal,range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope},ai:true,aiConfigured:true,mode:'runtime-provider-pending',provider:'auto',jobId:routed.job.id,device:routed.device,autoMemory:null,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
          const cloud=await askCloudAi(env,analysisPrompt,groundedRows,{provider:routeProvider,model:backgroundModel||routeModel,groundedOnly:true});
          if(cloud.ok)return ok({intent:intent.kind,answer:cloud.answer,fallbackAnswer,temporal,range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope},ai:true,aiConfigured:true,mode:'cloud-ai',provider:cloud.provider,model:cloud.model,grounded:false,sources:cloud.sources,autoMemory:null,contextResolution:contextMeta,context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId}});
        }
        return ok({ intent:intent.kind, answer:fallbackAnswer, temporal, range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity,scope:intent.scope}, autoMemory:null, mode:'knowledge', provider:'knowledge', contextResolution:contextMeta, context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId} });
      }
      if (intent.kind === 'today') {
        const today = await listToday(env, token, url);
        const answer = `วันนี้มี ${today.events.length} นัด/กิจกรรม และมีงานที่ยังเปิดอยู่ ${today.tasks.length} งานครับ`;
        return ok({ intent: 'today', answer, today, autoMemory, mode:'knowledge', provider:'knowledge', contextResolution:contextMeta, context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId} });
      }
      if (intent.kind === 'tasks') {
        const tasks = await rest<TaskRecord[]>(env, token, `tasks${qs({ select: '*', status: 'in.(open,in_progress,waiting,overdue)', order: 'due_at.asc.nullslast,updated_at.desc', limit: 30 })}`);
        return ok({ intent: 'tasks', answer:composeTaskAnswer(tasks), tasks, autoMemory, mode:'knowledge', provider:'knowledge', contextResolution:contextMeta, context:{conversationId:clean(body.conversationId,200),query:resolvedQuery,field:contextResolution.answerField,sourceId:preferredSourceId} });
      }
      const currentField=recallAnswerField(message);
      const answerField=contextResolution.answerField!=='general'?contextResolution.answerField:currentField;
      const search = await searchKnowledge(env, token, resolvedQuery, 8, answerField, preferredSourceId);
      if(originalV2.eventConstraint!=='none'){const constrained=search.results.filter((row:any)=>eventConstraintMatches(originalV2.eventConstraint,row));if(constrained.length){search.results=constrained;search.count=constrained.length;}}
      const memoryRerank=await rerankMemoryCandidates(env,resolvedQuery,search.results,{provider:routeProvider,model:backgroundModel||routeModel,activeSourceId:preferredSourceId});
      const qualityRejected=memoryRerank.quality.decision==='reject'&&(answerField!=='general'||recallAction(message)!=='none');
      search.results=qualityRejected?[]:memoryRerank.rows;search.count=search.results.length;
      const compositionMessage=answerField!==currentField&&contextResolution.usedAI?resolvedQuery:message;
      const directAnswer=composeRecallAnswer(compositionMessage,search.results);
      const fallbackAnswer = directAnswer.answer || cloudChatFallback(compositionMessage, search.results);
      const responseContext={conversationId:clean(body.conversationId,200),query:resolvedQuery,field:directAnswer.field||answerField,sourceId:directAnswer.sourceId||preferredSourceId};
      if(directAnswer.confident&&(intent.kind==='recall'||contextResolution.ambiguous)){
        return ok({ intent:'recall', answer:directAnswer.answer, search, ai:contextResolution.usedAI, aiConfigured:cloudAiConfig(env).configured, mode:'knowledge', provider:'knowledge', autoMemory:null, contextResolution:contextMeta, context:responseContext });
      }
      const personalRecall=intent.kind==='recall'&&/(?:จำ|นัด|งาน|กิจกรรม|เมื่อวาน|เมื่อเช้า|เมื่อคืน|วันไหน|วันที่|ที่ไหน|กี่โมง|ใคร|กิน|ไปไหน|ครู|ผอ\.?|โรงเรียน|ของฉัน|ของผม|ของเรา)/iu.test(resolvedQuery);
      const requiresGrounding=contextResolution.ambiguous||personalRecall||search.results.length>0;
      if(requiresGrounding&&!search.results.length){
        return ok({intent:'recall',answer:fallbackAnswer,search,ai:contextResolution.usedAI,aiConfigured:cloudAiConfig(env).configured,mode:'knowledge-only',provider:'knowledge',autoMemory:null,contextResolution:contextMeta,context:responseContext});
      }
      const providerPrompt=requiresGrounding?`คำถามเดิม: ${message}\nความหมายที่ resolve แล้ว: ${resolvedQuery}\nตอบจาก Ceo Knowledge context ที่ส่งให้เท่านั้น แบบสั้น กระชับ ไม่เกิน 3 ประโยค ห้ามสร้างวัน เวลา สถานที่ บุคคล งาน นัดหมาย หรือความจำที่ไม่มีใน context ถ้าหลักฐานไม่พอให้ตอบว่าไม่พบข้อมูลที่ยืนยันได้`:message;
      const routed = await enqueueProviderChat(env, token, providerPrompt, search.results,{provider:routeProvider,model:requiresGrounding?(backgroundModel||routeModel):routeModel,task:requiresGrounding?'reasoning':'general'}).catch(() => null);
      if (routed?.job?.id) return ok({ intent: requiresGrounding?'recall':'runtime-provider', answer: 'กำลังส่งคำถามให้ Ceo Auto Router…', fallbackAnswer, search, ai: true, aiConfigured: true, mode: 'runtime-provider-pending', provider: 'auto', jobId: routed.job.id, device: routed.device, autoMemory, contextResolution:contextMeta, context:responseContext });
      const ollama = await enqueueOllamaChat(env, token, providerPrompt, search.results).catch(() => null);
      if (ollama?.job?.id) return ok({ intent: requiresGrounding?'recall':'ollama', answer: 'กำลังส่งคำถามให้ Ollama บนเครื่อง Ceo…', fallbackAnswer, search, ai: true, aiConfigured: true, mode: 'ollama-pending', provider: 'ollama', model: ollama.model, jobId: ollama.job.id, device: ollama.device, autoMemory, contextResolution:contextMeta, context:responseContext });
      const cloud = await askCloudAi(env, providerPrompt, search.results,{provider:routeProvider,model:requiresGrounding?(backgroundModel||routeModel):routeModel,groundedOnly:requiresGrounding});
      const mode = cloud.ok ? 'cloud-ai' : search.results.length ? 'knowledge' : 'knowledge-only';
      return ok({ intent: intent.kind, answer: cloud.ok ? cloud.answer : fallbackAnswer, search, ai: cloud.ok||contextResolution.usedAI, aiConfigured: cloudAiConfig(env).configured, mode, provider: cloud.ok ? cloud.provider : 'knowledge', model: cloud.ok ? cloud.model : '', grounded: requiresGrounding, sources: cloud.sources, cloudReason: cloud.ok ? undefined : cloud.reason, autoMemory, contextResolution:contextMeta, context:responseContext });
    }
    if (url.pathname === '/api/drive/config' && request.method === 'GET') return ok(await ceoDriveConfig(env));
    if (url.pathname === '/api/drive/status' && request.method === 'GET') return ok(await ceoDriveStatus(driveProviderToken(request)));
    if (url.pathname === '/api/drive/files' && request.method === 'GET') return ok(await ceoDriveFiles(driveProviderToken(request), { q: clean(url.searchParams.get('q'), 200), folderId: clean(url.searchParams.get('folderId'), 200), pageToken: clean(url.searchParams.get('pageToken'), 1000), pageSize: safeLimit(url.searchParams.get('limit'), 40, 100) }));
    if (url.pathname === '/api/drive/preview' && request.method === 'GET') return ok(await ceoDrivePreview(driveProviderToken(request), clean(url.searchParams.get('fileId'), 200)));
    if (url.pathname === '/api/drive/import' && request.method === 'POST') { const body = await jsonBody<{ fileId?: string }>(request); return ok(await ceoDriveImport(env, token, driveProviderToken(request), clean(body.fileId, 200)), 201); }

    if (url.pathname === '/api/devices' && request.method === 'GET') {
      const devices = await rest<DeviceRecord[]>(env, token, `devices${qs({ select: 'id,device_key,device_name,device_type,runtime_id,status,capabilities,last_seen_at,trusted,paired_at,disabled_at,created_at,updated_at', order: 'updated_at.desc', limit: 100 })}`);
      const now = Date.now();
      return ok({ devices: devices.map(device => ({ ...device, effective_status: device.status === 'disabled' ? 'disabled' : device.last_seen_at && now - Date.parse(device.last_seen_at) <= 45_000 ? 'online' : 'offline' })) });
    }
    const deviceAccessMatch = url.pathname.match(/^\/api\/devices\/([0-9a-f-]{36})\/access$/i);
    if (deviceAccessMatch && request.method === 'POST') {
      const body = await jsonBody<{ action?: string }>(request);
      const action = parseDeviceAccessAction(body.action);
      const device = await rpc<DeviceRecord | DeviceRecord[]>(env, token, 'device_set_access', { p_device_id: deviceAccessMatch[1], p_action: action });
      return ok(Array.isArray(device) ? device[0] || null : device);
    }

    if (url.pathname === '/api/devices/pair' && request.method === 'POST') {
      const body = await jsonBody<{ code?: string }>(request), code = clean(body.code, 20).replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) throw Object.assign(new Error('PAIRING_CODE_FORMAT'), { status: 400 });
      const device = await rpc<DeviceRecord | DeviceRecord[]>(env, token, 'device_pairing_claim', { p_code_hash: await sha256Hex(code) });
      return ok(Array.isArray(device) ? device[0] || null : device);
    }

    if (url.pathname === '/api/runtime/approvals' && request.method === 'GET') {
      const limit = safeLimit(url.searchParams.get('limit'), 20, 50);
      const jobs = await rest<any[]>(env, token, `runtime_jobs${qs({ select: 'id,device_id,tool,arguments,status,approval_state,origin,created_at,expires_at', status: 'eq.pending', approval_state: 'eq.pending', order: 'created_at.desc', limit })}`);
      return ok({ approvals: jobs });
    }

    if (url.pathname === '/api/runtime/jobs' && request.method === 'GET') {
      const limit = safeLimit(url.searchParams.get('limit'), 10, 50);
      const jobs = await rest<any[]>(env, token, `runtime_jobs${qs({ select: 'id,device_id,tool,status,approval_state,origin,created_at,finished_at,error', order: 'created_at.desc', limit })}`);
      return ok({ jobs });
    }

    if (url.pathname === '/api/runtime/jobs' && request.method === 'POST') {
      const body = await jsonBody<any>(request), deviceId = clean(body.deviceId, 80), tool = clean(body.tool, 200);
      assertRemoteTool(tool);
      const devices = await rest<DeviceRecord[]>(env, token, `devices${qs({ select: 'id,trusted,status,last_seen_at', id: `eq.${deviceId}`, limit: 1 })}`);
      if (!devices[0] || !devices[0].trusted || devices[0].status === 'disabled') throw Object.assign(new Error('DEVICE_NOT_TRUSTED'), { status: 403 });
      const payload = { device_id: deviceId, tool, arguments: body.arguments && typeof body.arguments === 'object' ? body.arguments : {}, status: 'pending', approval_state: remoteApprovalState(tool), origin: 'mobile', idempotency_key: clean(body.idempotencyKey, 200) || newIdempotencyKey(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() };
      const job = await insertRuntimeJob(env, token, payload);
      return ok(job, 202);
    }
    const approvalMatch = url.pathname.match(/^\/api\/runtime\/jobs\/([0-9a-f-]{36})\/approval$/i);
    if (approvalMatch && request.method === 'POST') {
      const body = await jsonBody<{ decision?: string }>(request);
      const decision = parseApprovalDecision(body.decision);
      const job = await rpc<any>(env, token, 'runtime_job_set_approval', { p_job_id: approvalMatch[1], p_decision: decision });
      return ok(Array.isArray(job) ? job[0] || null : job);
    }

    const jobMatch = url.pathname.match(/^\/api\/runtime\/jobs\/([0-9a-f-]{36})$/i);
    if (jobMatch && request.method === 'GET') {
      const jobs = await rest<any[]>(env, token, `runtime_jobs${qs({ select: '*', id: `eq.${jobMatch[1]}`, limit: 1 })}`);
      return ok(jobs[0] || null);
    }

    if (url.pathname === '/api/graph' && request.method === 'GET') {
      const knowledgeId = clean(url.searchParams.get('knowledgeId'), 80);
      const or = knowledgeId ? `(from_knowledge_id.eq.${knowledgeId},to_knowledge_id.eq.${knowledgeId})` : '';
      const links = await rest<KnowledgeGraphLink[]>(env, token, `knowledge_links${qs({ select: 'id,from_knowledge_id,to_knowledge_id,relation,weight,source,metadata,created_at', ...(or ? { or } : {}), order: 'created_at.desc', limit: 200 })}`).catch(() => []);
      const ids = [...new Set(links.flatMap(link => [link.from_knowledge_id, link.to_knowledge_id]).filter(Boolean))];
      const nodes = ids.length ? await rest<KnowledgeGraphNode[]>(env, token, `knowledge_entries${qs({ select: 'id,title,summary,knowledge_type,topic,status,tags,updated_at', id: `in.(${ids.join(',')})`, status: 'eq.active' })}`) : [];
      return ok(filterActiveKnowledgeGraph({ nodes, links: links.map(link=>({ ...link, weight:Number(link.weight||0) })) }));
    }

    return fail('NOT_FOUND', 'ไม่พบ API ที่ร้องขอ', 404);
  } catch (error: any) {
    const status = Number(error?.status) || (/AUTH/i.test(String(error?.message)) ? 401 : 400);
    const message = clean(error?.message || error || 'REQUEST_FAILED', 1000);
    return fail(message, message, Math.max(400, Math.min(599, status)), error?.detail);
  }
}
