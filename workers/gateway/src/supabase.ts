export interface Env {
  APP_ENV?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  OLLAMA_CHAT_MODEL?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function headers(env: Env, token: string, write = false, prefer = ''): HeadersInit {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'accept-profile': 'ceo_knowledge',
    ...(write ? { 'content-profile': 'ceo_knowledge' } : {}),
    ...(prefer ? { prefer } : {}),
  };
}

export async function verifyUser(env: Env, token: string): Promise<AuthUser> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw Object.assign(new Error('AUTH_INVALID'), { status: 401 });
  return await response.json<AuthUser>();
}

export async function rest<T>(env: Env, token: string, path: string, options: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const method = options.method || 'GET';
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: headers(env, token, method !== 'GET' && method !== 'HEAD', options.prefer || ''),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : `SUPABASE_HTTP_${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, detail: body });
  }
  return body as T;
}

export async function rpc<T>(env: Env, token: string, name: string, body: unknown): Promise<T> {
  return rest<T>(env, token, `rpc/${encodeURIComponent(name)}`, { method: 'POST', body });
}
