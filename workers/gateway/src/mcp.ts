import { bearerToken } from './security';
import { verifyUser, type AuthUser, type Env } from './supabase';

export const MCP_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'] as const;
const MCP_SERVER_NAME = 'ceo-knowledge-cloud';
const MCP_SERVER_VERSION = '2.2.0';
const MCP_SCOPES = ['email', 'profile', 'offline_access'];

export type McpToolCallContext = {
  name: string;
  arguments: Record<string, unknown>;
  token: string;
  user: AuthUser;
};

export type McpToolExecutor = (context: McpToolCallContext) => Promise<unknown>;

export const CEO_CLOUD_MCP_TOOLS = [
  {
    name: 'ceo_secretary_query',
    description: 'Ask Ceo Knowledge a natural-language question about the user\'s own memory, appointments, dates, tasks, events, decisions, or past context. Use this as the primary source of truth whenever the user asks what they previously told Ceo, what is scheduled on a date, or what work is pending. This tool works from cloud data even when the user\'s PC is offline.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', minLength: 1, maxLength: 4000, description: 'The user question in Thai or English.' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    annotations: { title: 'Ask Ceo Secretary', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ceo_recall',
    description: 'Search Ceo Knowledge across memories, events, tasks, decisions, conversation summaries, and knowledge entries. Use when the user wants recalled facts or context rather than a live internet lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 240 },
        limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { title: 'Search Ceo Memory', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ceo_today',
    description: 'Read today\'s Ceo appointments, events, open tasks, and reminders from cloud data using Asia/Bangkok time. Works when the PC is offline.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Ceo Today', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ceo_tasks',
    description: 'List Ceo tasks from cloud storage, optionally filtered by task status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'waiting', 'completed', 'cancelled', 'overdue', 'suggested'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: { title: 'List Ceo Tasks', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ceo_events',
    description: 'List Ceo events and appointments for an ISO-8601 time range from cloud storage. If no range is supplied, returns the next 31 days.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Optional ISO-8601 start timestamp.' },
        to: { type: 'string', description: 'Optional ISO-8601 end timestamp.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: { title: 'List Ceo Events', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ceo_remember',
    description: 'Explicitly save durable user information to Ceo Knowledge Cloud through the same Auto Memory classifier used by Mobile. Facts become memories, appointments become events, and obligations/reminders such as ต้องส่ง or อย่าลืม become tasks. Never use this for passwords, API keys, tokens, or other secrets.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 20000 },
        title: { type: 'string', maxLength: 300 },
        importance: { type: 'integer', minimum: 0, maximum: 3, default: 2 },
      },
      required: ['content'],
      additionalProperties: false,
    },
    annotations: { title: 'Remember in Ceo', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

const mcpCors: HeadersInit = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-protocol-version',
  'access-control-max-age': '86400',
};

function json(value: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...mcpCors, ...extra },
  });
}

function mcpResourceUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/mcp`;
}

function protectedResourceMetadataUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/.well-known/oauth-protected-resource/mcp`;
}

export function isMcpPublicRoute(pathname: string): boolean {
  return pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp';
}

export function mcpProtectedResourceMetadata(request: Request, env: Env): Response {
  return json({
    resource: mcpResourceUrl(request),
    authorization_servers: [`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Ceo Knowledge Cloud',
    resource_documentation: 'https://ceo-knowledge.pages.dev/',
  });
}

function unauthorized(request: Request, code = 'AUTH_REQUIRED'): Response {
  const challenge = `Bearer resource_metadata="${protectedResourceMetadataUrl(request)}", scope="${MCP_SCOPES.join(' ')}"`;
  return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: code } }, 401, { 'www-authenticate': challenge });
}

function rpcResult(id: unknown, result: unknown): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, result });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown, status = 200): Response {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
}

function legacyProtocol(requested: unknown): string {
  const value = String(requested || '');
  if (value === '2025-11-25' || value === '2025-06-18' || value === '2025-03-26') return value;
  return '2025-11-25';
}

function toolText(value: unknown): string {
  if (value && typeof value === 'object' && 'answer' in value && typeof (value as { answer?: unknown }).answer === 'string') {
    return String((value as { answer: string }).answer).slice(0, 12000);
  }
  try { return JSON.stringify(value).slice(0, 12000); }
  catch { return String(value).slice(0, 12000); }
}

function validateModernHeaders(request: Request, body: any): string | null {
  const version = request.headers.get('mcp-protocol-version');
  if (version !== '2026-07-28') return null;
  const methodHeader = request.headers.get('mcp-method');
  const nameHeader = request.headers.get('mcp-name');
  if (methodHeader && methodHeader !== String(body?.method || '')) return 'MCP_METHOD_HEADER_MISMATCH';
  const expectedName = body?.method === 'tools/call' ? String(body?.params?.name || '') : '';
  if (expectedName && nameHeader && nameHeader !== expectedName) return 'MCP_NAME_HEADER_MISMATCH';
  return null;
}

export async function handleMcpRequest(request: Request, env: Env, executeTool: McpToolExecutor): Promise<Response | null> {
  const url = new URL(request.url);
  if (isMcpPublicRoute(url.pathname)) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: mcpCors });
    if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET, OPTIONS' });
    return mcpProtectedResourceMetadata(request, env);
  }
  if (url.pathname !== '/mcp') return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: mcpCors });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'POST, OPTIONS' });

  let token = '';
  let user: AuthUser;
  try {
    token = bearerToken(request);
    user = await verifyUser(env, token);
  } catch (error: any) {
    return unauthorized(request, String(error?.message || 'AUTH_INVALID'));
  }

  let body: any;
  try {
    const text = await request.text();
    if (!text || text.length > 128_000) return rpcError(null, -32600, text ? 'REQUEST_TOO_LARGE' : 'INVALID_REQUEST', undefined, 400);
    body = JSON.parse(text);
  } catch {
    return rpcError(null, -32700, 'PARSE_ERROR', undefined, 400);
  }
  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(body?.id, -32600, 'INVALID_REQUEST', undefined, 400);
  const headerError = validateModernHeaders(request, body);
  if (headerError) return rpcError(body.id, -32020, headerError, undefined, 400);

  const method = String(body.method);
  const id = body.id;
  if (method === 'notifications/initialized' || method.startsWith('notifications/')) return new Response(null, { status: 202, headers: mcpCors });
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'server/discover') return rpcResult(id, {
    supportedVersions: [...MCP_PROTOCOL_VERSIONS],
    capabilities: { tools: { listChanged: false } },
    implementation: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    instructions: 'Ceo Knowledge is the user-owned cloud source of truth for memory, appointments, tasks, events, decisions, and past context. Prefer ceo_secretary_query for natural-language personal recall. Live internet facts are outside this server.',
  });
  if (method === 'initialize') return rpcResult(id, {
    protocolVersion: legacyProtocol(body?.params?.protocolVersion),
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    instructions: 'Ceo Knowledge is the user-owned cloud source of truth for memory, appointments, tasks, events, decisions, and past context. Prefer ceo_secretary_query for natural-language personal recall. Live internet facts are outside this server.',
  });
  if (method === 'tools/list') return rpcResult(id, { tools: CEO_CLOUD_MCP_TOOLS });
  if (method === 'tools/call') {
    const name = String(body?.params?.name || '').trim();
    const args = body?.params?.arguments && typeof body.params.arguments === 'object' && !Array.isArray(body.params.arguments) ? body.params.arguments as Record<string, unknown> : {};
    if (!CEO_CLOUD_MCP_TOOLS.some(tool => tool.name === name)) return rpcError(id, -32602, `UNKNOWN_TOOL:${name}`);
    try {
      const structured = await executeTool({ name, arguments: args, token, user });
      return rpcResult(id, { content: [{ type: 'text', text: toolText(structured) }], structuredContent: structured && typeof structured === 'object' && !Array.isArray(structured) ? structured : { value: structured }, isError: false });
    } catch (error: any) {
      const message = String(error?.message || error || 'TOOL_FAILED').slice(0, 1000);
      return rpcResult(id, { content: [{ type: 'text', text: message }], structuredContent: { error: message }, isError: true });
    }
  }
  return rpcError(id, -32601, `METHOD_NOT_FOUND:${method}`);
}
