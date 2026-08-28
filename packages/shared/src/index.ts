export const KNOWLEDGE_SCHEMA = 'ceo_knowledge' as const;
export const DEFAULT_TIMEZONE = 'Asia/Bangkok' as const;

export const REMOTE_SAFE_TOOLS = [
  'runtime.status',
  'system.info',
  'knowledge.status',
  'knowledge.recall',
  'knowledge.conversation_search',
  'knowledge.decisions',
  'knowledge.people_search',
  'knowledge.semantic_search',
  'knowledge.graph',
  'knowledge.sources',
  'secretary.events',
  'secretary.tasks',
  'document.read',
  'filesystem.read',
  'ollama.status',
  'ollama.chat',
] as const;

export type RemoteSafeTool = typeof REMOTE_SAFE_TOOLS[number];
export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | 'overdue' | 'suggested';
export type EventStatus = 'planned' | 'completed' | 'cancelled' | 'overdue' | 'snoozed';
export type MemoryStatus = 'active' | 'outdated' | 'archived' | 'forgotten' | 'superseded';

export interface ApiErrorShape {
  code: string;
  message: string;
  detail?: unknown;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorShape;
}

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  memory_type: string;
  importance: number;
  scope: string;
  status: MemoryStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  due_at: string | null;
  waiting_for: string;
  created_at: string;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  timezone: string;
  location: string;
  status: EventStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface DeviceRecord {
  id: string;
  device_key: string;
  device_name: string;
  device_type: string;
  runtime_id: string | null;
  status: 'online' | 'offline' | 'disabled';
  trusted: boolean;
  capabilities: Record<string, unknown>;
  last_seen_at: string | null;
  paired_at: string | null;
}

export function isRemoteSafeTool(value: string): value is RemoteSafeTool {
  return (REMOTE_SAFE_TOOLS as readonly string[]).includes(value);
}

export function normalizeSearchTokens(value: string, limit = 8): string[] {
  return [...new Set(String(value || '')
    .replace(/[(),.*%]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(v => v.trim().toLocaleLowerCase())
    .filter(Boolean))].slice(0, limit);
}
