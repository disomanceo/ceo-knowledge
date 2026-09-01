import { filterActiveKnowledgeGraph, type DeviceRecord, type EventRecord, type KnowledgeGraphLink, type KnowledgeGraphNode, type MemoryRecord, type TaskRecord } from '@ceo-knowledge/shared';
import { assertRemoteTool, bearerToken, jsonBody, newIdempotencyKey, parseApprovalDecision, parseDeviceAccessAction, remoteApprovalState, safeLimit, searchOr, sha256Hex } from './security';
import { ceoDriveConfig, ceoDriveFiles, ceoDriveImport, ceoDrivePreview, ceoDriveStatus, driveProviderToken } from './drive';
import { cloudChatFallback, recallSearchQuery } from './chat';
import { composeTaskAnswer, composeTemporalAnswer, detectChatIntent, isQuestionLike, memoryLooksLikeQuestion, temporalTextMatchesIntent, topicMatches, type TimeIntent } from './chat-intelligence';
import { enqueueOllamaChat } from './runtime-chat';
import { insertRuntimeJob } from './runtime-jobs';
import { rest, rpc, verifyUser, type Env, type AuthUser } from './supabase';
import { autoCapture } from './auto-memory';

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
    rest<EventRecord[]>(env,token,`events${qs({select:'*',start_at:`gte.${intent.from}`,order:'start_at.asc',limit:200})}`).then(rows=>rows.filter(row=>Date.parse(row.start_at)<=Date.parse(intent.to)&&row.status!=='cancelled'&&topicMatches(`${row.title||''} ${row.description||''} ${row.location||''}`,topic))).catch(()=>[]),
    rest<TaskRecord[]>(env,token,`tasks${qs({select:'*',due_at:`gte.${intent.from}`,order:'due_at.asc.nullslast,updated_at.desc',limit:200})}`).then(rows=>rows.filter(row=>Boolean(row.due_at)&&Date.parse(String(row.due_at))<=Date.parse(intent.to)&&topicMatches(`${row.title||''} ${row.description||''} ${row.waiting_for||''}`,topic))).catch(()=>[]),
    rest<any[]>(env,token,`memory_nodes${qs({select:'node_id,title,content,memory_kind,importance,event_at,project_ref,source_refs,reference_path,updated_at',node_type:'eq.memory',event_at:`gte.${intent.from}`,order:'event_at.asc',limit:200})}`).then(rows=>rows.filter(row=>row.event_at&&Date.parse(row.event_at)<=Date.parse(intent.to)&&!memoryLooksLikeQuestion(row)&&topicMatches(`${row.title||''} ${row.content||''}`,topic))).catch(()=>[]),
    rest<any[]>(env,token,`memories${qs({select:'id,title,content,memory_type,importance,scope,status,tags,created_at,updated_at',status:'eq.active',...(textOr?{or:textOr}:{}),order:'updated_at.desc',limit:250})}`).catch(()=>[]),
    rest<any[]>(env,token,`memory_nodes${qs({select:'node_id,title,content,memory_kind,importance,event_at,project_ref,source_refs,reference_path,updated_at',node_type:'eq.memory',...(textOr?{or:textOr}:{}),order:'updated_at.desc',limit:250})}`).catch(()=>[]),
  ]);
  const mirrored=new Set(replicaText.flatMap(row=>Array.isArray(row.source_refs)?row.source_refs:[]));
  const textual=[...replicaText,...legacyText.filter(row=>!mirrored.has(String(row.id||'')))]
    .filter(row=>!memoryLooksLikeQuestion(row))
    .filter(row=>topicMatches(`${clean(row.title,500)} ${clean(row.content,5000)}`,topic))
    .filter(row=>temporalTextMatchesIntent(`${clean(row.title,500)} ${clean(row.content,5000)}`,intent));
  const memorySeen=new Set<string>(),memories=[...eventMemories,...textual].filter(row=>{const key=clean(row.node_id||row.id||row.title||row.content,500).toLocaleLowerCase();if(!key||memorySeen.has(key))return false;memorySeen.add(key);return true});
  const uniq=(rows:any[])=>{const seen=new Set<string>();return rows.filter(row=>{const key=clean(row.id||row.title||row.content,500).toLocaleLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true})};
  return {events:uniq(events),tasks:uniq(tasks),memories};
}
async function searchKnowledge(env: Env, token: string, query: string, limit = 10) {
  const q = clean(query, 240);
  const recallQ = recallSearchQuery(q);
  const recallTerms = [...new Set(recallQ.split(/\s+/).filter(Boolean).flatMap(token => token.length >= 6 ? [token, token.slice(0, -1)] : [token]))].join(' ');
  const perTable = Math.max(5, Math.min(25, limit * 2));
  const specs = [
    ['memories', ['title', 'content'], 'id,title,content,memory_type,importance,scope,status,tags,created_at,updated_at'],
    ['decisions', ['title', 'content', 'rationale'], 'id,title,content,rationale,importance,status,tags,decided_at,created_at,updated_at'],
    ['conversation_summaries', ['title', 'summary'], 'id,title,summary,decisions,open_loops,facts,status,created_at,updated_at'],
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
    eventOr ? rest<any[]>(env, token, `events${qs({ select:'*', status:'neq.cancelled', or:eventOr, order:'start_at.asc', limit:perTable })}`).catch(() => []) : Promise.resolve([]),
    taskOr ? rest<any[]>(env, token, `tasks${qs({ select:'*', status:'neq.cancelled', or:taskOr, order:'due_at.asc.nullslast,updated_at.desc', limit:perTable })}`).catch(() => []) : Promise.resolve([]),
  ]);
  rows.push(...eventRows.map(row => ({ ...row, kind:'events', content:clean([row.description,row.location,row.start_at].filter(Boolean).join(' · '),5000), importance:2, updated_at:row.updated_at || row.start_at || row.created_at })));
  rows.push(...taskRows.map(row => ({ ...row, kind:'tasks', content:clean([row.description,row.waiting_for,row.due_at].filter(Boolean).join(' · '),5000), importance:2 })));
  const replicaOr = recallTerms ? searchOr(['title','content'], recallTerms) : '';
  const replicaRows = await rest<any[]>(env, token, `memory_nodes${qs({ select:'node_id,title,content,memory_kind,importance,project_ref,source_refs,evidence_status,reference_path,created_at,updated_at', node_type:'eq.memory', ...(replicaOr ? { or:replicaOr } : {}), order:'updated_at.desc', limit:perTable })}`).catch(() => []);
  const mirroredLegacyIds = new Set(replicaRows.flatMap(row => Array.isArray(row.source_refs) ? row.source_refs : []));
  const legacyOnly = rows.filter(row => !mirroredLegacyIds.has(String(row.id || '')) && !(row.kind === 'memories' && memoryLooksLikeQuestion(row)));
  rows.length = 0;
  rows.push(...legacyOnly, ...replicaRows.filter(row => !memoryLooksLikeQuestion(row)).map(row => ({ ...row, id:row.node_id, kind:'memory_nodes', memory_type:row.memory_kind, scope:row.project_ref ? 'project' : 'global', status:'active', tags:[] })));
  const tokens = recallTerms.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const ranked = rows.map(row => {
    const title = clean(row.title || row.full_name || '', 500).toLocaleLowerCase();
    const body = clean(row.content || row.summary || row.rationale || '', 5000).toLocaleLowerCase();
    const hay = `${title} ${body}`;
    const hits = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 10 : 0) + (title.includes(token) ? 4 : 0), 0);
    const importance = Number(row.importance || 1) * 5;
    const timestamp = Date.parse(row.updated_at || row.decided_at || row.created_at || '') || 0;
    const recency = timestamp ? Math.max(0, 10 - (Date.now() - timestamp) / 604800000) : 0;
    return { ...row, _score: Math.round((hits + importance + recency) * 100) / 100 };
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
    eventAt:null, datePrecision:null, revision:1, contentHash, schemaVersion:2, metadata:{ legacyMemoryId:memory.id, origin:'mobile' },
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
          { role: 'user', content: `เธเธณเธ–เธฒเธก: ${prompt}\n\nCeo Knowledge context:\n${JSON.stringify(context).slice(0, 16000)}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const data: any = await response.json();
    return clean(data?.choices?.[0]?.message?.content, 6000) || null;
  } catch { return null; }
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  if (url.pathname === '/health' || url.pathname === '/api/health') return ok({ service: 'ceo-knowledge-gateway', version: '2.0.0-dev', environment: env.APP_ENV || 'unknown', chat_mode: env.LLM_API_KEY ? 'auto-runtime-cloud-ai' : 'auto-runtime-knowledge', time: new Date().toISOString() });

  try {
    const { token, user } = await authenticated(env, request);
    if (url.pathname === '/api/me' && request.method === 'GET') return ok({ id: user.id, email: user.email || '', metadata: user.user_metadata || {} });

    if (url.pathname === '/api/today' && request.method === 'GET') return ok(await listToday(env, token, url));

    if ((url.pathname === '/api/memory/auto-capture' || url.pathname === '/api/auto-memory/capture') && request.method === 'POST') {
      const body = await jsonBody<any>(request);
      const result = await autoCapture(env, token, body);
      return ok(result, body?.dryRun || (!result.written && !result.archive) ? 200 : 201);
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
        .filter(row=>filter==='important'?Number(row.importance)>=2:filter==='today'?Date.parse(row.updated_at)>=Date.parse(bangkokDayRange().from):true)
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
      const body = await jsonBody<{ message?: string; conversationId?: string; projectId?: string; sourceRef?: string; conversationSummary?: string; topics?: string[] }>(request), message = clean(body.message, 4000);
      if (!message) throw Object.assign(new Error('MESSAGE_REQUIRED'), { status: 400 });
      const intent = detectChatIntent(message);
      const question = isQuestionLike(message);
      let autoMemory: any = null;
      if (!question) {
        try {
          autoMemory = await autoCapture(env, token, { message, conversationId: body.conversationId, projectId: body.projectId, sourceRef: body.sourceRef, conversationSummary: body.conversationSummary, topics: body.topics, source: 'mobile' });
          if (autoMemory?.decision?.explicit) {
            if (autoMemory?.decision?.blocked) return ok({ intent: 'remember', answer: 'ไม่บันทึกข้อความนี้ เพราะตรวจพบข้อมูลลับหรือข้อมูลอ่อนไหว', memory: null, autoMemory });
            if (autoMemory?.written) return ok({ intent: 'remember', answer: 'จำไว้ใน Ceo Knowledge แล้วครับ', memory: autoMemory.written.record || null, autoMemory });
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
        return ok({ intent:intent.kind, answer:composeTemporalAnswer(intent,temporal), temporal, range:{from:intent.from,to:intent.to,label:intent.label,granularity:intent.granularity}, autoMemory:null, mode:'knowledge', provider:'knowledge' });
      }
      if (intent.kind === 'today') {
        const today = await listToday(env, token, url);
        const answer = `วันนี้มี ${today.events.length} นัด/กิจกรรม และมีงานที่ยังเปิดอยู่ ${today.tasks.length} งานครับ`;
        return ok({ intent: 'today', answer, today, autoMemory, mode:'knowledge', provider:'knowledge' });
      }
      if (intent.kind === 'tasks') {
        const tasks = await rest<TaskRecord[]>(env, token, `tasks${qs({ select: '*', status: 'in.(open,in_progress,waiting,overdue)', order: 'due_at.asc.nullslast,updated_at.desc', limit: 30 })}`);
        return ok({ intent: 'tasks', answer:composeTaskAnswer(tasks), tasks, autoMemory, mode:'knowledge', provider:'knowledge' });
      }
      const search = await searchKnowledge(env, token, message, 8);
      const fallbackAnswer = cloudChatFallback(message, search.results);
      const ollama = await enqueueOllamaChat(env, token, message, search.results).catch(() => null);
      if (ollama?.job?.id) return ok({ intent: 'ollama', answer: 'กำลังส่งคำถามให้ Ollama บนเครื่อง Ceo…', fallbackAnswer, search, ai: true, aiConfigured: true, mode: 'ollama-pending', provider: 'ollama', model: ollama.model, jobId: ollama.job.id, device: ollama.device, autoMemory });
      const llm = await maybeLlm(env, message, search.results);
      const mode = llm ? 'cloud-ai' : search.results.length ? 'knowledge' : 'knowledge-only';
      return ok({ intent: intent.kind, answer: llm || fallbackAnswer, search, ai: Boolean(llm), aiConfigured: Boolean(env.LLM_API_KEY), mode, provider: llm ? 'cloud-ai' : 'knowledge', autoMemory });
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

    return fail('NOT_FOUND', 'เนเธกเนเธเธ API เธ—เธตเนเธฃเนเธญเธเธเธญ', 404);
  } catch (error: any) {
    const status = Number(error?.status) || (/AUTH/i.test(String(error?.message)) ? 401 : 400);
    const message = clean(error?.message || error || 'REQUEST_FAILED', 1000);
    return fail(message, message, Math.max(400, Math.min(599, status)), error?.detail);
  }
}
