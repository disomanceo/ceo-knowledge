import type { ApiEnvelope, CeoDriveConfig, CeoDriveFile, CeoDriveImportResult, CeoDrivePreview, ClaimRecord, ResearchWorkspaceRecord, DeviceRecord, EventRecord, MemoryRecord, TaskRecord } from '@ceo-knowledge/shared';
import { supabase } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL || 'https://ceo.disomanceo.workers.dev').replace(/\/$/, '');

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token || '';
  if (!accessToken) throw new Error('LOGIN_REQUIRED');
  return accessToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await token()}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !body.ok) throw new Error(body.error?.message || `HTTP_${response.status}`);
  return body.data as T;
}

export const api = {
  me: () => request<{ id: string; email: string; metadata?: Record<string, unknown> }>('/api/me'),
  aiStatus: () => request<{ policy:string; active:{source:string;provider:string;model:string;device?:{id:string;name:string}|null}; runtime:{providerChat:boolean;ollama:boolean;online:boolean}; cloud:{configured:boolean;primary:string;gemini:{configured:boolean;model:string;liveSearch:boolean};legacy:{configured:boolean;model:string;baseUrl:string}} }>('/api/ai/status'),
  today: () => request<{ events: EventRecord[]; tasks: TaskRecord[]; reminders: any[]; range: { from: string; to: string } }>('/api/today'),
  chat: (message: string, conversationId = '', recentContext: Array<{ role:'user'|'ceo'; text:string; sourceId?:string; query?:string }> = [], router?: {mode?:string;provider?:string;model?:string;backgroundModel?:string}, clientContext?:{latitude?:number;longitude?:number;timezone?:string}) => request<any>('/api/chat', { method: 'POST', body: JSON.stringify({ message, conversationId, recentContext:recentContext.slice(-8), ...(router?{router}:{}), ...(clientContext?{clientContext}:{}) }) }),
  memories: (q = '', offset = 0, limit = 30, filter = '') => request<{ memories: Array<MemoryRecord & { repeat_count?: number; event_at?: string|null; tier?: string; retention_policy?: string; source_kind?: string; lifecycle_status?:string; valid_from?:string|null; valid_to?:string|null; superseded_by?:string|null; canonical_key?:string; source_refs?:string[]; reference_path?:string; revision?:number; evidence_status?:string; metadata?:Record<string,unknown> }>; hasMore:boolean; nextOffset:number|null; hiddenQuestionCount:number; consolidatedCount:number }>(`/api/memories?limit=${Math.max(1,Math.min(60,limit))}&offset=${Math.max(0,offset)}${q?`&q=${encodeURIComponent(q)}`:''}${filter?`&filter=${encodeURIComponent(filter)}`:''}`),
  remember: (content: string) => request<any>('/api/memory/auto-capture', { method: 'POST', body: JSON.stringify({ message:'จำไว้ว่า '+content, source:'mobile', archive:false }) }),
  memoryMaintenancePlan: (limit=250) => request<any>(`/api/memory/maintenance/plan?limit=${Math.max(20,Math.min(500,limit))}`),
  memoryMaintenanceApply: (maxActions=80,limit=250) => request<any>('/api/memory/maintenance/apply',{method:'POST',body:JSON.stringify({maxActions,limit})}),
  manageMemory: (nodeId:string,action:'set_tier'|'archive'|'restore'|'mark_canonical'|'link_duplicate'|'touch',payload:Record<string,unknown>={}) => request<any>(`/api/memory/nodes/${encodeURIComponent(nodeId)}/manage`,{method:'POST',body:JSON.stringify({action,payload})}),
  forget: (id: string) => request<MemoryRecord | null>(`/api/memories/${id}/forget`, { method: 'POST', body: '{}' }),
  claims: (projectId = '') => request<{ claims: ClaimRecord[] }>(`/api/claims${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  addClaim: (claim: string, projectId = '', title = '') => request<any>('/api/claims', { method:'POST', body:JSON.stringify({ claim, projectId, title, sourceKind:'user', importance:2 }) }),
  addClaimEvidence: (nodeId: string, relation: 'SUPPORTED_BY'|'CONTRADICTS', sourceRef: string) => request<any>(`/api/claims/${encodeURIComponent(nodeId)}/evidence`, { method:'POST', body:JSON.stringify({ relation, sourceRef }) }),
  research: (projectId: string) => request<ResearchWorkspaceRecord>(`/api/research?projectId=${encodeURIComponent(projectId)}`),
  currentSummary: (projectId: string) => request<{ projectId:string; summary:any|null }>(`/api/summaries/current?projectId=${encodeURIComponent(projectId)}`),
  tasks: (status = '') => request<{ tasks: TaskRecord[] }>(`/api/tasks${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  addTask: (title: string) => request<TaskRecord>('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) }),
  completeTask: (id: string) => request<TaskRecord | null>(`/api/tasks/${id}/complete`, { method: 'POST', body: '{}' }),
  events: () => request<{ events: EventRecord[] }>('/api/events'),
  devices: () => request<{ devices: Array<DeviceRecord & { effective_status?: string }> }>('/api/devices'),
  pair: (code: string) => request<DeviceRecord | null>('/api/devices/pair', { method: 'POST', body: JSON.stringify({ code }) }),
  deviceAccess: (id: string, action: 'disable' | 'enable' | 'revoke') => request<DeviceRecord | null>(`/api/devices/${id}/access`, { method: 'POST', body: JSON.stringify({ action }) }),
  runJob: (deviceId: string, tool: string, args: Record<string, unknown> = {}) => request<any>('/api/runtime/jobs', { method: 'POST', body: JSON.stringify({ deviceId, tool, arguments: args }) }),
  job: (id: string) => request<any>(`/api/runtime/jobs/${id}`),
  jobs: (limit = 10) => request<{ jobs: any[] }>(`/api/runtime/jobs?limit=${Math.max(1,Math.min(50,limit))}`),
  approvals: (limit = 20) => request<{ approvals: any[] }>(`/api/runtime/approvals?limit=${Math.max(1,Math.min(50,limit))}`),
  setApproval: (id: string, decision: 'approved' | 'denied') => request<any>(`/api/runtime/jobs/${id}/approval`, { method: 'POST', body: JSON.stringify({ decision }) }),
  search: (q: string) => request<any>(`/api/search?q=${encodeURIComponent(q)}`),
  driveConfig: () => request<CeoDriveConfig>('/api/drive/config'),
  driveStatus: (driveToken: string) => request<any>('/api/drive/status', { headers: { 'x-ceo-drive-token': driveToken } }),
  driveFiles: (driveToken: string, q = '', folderId = '') => request<{ files: CeoDriveFile[]; nextPageToken: string }>(`/api/drive/files?limit=60${q?`&q=${encodeURIComponent(q)}`:''}${folderId?`&folderId=${encodeURIComponent(folderId)}`:''}`, { headers: { 'x-ceo-drive-token': driveToken } }),
  drivePreview: (driveToken: string, fileId: string) => request<CeoDrivePreview>(`/api/drive/preview?fileId=${encodeURIComponent(fileId)}`, { headers: { 'x-ceo-drive-token': driveToken } }),
  driveImport: (driveToken: string, fileId: string) => request<CeoDriveImportResult>('/api/drive/import', { method:'POST', headers: { 'x-ceo-drive-token': driveToken }, body: JSON.stringify({ fileId }) }),
};
