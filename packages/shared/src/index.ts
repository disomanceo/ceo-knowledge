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
  'provider.chat',
] as const;

export type RemoteSafeTool = typeof REMOTE_SAFE_TOOLS[number];
export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | 'overdue' | 'suggested';
export type EventStatus = 'planned' | 'completed' | 'cancelled' | 'overdue' | 'snoozed';
export type MemoryStatus = 'active' | 'outdated' | 'archived' | 'forgotten' | 'superseded';

export const MEMORY_OS_CONTRACT_VERSION = 2 as const;
export const MEMORY_NODE_TYPES = ['topic','memory','event','task','person','project','place','decision','document','source','summary','claim','conversation'] as const;
export const MEMORY_KINDS = ['episodic','semantic','procedural','prospective','derived','summary'] as const;
export const MEMORY_SOURCE_KINDS = ['user','conversation','document','external_api','web','device','ai_derived','system'] as const;
export const MEMORY_TRUTH_STATUSES = ['observed','reported','forecast','inferred','refuted'] as const;
export const MEMORY_EVIDENCE_STATUSES = ['unverified','single_source','confirmed','conflicting','refuted'] as const;
export const MEMORY_EDGE_TYPES = ['CHILD_OF','ABOUT','RELATED_TO','PART_OF','MENTIONS','INVOLVES','OCCURS_AT','DERIVED_FROM','SUPPORTED_BY','CONTRADICTS','CONFIRMS','REFUTES','FOLLOWS','SUPERSEDES'] as const;
export const MEMORY_MODES = ['CHAT','RECALL','RESEARCH','ACTION','LIVE'] as const;

export type MemoryNodeType = typeof MEMORY_NODE_TYPES[number];
export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemorySourceKind = typeof MEMORY_SOURCE_KINDS[number];
export type MemoryTruthStatus = typeof MEMORY_TRUTH_STATUSES[number];
export type MemoryEvidenceStatus = typeof MEMORY_EVIDENCE_STATUSES[number];
export type MemoryEdgeType = typeof MEMORY_EDGE_TYPES[number];
export type MemoryMode = typeof MEMORY_MODES[number];

export interface MemoryNodeEnvelope {
  node_id: string;
  node_type: MemoryNodeType;
  object_type?: string | null;
  object_id?: string | null;
  reference_path: string;
  title: string;
  project_id?: string | null;
  memory_kind?: MemoryKind | null;
  source_kind: MemorySourceKind;
  truth_status: MemoryTruthStatus;
  evidence_status: MemoryEvidenceStatus;
  topic_ids: string[];
  entity_ids: string[];
  source_ids: string[];
  derived_from: string[];
  importance: number;
  retention_policy: 'standard' | 'permanent' | 'temporary';
  tier: 'hot' | 'warm' | 'cold' | 'pinned';
  revision: number;
  content_hash: string;
  client_event_id?: string | null;
  event_at?: string | null;
  date_precision?: string | null;
  prompt_version?: string | null;
  model_version?: string | null;
  embedding_model?: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface MemorySyncEvent {
  id: string;
  client_event_id: string;
  node_id: string;
  direction: 'local_to_cloud' | 'cloud_to_local' | 'resolution';
  base_revision: number;
  revision: number;
  content_hash: string;
  status: 'accepted' | 'duplicate' | 'no_change' | 'conflict' | 'resolved';
  detail: Record<string, unknown>;
  created_at: string;
}

export interface MemoryConflictRecord {
  id: string;
  node_id: string;
  client_event_id: string;
  base_revision: number;
  local_revision: number;
  cloud_revision: number;
  local_snapshot: Record<string, unknown>;
  cloud_snapshot: Record<string, unknown>;
  status: 'pending' | 'resolved' | 'superseded';
  resolution: 'local' | 'cloud' | 'merge' | null;
  resolution_snapshot: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
}

export interface MemoryProvenanceRecord {
  relation: 'SOURCE' | 'DERIVED_FROM' | 'SUPPORTED_BY' | 'CONTRADICTS';
  source_ref: string;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MemoryReplicaApplyResult {
  outcome: 'accepted' | 'duplicate' | 'no_change' | 'conflict' | 'resolved';
  nodeId: string;
  revision: number;
  eventId?: string;
  conflictId?: string;
  snapshot?: Record<string, unknown> | null;
  localSnapshot?: Record<string, unknown> | null;
}

export interface ClaimEvidenceRecord {
  relation: 'SUPPORTED_BY' | 'CONTRADICTS';
  sourceRef: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimRecord {
  node_id: string;
  title: string;
  content: string;
  project_ref: string;
  truth_status: MemoryTruthStatus;
  evidence_status: MemoryEvidenceStatus;
  importance: number;
  revision: number;
  reference_path: string;
  evidence: ClaimEvidenceRecord[];
  created_at: string;
  updated_at: string;
}

export interface ResearchWorkspaceRecord {
  projectId: string;
  claims: ClaimRecord[];
  summaries: Array<Record<string, unknown>>;
  memories: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
}

export interface MemoryGraphEdge {
  from_node_id: string;
  to_node_id: string;
  relation: MemoryEdgeType;
  weight: number;
  source_id?: string | null;
}

export interface MemoryRecallTrace {
  mode: string;
  local: boolean;
  candidate_count: number;
  graph_hops: number;
  markdown_reads: number;
  global_semantic_search: boolean;
  latency_ms: number;
}

export interface MemoryRecallItem {
  node_id: string;
  reference_path: string;
  title: string;
  content: string;
  source_ids: string[];
  truth_status?: MemoryTruthStatus | null;
  evidence_status?: MemoryEvidenceStatus | null;
  confidence: number;
}

export interface MemoryRecallResult {
  query: string;
  results: MemoryRecallItem[];
  trace: MemoryRecallTrace;
}


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
  replica?: boolean;
  node_id?: string;
  reference_path?: string;
  revision?: number;
  evidence_status?: string;
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

export type CeoDriveImportMode = 'folder' | 'cloud-text' | 'runtime-required' | 'unsupported';

export interface CeoDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  createdTime: string | null;
  webViewLink: string;
  parents: string[];
  canDownload: boolean;
  importMode: CeoDriveImportMode;
}

export interface CeoDriveConfig {
  provider: 'google';
  enabled: boolean;
  scope: string;
  tokenPersistence: 'browser-session-only';
  importableTypes: string[];
}

export interface CeoDrivePreview {
  file: CeoDriveFile;
  importable: boolean;
  reason: string;
  exportMimeType: string;
  content: string;
  truncated: boolean;
}

export interface CeoDriveImportResult {
  file: CeoDriveFile;
  sourceId: string;
  knowledgeId: string;
  ingestRunId: string | null;
  chunks: number;
  updated: boolean;
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
  node_type?: string;
  content?: string;
  project_ref?: string;
  source_kind?: string;
  reference_path?: string;
  event_at?: string | null;
  importance?: number;
  metadata?: Record<string, unknown>;
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
