import { isRemoteSafeTool, normalizeSearchTokens } from '@ceo-knowledge/shared';

export function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  return match[1].trim();
}

export async function jsonBody<T>(request: Request, maxBytes = 64_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
  try { return (text ? JSON.parse(text) : {}) as T; }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}

export function safeLimit(value: unknown, fallback = 20, max = 100): number {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.round(n)));
}

export function searchOr(fields: string[], term: string): string {
  const tokens = normalizeSearchTokens(term);
  if (!tokens.length) return '';
  return `(${tokens.flatMap(token => fields.map(field => `${field}.ilike.*${token}*`)).join(',')})`;
}

export function assertRemoteTool(tool: string): void {
  if (!isRemoteSafeTool(tool)) throw Object.assign(new Error('REMOTE_TOOL_NOT_ALLOWED'), { status: 403 });
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type DeviceAccessAction = 'disable' | 'enable' | 'revoke';
export type ApprovalDecision = 'approved' | 'denied';

export function parseDeviceAccessAction(value: unknown): DeviceAccessAction {
  const action = String(value ?? '').trim().toLowerCase();
  if (action !== 'disable' && action !== 'enable' && action !== 'revoke') throw Object.assign(new Error('DEVICE_ACTION_INVALID'), { status: 400 });
  return action;
}

export function parseApprovalDecision(value: unknown): ApprovalDecision {
  const decision = String(value ?? '').trim().toLowerCase();
  if (decision !== 'approved' && decision !== 'denied') throw Object.assign(new Error('APPROVAL_DECISION_INVALID'), { status: 400 });
  return decision;
}

export function remoteApprovalState(tool: string): 'not_required' | 'pending' {
  return ['document.read','filesystem.read'].includes(String(tool || '').trim()) ? 'pending' : 'not_required';
}
