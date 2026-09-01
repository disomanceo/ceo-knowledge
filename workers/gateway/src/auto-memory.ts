import { sha256Hex } from './security';
import { rest, rpc, type Env } from './supabase';

export type AutoMemoryKind = 'memory' | 'event' | 'task' | 'contact' | 'project_knowledge' | 'ignore';
export type AutoMemoryRetention = 'permanent' | 'consolidation' | 'daily_log' | 'none';

export interface AutoMemoryInput {
  message?: string;
  assistantMessage?: string;
  conversationId?: string;
  conversationKey?: string;
  conversationSummary?: string;
  decisions?: string[];
  openLoops?: string[];
  facts?: string[];
  topics?: string[];
  source?: 'chatgpt' | 'claude' | 'gemini' | 'mobile' | 'runtime' | 'api';
  sourceRef?: string;
  projectId?: string;
  occurredAt?: string;
  timezone?: string;
  dryRun?: boolean;
  archive?: boolean;
  useAI?: boolean;
}

export interface AutoMemoryDecision {
  kind: AutoMemoryKind;
  score: number;
  retention: AutoMemoryRetention;
  confidence: number;
  explicit: boolean;
  blocked: boolean;
  blockedReason: string;
  title: string;
  content: string;
  memoryType: 'fact' | 'preference' | 'rule' | 'decision' | 'context' | 'note';
  importance: number;
  eventAt: string | null;
  eventType: 'meeting' | 'appointment' | 'deadline' | 'reminder' | 'activity' | 'other';
  dueAt: string | null;
  fullName: string;
  organization: string;
  position: string;
  topic: string;
  needsConfirmation: boolean;
  classifier: 'heuristic' | 'llm';
  scoreParts: {
    userRelevance: number;
    futureUtility: number;
    eventSalience: number;
    engagement: number;
    confidence: number;
  };
}

const SOURCES = new Set(['chatgpt', 'claude', 'gemini', 'mobile', 'runtime', 'api']);
const MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'มค': 1, 'มกราคม': 1,
  'ก.พ.': 2, 'กพ': 2, 'กุมภาพันธ์': 2,
  'มี.ค.': 3, 'มีค': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมย': 4, 'เมษายน': 4,
  'พ.ค.': 5, 'พค': 5, 'พฤษภาคม': 5,
  'มิ.ย.': 6, 'มิย': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กค': 7, 'กรกฎาคม': 7,
  'ส.ค.': 8, 'สค': 8, 'สิงหาคม': 8,
  'ก.ย.': 9, 'กย': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตค': 10, 'ตุลาคม': 10,
  'พ.ย.': 11, 'พย': 11, 'พฤศจิกายน': 11,
  'ธ.ค.': 12, 'ธค': 12, 'ธันวาคม': 12,
};

function clean(value: unknown, max = 10_000): string {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function uniq(value: unknown, limit = 40, max = 500): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => clean(item, max)).filter(Boolean))].slice(0, limit);
}

function projectUuid(value: unknown): string {
  const id = clean(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

function explicitInstruction(text: string): boolean {
  return /^\s*(?:จำ(?:ไว้|เอาไว้|ให้หน่อย|อันนี้)(?:ว่า)?|บันทึก(?:ไว้|ให้หน่อย|อันนี้)(?:ว่า)?|เก็บ(?:ไว้|ข้อมูลนี้)(?:ว่า)?|remember(?:\s+that)?|save\s+this)\s*[:：]?/i.test(text);
}

function stripExplicit(text: string): string {
  return text.replace(/^\s*(?:จำ(?:ไว้|เอาไว้|ให้หน่อย|อันนี้)(?:ว่า)?|บันทึก(?:ไว้|ให้หน่อย|อันนี้)(?:ว่า)?|เก็บ(?:ไว้|ข้อมูลนี้)(?:ว่า)?|remember(?:\s+that)?|save\s+this)\s*[:：]?\s*/i, '').trim() || text.trim();
}

export function containsAutoMemorySecret(text: string): boolean {
  const value = clean(text, 20_000);
  if (!value) return false;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value)) return true;
  if (/\bsk-[A-Za-z0-9_-]{16,}\b/.test(value)) return true;
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)) return true;
  if (/(?:password|passcode|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|otp|cvv|รหัสผ่าน|รหัส otp|คีย์ api|โทเคน)\s*[:=：]\s*\S{4,}/i.test(value)) return true;
  if (/(?:เลขบัตรประชาชน|เลขประจำตัวประชาชน|เลขบัญชี(?:ธนาคาร)?)\s*[:=：]?\s*\d[\d -]{7,}/i.test(value)) return true;
  return false;
}

function bangkokDateParts(date: Date) {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function normalizeYear(year: number): number {
  if (year >= 2400) return year - 543;
  if (year >= 0 && year < 100) return year + 2000;
  return year;
}

function bangkokIso(year: number, month: number, day: number, hour: number, minute: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  const parts = bangkokDateParts(date);
  if (parts.year !== year || parts.month !== month || parts.day !== day) return null;
  return date.toISOString();
}

export function parseThaiDateTime(text: string, now = new Date()): string | null {
  const value = clean(text, 12_000).replace(/\s+/g, ' ');
  if (!value) return null;
  let date: { year: number; month: number; day: number } | null = null;

  const iso = value.match(/\b(20\d{2}|25\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) date = { year: normalizeYear(Number(iso[1])), month: Number(iso[2]), day: Number(iso[3]) };

  if (!date) {
    const slash = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (slash) date = { year: normalizeYear(Number(slash[3])), month: Number(slash[2]), day: Number(slash[1]) };
  }

  if (!date) {
    for (const [name, month] of Object.entries(MONTHS)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = value.match(new RegExp(`(?:^|\\s)(\\d{1,2})\\s*${escaped}\\s*(\\d{2,4})(?:\\s|$)`, 'i'));
      if (match) {
        date = { year: normalizeYear(Number(match[2])), month, day: Number(match[1]) };
        break;
      }
    }
  }

  if (!date) {
    const base = bangkokDateParts(now);
    let offset: number | null = null;
    if (/มะรืน|day\s+after\s+tomorrow/i.test(value)) offset = 2;
    else if (/พรุ่งนี้|tomorrow/i.test(value)) offset = 1;
    else if (/วันนี้|today/i.test(value)) offset = 0;
    else if (/เมื่อวาน|yesterday/i.test(value)) offset = -1;
    if (offset !== null) {
      const d = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
      date = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }
  }
  if (!date) return null;

  let hour = 9, minute = 0;
  const clock = value.match(/(?:เวลา\s*)?(\d{1,2})(?:[:.](\d{2}))\s*(?:น\.?|นาฬิกา|hrs?|h)?/i);
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2] || 0);
  } else if (/ตอนบ่าย|ช่วงบ่าย|afternoon/i.test(value)) hour = 15;
  else if (/ตอนเย็น|ช่วงเย็น|evening/i.test(value)) hour = 17;
  else if (/ตอนเช้า|ช่วงเช้า|morning/i.test(value)) hour = 9;

  return bangkokIso(date.year, date.month, date.day, hour, minute);
}

function memoryType(text: string): AutoMemoryDecision['memoryType'] {
  if (/ตัดสินใจ|สรุปว่า|เลือกใช้|ตกลงว่า|decision/i.test(text)) return 'decision';
  if (/ชอบ|ไม่ชอบ|ต้องการ|prefer|preference/i.test(text)) return 'preference';
  if (/จากนี้|ต่อไป|ทุกครั้ง|ห้าม|ต้องใช้|ให้ใช้|กฎ|rule/i.test(text)) return 'rule';
  if (/บริบท|context|โปรเจกต์|โครงการ|project|ระบบ|workspace|repo/i.test(text)) return 'context';
  return 'fact';
}

function eventType(text: string): AutoMemoryDecision['eventType'] {
  if (/กำหนดส่ง|ต้องส่ง|ครบกำหนด|deadline/i.test(text)) return 'deadline';
  if (/เตือน|remind/i.test(text)) return 'reminder';
  if (/นัด|appointment/i.test(text)) return 'appointment';
  if (/ประชุม|meeting/i.test(text)) return 'meeting';
  if (/กิจกรรม|งานเลี้ยง|ทดสอบ|อบรม|สัมมนา|activity/i.test(text)) return 'activity';
  return 'other';
}

function contactFields(text: string) {
  const fullName = clean(text.match(/(?:ชื่อ|เรียกว่า)\s*[:：]?\s*([^,;\n]{2,100})/i)?.[1], 120);
  const organization = clean(text.match(/(?:ทำงานที่|องค์กร|หน่วยงาน)\s*[:：]?\s*([^,;\n]{2,120})/i)?.[1], 160);
  const position = clean(text.match(/ตำแหน่ง\s*[:：]?\s*([^,;\n]{2,120})/i)?.[1], 160);
  return { fullName, organization, position };
}

function heuristicKind(text: string, eventAt: string | null, explicit: boolean): { kind: AutoMemoryKind; confidence: number } {
  const question = /[?？]\s*$/.test(text) || /^(?:อะไร|ทำไม|ยังไง|อย่างไร|เท่าไร|กี่|who|what|why|how|when|where)\b/i.test(text) || /(?:อะไร|ใคร|ที่ไหน|เมื่อไร|ยังไง|อย่างไร|เท่าไร|กี่|what|who|where|when|how)\s*$/i.test(text);
  const eventCue = /นัด|ประชุม|งานเลี้ยง|กิจกรรม|อบรม|สัมมนา|ทดสอบ|appointment|meeting|schedule/i.test(text);
  const taskCue = /ต้อง(?:ทำ|ส่ง|เตรียม|แจ้ง|ตรวจ)|อย่าลืม|เตือน(?:ให้)?|กำหนดส่ง|ภายใน|todo|task|deadline/i.test(text);
  const projectCue = /โปรเจกต์|โครงการ|ระบบ|workspace|repository|repo|architecture|roadmap|version|เวอร์ชัน|ตัดสินใจ|เลือกใช้|กำหนดให้/i.test(text);
  const preferenceCue = /ฉัน(?:ชอบ|ไม่ชอบ|ต้องการ)|ผม(?:ชอบ|ไม่ชอบ|ต้องการ)|ต่อไป(?:นี้)?|จากนี้(?:ไป)?|ทุกครั้ง|prefer/i.test(text);
  const contactCue = /(?:ชื่อ|เรียกว่า|ตำแหน่ง|ทำงานที่|องค์กร|หน่วยงาน|เบอร์โทร|อีเมล|email)\s*[:：]/i.test(text);

  if (eventAt && taskCue) return { kind: 'task', confidence: 0.94 };
  if (eventAt && eventCue) return { kind: 'event', confidence: 0.96 };
  if (contactCue && explicit) return { kind: 'contact', confidence: 0.86 };
  if (projectCue) return { kind: 'project_knowledge', confidence: explicit ? 0.98 : 0.84 };
  if (taskCue) return { kind: 'task', confidence: eventAt ? 0.93 : 0.82 };
  if (eventCue) return { kind: 'event', confidence: eventAt ? 0.95 : 0.70 };
  if (preferenceCue || explicit) return { kind: 'memory', confidence: explicit ? 0.99 : 0.88 };
  if (question || text.length < 18) return { kind: 'ignore', confidence: 0.90 };
  if (/(?:วันนี้|เมื่อวาน|เมื่อคืน|เมื่อเช้า|เช้านี้|เย็นนี้|เมื่อกี้|today|yesterday|last night)/i.test(text) && /(?:กิน|ไป|เจอ|คุย|ทำ|ซื้อ|ดู|เล่น|กลับ|เดินทาง|eat|ate|went|met|talked|bought|watched)/i.test(text)) return { kind: 'memory', confidence: 0.78 };
  if (/วันที่|เวลา|ต้อง|จะ|ตกลง|สรุป|สำคัญ|จำเป็น/i.test(text)) return { kind: 'memory', confidence: 0.67 };
  return { kind: 'ignore', confidence: 0.74 };
}

function scoreParts(text: string, kind: AutoMemoryKind, confidence: number, explicit: boolean, eventAt: string | null) {
  const userRelevance = explicit ? 1 : /ฉัน|ผม|ของฉัน|ของผม|เรา|\bmy\b|\bour\b/i.test(text) ? 0.9 : kind === 'ignore' ? 0.15 : 0.72;
  const futureUtility = kind === 'task' || kind === 'event' ? 0.98 : kind === 'project_knowledge' ? 0.90 : /ต่อไป|จากนี้|ทุกครั้ง|ต้องการ|ชอบ|ไม่ชอบ|จำเป็น|prefer/i.test(text) ? 0.88 : kind === 'memory' ? 0.72 : 0.35;
  const eventSalience = eventAt ? 1 : /ตัดสินใจ|deadline|กำหนดส่ง|นัด|ประชุม|งานเลี้ยง|โปรเจกต์|project|สำคัญ/i.test(text) ? 0.82 : kind === 'ignore' ? 0.10 : 0.50;
  const engagement = explicit ? 1 : /ต้อง|จะ|ตกลง|เลือก|สรุป|จำ|บันทึก|อย่าลืม|ให้ใช้|remember/i.test(text) ? 0.88 : 0.48;
  return { userRelevance, futureUtility, eventSalience, engagement, confidence: clamp(confidence) };
}

function retention(score: number, explicit: boolean, kind: AutoMemoryKind): AutoMemoryRetention {
  if (kind === 'ignore') return 'none';
  if (explicit || score >= 0.75) return 'permanent';
  if (score >= 0.50) return 'consolidation';
  if (score >= 0.30) return 'daily_log';
  return 'none';
}

function titleFor(content: string, kind: AutoMemoryKind): string {
  const prefix = kind === 'event' ? 'Event' : kind === 'task' ? 'Task' : kind === 'contact' ? 'Contact' : kind === 'project_knowledge' ? 'Project' : 'Memory';
  return `${prefix}: ${content.replace(/\s+/g, ' ').trim()}`.slice(0, 180);
}

export function classifyAutoMemoryHeuristic(input: AutoMemoryInput, now = new Date()): AutoMemoryDecision {
  const raw = clean(input.message, 12_000);
  const explicit = explicitInstruction(raw);
  const content = stripExplicit(raw);
  const blocked = containsAutoMemorySecret(content);
  const eventAt = parseThaiDateTime(content, now);
  const base = heuristicKind(content, eventAt, explicit);
  const kind: AutoMemoryKind = blocked ? 'ignore' : base.kind;
  const parts = scoreParts(content, kind, base.confidence, explicit, eventAt);
  const rawScore = 0.30 * parts.userRelevance + 0.25 * parts.futureUtility + 0.20 * parts.eventSalience + 0.15 * parts.engagement + 0.10 * parts.confidence;
  const score = blocked ? 0 : Math.round(clamp(rawScore) * 1000) / 1000;
  const contact = contactFields(content);
  const needsConfirmation = (kind === 'event' && !eventAt) || (kind === 'task' && /วันที่|พรุ่งนี้|วันนี้|deadline|กำหนดส่ง/i.test(content) && !eventAt) || (kind === 'contact' && !contact.fullName);
  return {
    kind,
    score,
    retention: blocked ? 'none' : retention(score, explicit, kind),
    confidence: base.confidence,
    explicit,
    blocked,
    blockedReason: blocked ? 'sensitive_or_secret_content' : '',
    title: titleFor(content, kind),
    content,
    memoryType: memoryType(content),
    importance: explicit || kind === 'event' || kind === 'task' ? 3 : 2,
    eventAt,
    eventType: eventType(content),
    dueAt: kind === 'task' ? eventAt : null,
    fullName: contact.fullName,
    organization: contact.organization,
    position: contact.position,
    topic: kind === 'project_knowledge' ? clean(input.projectId || 'project', 160) : '',
    needsConfirmation,
    classifier: 'heuristic',
    scoreParts: parts,
  };
}

function parseJson(text: string): any | null {
  const source = clean(text, 10_000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(source); } catch {
    const a = source.indexOf('{'), b = source.lastIndexOf('}');
    if (a >= 0 && b > a) try { return JSON.parse(source.slice(a, b + 1)); } catch { return null; }
    return null;
  }
}

async function llmDecision(env: Env, input: AutoMemoryInput, heuristic: AutoMemoryDecision, now: Date): Promise<AutoMemoryDecision | null> {
  if (!env.LLM_API_KEY || input.useAI === false || heuristic.blocked || heuristic.explicit || (heuristic.kind === 'ignore' && heuristic.confidence >= 0.85)) return null;
  const base = clean(env.LLM_BASE_URL || 'https://api.openai.com/v1', 500).replace(/\/$/, '');
  const model = clean(env.LLM_MODEL || 'gpt-5-mini', 120);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.LLM_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Classify one Ceo Knowledge user turn. Return JSON only. kind: memory,event,task,contact,project_knowledge,ignore. Prefer ignore for ordinary chat/questions. Never store passwords, tokens, keys, personal ID numbers, or bank numbers. Do not invent dates/names. Include kind,confidence,title,content,memoryType,importance,eventAt,eventType,dueAt,fullName,organization,position,topic,needsConfirmation.' },
          { role: 'user', content: JSON.stringify({ now: now.toISOString(), timezone: input.timezone || 'Asia/Bangkok', source: input.source || 'api', projectId: input.projectId || '', message: input.message, heuristic }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const payload: any = await res.json();
    const parsed = parseJson(payload?.choices?.[0]?.message?.content || '');
    const kind = clean(parsed?.kind, 40) as AutoMemoryKind;
    if (!['memory', 'event', 'task', 'contact', 'project_knowledge', 'ignore'].includes(kind)) return null;
    const confidence = clamp(Number(parsed?.confidence ?? heuristic.confidence));
    const eventAt = parsed?.eventAt && !Number.isNaN(Date.parse(String(parsed.eventAt))) ? new Date(String(parsed.eventAt)).toISOString() : heuristic.eventAt;
    const dueAt = parsed?.dueAt && !Number.isNaN(Date.parse(String(parsed.dueAt))) ? new Date(String(parsed.dueAt)).toISOString() : kind === 'task' ? eventAt : null;
    const parts = scoreParts(heuristic.content, kind, confidence, heuristic.explicit, eventAt);
    const score = Math.round(clamp(0.30 * parts.userRelevance + 0.25 * parts.futureUtility + 0.20 * parts.eventSalience + 0.15 * parts.engagement + 0.10 * parts.confidence) * 1000) / 1000;
    const fullName = clean(parsed?.fullName, 120);
    return {
      ...heuristic,
      kind,
      score,
      retention: retention(score, heuristic.explicit, kind),
      confidence,
      title: clean(parsed?.title, 300) || titleFor(heuristic.content, kind),
      content: clean(parsed?.content, 12_000) || heuristic.content,
      memoryType: ['fact', 'preference', 'rule', 'decision', 'context', 'note'].includes(parsed?.memoryType) ? parsed.memoryType : heuristic.memoryType,
      importance: Math.max(0, Math.min(3, Math.round(Number(parsed?.importance ?? heuristic.importance)))),
      eventAt,
      eventType: ['meeting', 'appointment', 'deadline', 'reminder', 'activity', 'other'].includes(parsed?.eventType) ? parsed.eventType : heuristic.eventType,
      dueAt,
      fullName,
      organization: clean(parsed?.organization, 160),
      position: clean(parsed?.position, 160),
      topic: clean(parsed?.topic, 160) || heuristic.topic,
      needsConfirmation: Boolean(parsed?.needsConfirmation) || (kind === 'event' && !eventAt) || (kind === 'contact' && !fullName),
      classifier: 'llm',
      scoreParts: parts,
    };
  } catch {
    return null;
  }
}

export async function classifyAutoMemory(env: Env, input: AutoMemoryInput, now = new Date()): Promise<AutoMemoryDecision> {
  const heuristic = classifyAutoMemoryHeuristic(input, now);
  return await llmDecision(env, input, heuristic, now) || heuristic;
}

function query(values: Record<string, string>): string {
  const q = new URLSearchParams(values);
  return `?${q.toString()}`;
}

async function persistReplicaNode(env: Env, token: string, input: {
  prefix: 'mem'|'evt'|'task'|'person'|'project'|'conv';
  nodeType: 'memory'|'event'|'task'|'person'|'project'|'conversation';
  objectType: string;
  objectId: string;
  title: string;
  content: string;
  projectRef?: string;
  memoryKind?: 'episodic'|'semantic'|'procedural'|'prospective'|'derived'|'summary'|null;
  sourceKind?: 'user'|'conversation'|'document'|'external_api'|'web'|'device'|'ai_derived'|'system';
  importance?: number;
  retentionPolicy?: 'standard'|'permanent'|'temporary';
  tier?: 'hot'|'warm'|'cold'|'pinned';
  topicIds?: string[];
  entityIds?: string[];
  sourceRefs?: string[];
  derivedFrom?: string[];
  eventAt?: string|null;
  metadata?: Record<string, unknown>;
}) {
  const digest = await sha256Hex([input.prefix,input.objectType,input.objectId].join('\u001f'));
  const nodeId = `${input.prefix}_${digest.slice(0,20)}`;
  const contentHash = await sha256Hex(input.content);
  const eventDigest = await sha256Hex([nodeId,'1',contentHash].join('\u001f'));
  const snapshot = {
    nodeId,
    nodeType: input.nodeType,
    objectType: input.objectType,
    objectId: input.objectId,
    referencePath: `ceo://${input.nodeType}/${input.objectId}`,
    title: input.title,
    content: input.content,
    projectId: clean(input.projectRef,160),
    memoryKind: input.memoryKind || null,
    sourceKind: input.sourceKind || 'conversation',
    truthStatus: 'reported',
    evidenceStatus: 'single_source',
    importance: Math.max(0,Math.min(3,Math.round(Number(input.importance ?? 2)))),
    retentionPolicy: input.retentionPolicy || 'standard',
    tier: input.tier || 'hot',
    topicIds: uniq(input.topicIds,30,120),
    entityIds: uniq(input.entityIds,30,120),
    sourceRefs: uniq(input.sourceRefs,60,500),
    derivedFrom: uniq(input.derivedFrom,60,500),
    eventAt: input.eventAt || null,
    datePrecision: input.eventAt ? 'minute' : null,
    revision: 1,
    contentHash,
    schemaVersion: 2,
    metadata: input.metadata || {},
  };
  const replica = await rpc<any>(env, token, 'memory_replica_apply', { p_snapshot:snapshot, p_base_revision:0, p_client_event_id:`mem_evt_${eventDigest.slice(0,24)}`, p_device_id:null });
  return { nodeId, replica };
}

async function archiveConversation(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, fingerprint: string, source: string, conversationKey: string) {
  const existing = await rest<any[]>(env, token, `conversation_summaries${query({ select: 'id,summary,metadata,decisions,open_loops,facts', conversation_key: `eq.${conversationKey}`, limit: '1' })}`).catch(() => []);
  if (existing[0]?.metadata?.lastCaptureFingerprint === fingerprint) return { record: existing[0], duplicate: true };

  const previous=existing[0]||null;
  const selectedSummary=decision.retention === 'none' ? '' : `${decision.kind}: ${decision.title}`.slice(0, 1000);
  const suppliedSummary=clean(input.conversationSummary,6000);
  const summary=suppliedSummary||[clean(previous?.summary,4500),selectedSummary].filter(Boolean).join('\n').slice(-6000);
  if (!summary) return { record: null, duplicate: false };
  const decisions = [...uniq(previous?.decisions,30,500),...uniq(input.decisions,30,500)];
  const facts = [...uniq(previous?.facts,40,500),...uniq(input.facts,40,500)];
  const openLoops = [...uniq(previous?.open_loops,30,500),...uniq(input.openLoops,30,500)];
  if (decision.memoryType === 'decision' && decision.retention === 'permanent') decisions.push(decision.content.slice(0, 500));
  if (decision.kind === 'memory' && decision.retention !== 'none') facts.push(decision.content.slice(0, 500));
  if (decision.kind === 'task') openLoops.push(decision.content.slice(0, 500));
  const projectRef = clean(input.projectId, 160);
  const body: any = {
    conversation_key: conversationKey,
    title: decision.title,
    summary,
    decisions: [...new Set(decisions)].slice(0, 30),
    open_loops: [...new Set(openLoops)].slice(0, 30),
    facts: [...new Set(facts)].slice(0, 40),
    status: 'active',
    fingerprint,
    ended_at: input.occurredAt && !Number.isNaN(Date.parse(String(input.occurredAt))) ? new Date(String(input.occurredAt)).toISOString() : new Date().toISOString(),
    metadata: { autoMemory: true, source, sourceRef: clean(input.sourceRef, 500), projectRef, topics: uniq(input.topics, 30, 120), classification: decision.kind, score: decision.score, retention: decision.retention, classifier: decision.classifier, lastCaptureFingerprint: fingerprint },
  };
  const projectId = projectUuid(input.projectId);
  if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, `conversation_summaries${query({ select: '*', on_conflict: 'user_id,conversation_key' })}`, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation' });
  return { record: rows[0] || null, duplicate: false };
}

async function findDomainCapture(env: Env, token: string, table: 'events' | 'tasks', captureFingerprint: string) {
  const q = new URLSearchParams();
  q.set('select', '*');
  q.set('metadata->>captureFingerprint', `eq.${captureFingerprint}`);
  q.set('limit', '1');
  return await rest<any[]>(env, token, `${table}?${q.toString()}`);
}

function domainMetadata(input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string) {
  return { autoMemory: true, pinned: decision.explicit, retention: decision.retention, projectRef: clean(input.projectId, 160), source, sourceRef: clean(input.sourceRef, 500), conversationKey, score: decision.score, captureFingerprint };
}

async function persistMemory(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string) {
  const projectRef = clean(input.projectId, 160), projectId = projectUuid(input.projectId);
  const fingerprint = await sha256Hex(['auto-memory', decision.memoryType, projectRef, normalize(decision.content)].join('\u001f'));
  const metadata = domainMetadata(input, decision, source, conversationKey, captureFingerprint);
  const body: any = { title: decision.title, content: decision.content, memory_type: decision.memoryType, importance: decision.importance, scope: projectRef ? 'project' : 'global', confidence: decision.confidence, status: 'active', tags: ['auto-memory', source, ...(decision.explicit ? ['pinned'] : [])], fingerprint, metadata };
  if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, `memories${query({ select: '*', on_conflict: 'user_id,fingerprint' })}`, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation' });
  const memory = rows[0] || null;
  if (!memory) return null;
  const nodeDigest = await sha256Hex(`auto-memory-node\u001f${fingerprint}`), nodeId = `mem_${nodeDigest.slice(0, 20)}`, contentHash = await sha256Hex(decision.content);
  const eventDigest = await sha256Hex([nodeId, '1', contentHash].join('\u001f'));
  const snapshot = {
    nodeId, nodeType: 'memory', referencePath: `ceo://memory/${nodeId}`, title: decision.title, content: decision.content, projectId: projectRef,
    memoryKind: decision.memoryType === 'rule' ? 'procedural' : decision.eventAt ? 'prospective' : 'semantic', sourceKind: 'conversation', truthStatus: 'reported', evidenceStatus: 'single_source',
    importance: decision.importance, retentionPolicy: decision.explicit ? 'pinned' : 'standard', tier: 'hot', topicIds: uniq(input.topics, 30, 120), entityIds: [], sourceRefs: [memory.id, clean(input.sourceRef, 500)].filter(Boolean), derivedFrom: [], eventAt: decision.eventAt, datePrecision: decision.eventAt ? 'minute' : null, revision: 1, contentHash, schemaVersion: 2, metadata,
  };
  const replica = await rpc<any>(env, token, 'memory_replica_apply', { p_snapshot: snapshot, p_base_revision: 0, p_client_event_id: `mem_evt_${eventDigest.slice(0, 24)}`, p_device_id: null });
  return { kind: 'memory', id: memory.id, nodeId, record: memory, replica };
}

async function persistEvent(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string, checkDuplicate: boolean) {
  if (!decision.eventAt) return null;
  if (checkDuplicate) {
    const existing = await findDomainCapture(env, token, 'events', captureFingerprint);
    if (existing[0]) {
      const mirror=await persistReplicaNode(env,token,{prefix:'evt',nodeType:'event',objectType:'event',objectId:existing[0].id,title:existing[0].title||decision.title,content:existing[0].description||decision.content,projectRef:clean(input.projectId,160),memoryKind:'prospective',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:uniq(input.topics,30,120),sourceRefs:[existing[0].id,clean(input.sourceRef,500)].filter(Boolean),eventAt:existing[0].start_at||decision.eventAt,metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
      return { kind: 'event', id: existing[0].id, nodeId:mirror.nodeId, record: existing[0], replica:mirror.replica, duplicate: true };
    }
  }
  const body: any = { title: decision.title, description: decision.content, event_type: decision.eventType, start_at: decision.eventAt, end_at: null, all_day: false, timezone: clean(input.timezone || 'Asia/Bangkok', 80), location: '', status: 'planned', priority: decision.importance >= 3 ? 'high' : 'normal', remind_at: null, tags: ['auto-memory', source], metadata: domainMetadata(input, decision, source, conversationKey, captureFingerprint) };
  const projectId = projectUuid(input.projectId); if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, 'events?select=*', { method: 'POST', body, prefer: 'return=representation' });
  const record=rows[0]; if(!record)return null;
  const mirror=await persistReplicaNode(env,token,{prefix:'evt',nodeType:'event',objectType:'event',objectId:record.id,title:record.title||decision.title,content:record.description||decision.content,projectRef:clean(input.projectId,160),memoryKind:'prospective',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:uniq(input.topics,30,120),sourceRefs:[record.id,clean(input.sourceRef,500)].filter(Boolean),eventAt:record.start_at||decision.eventAt,metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
  return { kind: 'event', id: record.id, nodeId:mirror.nodeId, record, replica:mirror.replica };
}

async function persistTask(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string, checkDuplicate: boolean) {
  if (checkDuplicate) {
    const existing = await findDomainCapture(env, token, 'tasks', captureFingerprint);
    if (existing[0]) {
      const mirror=await persistReplicaNode(env,token,{prefix:'task',nodeType:'task',objectType:'task',objectId:existing[0].id,title:existing[0].title||decision.title,content:existing[0].description||decision.content,projectRef:clean(input.projectId,160),memoryKind:'prospective',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:uniq(input.topics,30,120),sourceRefs:[existing[0].id,clean(input.sourceRef,500)].filter(Boolean),eventAt:existing[0].due_at||decision.dueAt,metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
      return { kind: 'task', id: existing[0].id, nodeId:mirror.nodeId, record: existing[0], replica:mirror.replica, duplicate: true };
    }
  }
  const body: any = { title: decision.title, description: decision.content, status: 'open', priority: decision.importance >= 3 ? 'high' : 'normal', due_at: decision.dueAt, waiting_for: '', tags: ['auto-memory', source], metadata: domainMetadata(input, decision, source, conversationKey, captureFingerprint) };
  const projectId = projectUuid(input.projectId); if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, 'tasks?select=*', { method: 'POST', body, prefer: 'return=representation' });
  const record=rows[0]; if(!record)return null;
  const mirror=await persistReplicaNode(env,token,{prefix:'task',nodeType:'task',objectType:'task',objectId:record.id,title:record.title||decision.title,content:record.description||decision.content,projectRef:clean(input.projectId,160),memoryKind:'prospective',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:uniq(input.topics,30,120),sourceRefs:[record.id,clean(input.sourceRef,500)].filter(Boolean),eventAt:record.due_at||decision.dueAt,metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
  return { kind: 'task', id: record.id, nodeId:mirror.nodeId, record, replica:mirror.replica };
}

async function persistContact(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string) {
  if (!decision.fullName) return null;
  const fingerprint = await sha256Hex(['person', normalize(decision.fullName), normalize(decision.organization)].join('\u001f'));
  const body: any = { full_name: decision.fullName, nickname: '', position: decision.position, organization: decision.organization, relationship: '', notes: decision.content, aliases: [], tags: ['auto-memory', source], importance: decision.importance, status: 'active', fingerprint, metadata: domainMetadata(input, decision, source, conversationKey, captureFingerprint) };
  const projectId = projectUuid(input.projectId); if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, `people${query({ select: '*', on_conflict: 'user_id,fingerprint' })}`, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation' });
  const record=rows[0]; if(!record)return null;
  const mirror=await persistReplicaNode(env,token,{prefix:'person',nodeType:'person',objectType:'person',objectId:record.id,title:record.full_name||decision.fullName||decision.title,content:record.notes||decision.content,projectRef:clean(input.projectId,160),memoryKind:'semantic',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:uniq(input.topics,30,120),sourceRefs:[record.id,clean(input.sourceRef,500)].filter(Boolean),metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
  return { kind: 'contact', id: record.id, nodeId:mirror.nodeId, record, replica:mirror.replica };
}

async function persistProjectKnowledge(env: Env, token: string, input: AutoMemoryInput, decision: AutoMemoryDecision, source: string, conversationKey: string, captureFingerprint: string) {
  const projectRef = clean(input.projectId, 160);
  const fingerprint = await sha256Hex(['project-knowledge', projectRef, normalize(decision.content)].join('\u001f'));
  const body: any = { title: decision.title, summary: decision.content.slice(0, 800), content: decision.content, knowledge_type: 'project', topic: decision.topic || projectRef || 'project', importance: decision.importance, confidence: decision.confidence, status: 'active', tags: ['auto-memory', source, ...uniq(input.topics, 10, 100)], fingerprint, metadata: domainMetadata(input, decision, source, conversationKey, captureFingerprint) };
  const projectId = projectUuid(input.projectId); if (projectId) body.project_id = projectId;
  const rows = await rest<any[]>(env, token, `knowledge_entries${query({ select: '*', on_conflict: 'user_id,fingerprint' })}`, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=representation' });
  const record=rows[0]; if(!record)return null;
  const mirror=await persistReplicaNode(env,token,{prefix:'project',nodeType:'project',objectType:'knowledge_entry',objectId:record.id,title:record.title||decision.title,content:record.content||decision.content,projectRef, memoryKind:'semantic',importance:decision.importance,retentionPolicy:decision.explicit?'permanent':'standard',tier:decision.explicit?'pinned':'hot',topicIds:[decision.topic,...uniq(input.topics,20,120)].filter(Boolean),sourceRefs:[record.id,clean(input.sourceRef,500)].filter(Boolean),metadata:domainMetadata(input,decision,source,conversationKey,captureFingerprint)});
  return { kind: 'project_knowledge', id: record.id, nodeId:mirror.nodeId, record, replica:mirror.replica };
}

export async function autoCapture(env: Env, token: string, input: AutoMemoryInput) {
  const message = clean(input.message, 12_000);
  if (!message) throw Object.assign(new Error('AUTO_MEMORY_MESSAGE_REQUIRED'), { status: 400 });
  const source = SOURCES.has(String(input.source || '')) ? String(input.source) : 'api';
  const normalizedInput: AutoMemoryInput = { ...input, message, source: source as AutoMemoryInput['source'] };
  const decision = await classifyAutoMemory(env, normalizedInput);
  const captureFingerprint = await sha256Hex(['auto-memory-capture', source, clean(input.sourceRef, 500), clean(input.projectId, 160), normalize(message), decision.kind].join('\u001f'));
  const conversationKey = clean(input.conversationId || input.conversationKey, 200) || `${source}:${captureFingerprint.slice(0, 32)}`;

  if (input.dryRun) return { decision, written: null, archive: null, duplicate: false, conversationKey, captureFingerprint };

  let archive: any = null, duplicate = false;
  if (input.archive !== false && !decision.blocked && (clean(input.conversationSummary, 6000) || decision.retention !== 'none')) {
    const archived = await archiveConversation(env, token, normalizedInput, decision, captureFingerprint, source, conversationKey);
    archive = archived.record;
    duplicate = archived.duplicate;
  }

  if (decision.blocked || decision.retention !== 'permanent' || decision.needsConfirmation || decision.kind === 'ignore') {
    return { decision, written: null, archive, duplicate, conversationKey, captureFingerprint };
  }

  let written: any = null;
  if (decision.kind === 'memory') written = await persistMemory(env, token, normalizedInput, decision, source, conversationKey, captureFingerprint);
  else if (decision.kind === 'event') written = await persistEvent(env, token, normalizedInput, decision, source, conversationKey, captureFingerprint, duplicate);
  else if (decision.kind === 'task') written = await persistTask(env, token, normalizedInput, decision, source, conversationKey, captureFingerprint, duplicate);
  else if (decision.kind === 'contact') written = await persistContact(env, token, normalizedInput, decision, source, conversationKey, captureFingerprint);
  else if (decision.kind === 'project_knowledge') written = await persistProjectKnowledge(env, token, normalizedInput, decision, source, conversationKey, captureFingerprint);

  return { decision, written, archive, duplicate: Boolean(duplicate || written?.duplicate), conversationKey, captureFingerprint };
}
