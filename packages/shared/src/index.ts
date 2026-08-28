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

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  summary: string;
  knowledge_type: string;
  topic: string;
  status: string;
  tags: string[];
  updated_at: string;
}

export interface KnowledgeGraphLink {
  id: string;
  from_knowledge_id: string;
  to_knowledge_id: string;
  relation: string;
  weight: number;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
}

export interface KnowledgeGraphLayoutNode extends KnowledgeGraphNode {
  x: number;
  y: number;
  degree: number;
}

export interface KnowledgeGraphLayout {
  width: number;
  height: number;
  nodes: KnowledgeGraphLayoutNode[];
  links: KnowledgeGraphLink[];
}

export function filterActiveKnowledgeGraph(graph: KnowledgeGraph): KnowledgeGraph {
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter(node => node?.status === 'active');
  const active = new Set(nodes.map(node => node.id));
  const links = (Array.isArray(graph?.links) ? graph.links : []).filter(link => active.has(link.from_knowledge_id) && active.has(link.to_knowledge_id));
  return { nodes, links };
}

export function layoutKnowledgeGraph(graph: KnowledgeGraph, width = 720, height = 420): KnowledgeGraphLayout {
  const filtered = filterActiveKnowledgeGraph(graph);
  const w = Math.max(320, Number(width) || 720);
  const h = Math.max(260, Number(height) || 420);
  const degree = new Map<string, number>();
  for (const node of filtered.nodes) degree.set(node.id, 0);
  for (const link of filtered.links) {
    degree.set(link.from_knowledge_id, (degree.get(link.from_knowledge_id) || 0) + 1);
    degree.set(link.to_knowledge_id, (degree.get(link.to_knowledge_id) || 0) + 1);
  }
  const sorted = [...filtered.nodes].sort((a,b) => (degree.get(b.id)||0) - (degree.get(a.id)||0) || String(a.title||a.id).localeCompare(String(b.title||b.id)) || a.id.localeCompare(b.id));
  if (!sorted.length) return { width:w, height:h, nodes:[], links:[] };
  const cx=w/2, cy=h/2, minSide=Math.min(w,h);
  const out: KnowledgeGraphLayoutNode[]=[];
  out.push({ ...sorted[0]!, x:cx, y:cy, degree:degree.get(sorted[0]!.id)||0 });
  let cursor=1, ring=1;
  while(cursor<sorted.length){
    const capacity=Math.min(sorted.length-cursor, ring*8);
    const radius=Math.min(minSide*0.42, minSide*(0.20 + (ring-1)*0.11));
    for(let slot=0;slot<capacity;slot+=1){
      const node=sorted[cursor+slot]!;
      const angle=(-Math.PI/2)+(Math.PI*2*slot/capacity)+(ring%2?0:Math.PI/capacity);
      out.push({ ...node, x:cx+Math.cos(angle)*radius, y:cy+Math.sin(angle)*radius, degree:degree.get(node.id)||0 });
    }
    cursor+=capacity; ring+=1;
  }
  return { width:w, height:h, nodes:out, links:filtered.links };
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
