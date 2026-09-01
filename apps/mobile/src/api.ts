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
  today: () => request<{ events: EventRecord[]; tasks: TaskRecord[]; reminders: any[]; range: { from: string; to: string } }>('/api/today'),
  chat: (message: string) => request<any>('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  memories: (q = '') => request<{ memories: MemoryRecord[] }>(`/api/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  remember: (content: string, title = '') => request<MemoryRecord>('/api/memories', { method: 'POST', body: JSON.stringify({ title, content, memoryType: 'note', importance: 2, scope: 'global', tags: ['mobile'] }) }),
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
