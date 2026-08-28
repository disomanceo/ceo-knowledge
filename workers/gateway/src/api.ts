import { filterActiveKnowledgeGraph, type DeviceRecord, type EventRecord, type KnowledgeGraphLink, type KnowledgeGraphNode, type MemoryRecord, type TaskRecord } from '@ceo-knowledge/shared';
import { assertRemoteTool, bearerToken, jsonBody, newIdempotencyKey, safeLimit, searchOr, sha256Hex } from './security';
import { ceoDriveConfig, ceoDriveFiles, ceoDriveImport, ceoDrivePreview, ceoDriveStatus, driveProviderToken } from './drive';
import { cloudChatFallback } from './chat';
import { enqueueOllamaChat } from './runtime-chat';
import { insertRuntimeJob } from './runtime-jobs';
import { rest, rpc, verifyUser, type Env, type AuthUser } from './supabase';

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

async function searchKnowledge(env: Env, token: string, query: string, limit = 10) {
  const q = clean(query, 240);
  const perTable = Math.max(5, Math.min(25, limit * 2));
  const specs = [
    ['memories', ['title', 'content'], 'id,title,content,memory_type,importance,scope,status,tags,created_at,updated_at'],
    ['decisions', ['title', 'content', 'rationale'], 'id,title,content,rationale,importance,status,tags,decided_at,created_at,updated_at'],
    ['conversation_summaries', ['title', 'summary'], 'id,title,summary,decisions,open_loops,facts,status,created_at,updated_at'],
    ['knowledge_entries', ['title', 'summary', 'content'], 'id,title,summary,content,knowledge_type,topic,importance,confidence,status,tags,created_at,updated_at'],
  ] as const;
  const rows: any[] = [];
  for (const [table, fields, select] of specs) {
    const or = q ? searchOr([...fields], q) : '';
    const found = await rest<any[]>(env, token, `${table}${qs({ select, status: 'eq.active', ...(or ? { or } : {}), order: 'updated_at.desc', limit: perTable })}`).catch(() => []);
    rows.push(...found.map(row => ({ ...row, kind: table })));
  }
  const tokens = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
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
  return rows[0] || null;
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

export async function handleApi(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  if (url.pathname === '/health' || url.pathname === '/api/health') return ok({ service: 'ceo-knowledge-gateway', version: '2.0.0-dev', environment: env.APP_ENV || 'unknown', chat_mode: env.LLM_API_KEY ? 'auto-runtime-cloud-ai' : 'auto-runtime-knowledge', time: new Date().toISOString() });

  try {
    const { token, user } = await authenticated(env, request);
    if (url.pathname === '/api/me' && request.method === 'GET') return ok({ id: user.id, email: user.email || '', metadata: user.user_metadata || {} });

    if (url.pathname === '/api/today' && request.method === 'GET') return ok(await listToday(env, token, url));

    if (url.pathname === '/api/memories' && request.method === 'GET') {
      const query = clean(url.searchParams.get('q'), 240), limit = safeLimit(url.searchParams.get('limit'), 30, 100);
      const or = query ? searchOr(['title', 'content'], query) : '';
      const memories = await rest<MemoryRecord[]>(env, token, `memories${qs({ select: '*', status: 'eq.active', ...(or ? { or } : {}), order: 'importance.desc,updated_at.desc', limit })}`);
      return ok({ memories });
    }
    if (url.pathname === '/api/memories' && request.method === 'POST') return ok(await saveMemory(env, token, await jsonBody<any>(request)), 201);
    const forgetMatch = url.pathname.match(/^\/api\/memories\/([0-9a-f-]{36})\/forget$/i);
    if (forgetMatch && request.method === 'POST') {
      const rows = await rest<MemoryRecord[]>(env, token, `memories${qs({ id: `eq.${forgetMatch[1]}`, select: '*' })}`, { method: 'PATCH', body: { status: 'forgotten' }, prefer: 'return=representation' });
      return ok(rows[0] || null);
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
      const body = await jsonBody<{ message?: string }>(request), message = clean(body.message, 4000);
      if (!message) throw Object.assign(new Error('MESSAGE_REQUIRED'), { status: 400 });
      const rememberMatch = message.match(/^(?:จำไว้(?:ว่า)?|จำว่า|remember\s*:?)\s*(.+)$/i);
      if (rememberMatch?.[1]) {
        const memory = await saveMemory(env, token, { title: 'จาก Ceo Mobile Chat', content: rememberMatch[1], memoryType: 'note', importance: 2, scope: 'global', tags: ['mobile-chat'] });
        return ok({ intent: 'remember', answer: 'จำไว้ใน Ceo Knowledge แล้ว', memory });
      }
      if (/(วันนี้|today|นัด|ตาราง|schedule)/i.test(message)) {
        const today = await listToday(env, token, url);
        const answer = `วันนี้มี ${today.events.length} นัด/กิจกรรม และมีงานที่ยังเปิดอยู่ ${today.tasks.length} งาน`;
        return ok({ intent: 'today', answer, today });
      }
      if (/(งานค้าง|งานที่ต้องทำ|tasks?|todo)/i.test(message)) {
        const tasks = await rest<TaskRecord[]>(env, token, `tasks${qs({ select: '*', status: 'in.(open,in_progress,waiting,overdue)', order: 'due_at.asc.nullslast,updated_at.desc', limit: 30 })}`);
        const answer = tasks.length ? `มีงานที่ยังไม่เสร็จ ${tasks.length} งาน: ${tasks.slice(0, 5).map(task => task.title).join(', ')}` : 'ตอนนี้ไม่มีงานค้างใน Ceo Knowledge';
        return ok({ intent: 'tasks', answer, tasks });
      }
      const search = await searchKnowledge(env, token, message, 10);
      const fallbackAnswer = cloudChatFallback(message, search.results);
      const ollama = await enqueueOllamaChat(env, token, message, search.results).catch(() => null);
      if (ollama?.job?.id) return ok({ intent: 'ollama', answer: 'กำลังส่งคำถามให้ Ollama บนเครื่อง Ceo…', fallbackAnswer, search, ai: true, aiConfigured: true, mode: 'ollama-pending', provider: 'ollama', model: ollama.model, jobId: ollama.job.id, device: ollama.device }, 202);
      const llm = await maybeLlm(env, message, search.results);
      const mode = llm ? 'cloud-ai' : search.results.length ? 'knowledge' : 'knowledge-only';
      return ok({ intent: 'recall', answer: llm || fallbackAnswer, search, ai: Boolean(llm), aiConfigured: Boolean(env.LLM_API_KEY), mode, provider: llm ? 'cloud-ai' : 'knowledge' });
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
    if (url.pathname === '/api/devices/pair' && request.method === 'POST') {
      const body = await jsonBody<{ code?: string }>(request), code = clean(body.code, 20).replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) throw Object.assign(new Error('PAIRING_CODE_FORMAT'), { status: 400 });
      const device = await rpc<DeviceRecord | DeviceRecord[]>(env, token, 'device_pairing_claim', { p_code_hash: await sha256Hex(code) });
      return ok(Array.isArray(device) ? device[0] || null : device);
    }

    if (url.pathname === '/api/runtime/jobs' && request.method === 'POST') {
      const body = await jsonBody<any>(request), deviceId = clean(body.deviceId, 80), tool = clean(body.tool, 200);
      assertRemoteTool(tool);
      const devices = await rest<DeviceRecord[]>(env, token, `devices${qs({ select: 'id,trusted,status,last_seen_at', id: `eq.${deviceId}`, limit: 1 })}`);
      if (!devices[0] || !devices[0].trusted || devices[0].status === 'disabled') throw Object.assign(new Error('DEVICE_NOT_TRUSTED'), { status: 403 });
      const payload = { device_id: deviceId, tool, arguments: body.arguments && typeof body.arguments === 'object' ? body.arguments : {}, status: 'pending', approval_state: 'not_required', origin: 'mobile', idempotency_key: clean(body.idempotencyKey, 200) || newIdempotencyKey(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() };
      const job = await insertRuntimeJob(env, token, payload);
      return ok(job, 202);
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
