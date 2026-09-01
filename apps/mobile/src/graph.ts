import { KNOWLEDGE_SCHEMA, type KnowledgeGraph, type KnowledgeGraphLink, type KnowledgeGraphNode } from '@ceo-knowledge/shared';
import { supabase } from './supabase';

const GENERIC_TAGS=new Set(['auto-memory','mobile','chatgpt','claude','gemini','runtime','api','pinned','sync']);
const clean=(value:unknown,max=6000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
const textList=(value:unknown)=>Array.isArray(value)?value.map(v=>clean(v,120)).filter(Boolean):[];
const meta=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const stable=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};

function node(input:Partial<KnowledgeGraphNode>&Pick<KnowledgeGraphNode,'id'|'title'>):KnowledgeGraphNode{
  return {
    id:input.id,
    title:clean(input.title,300)||'Untitled',
    summary:clean(input.summary,1800),
    knowledge_type:clean(input.knowledge_type,80)||clean(input.node_type,80)||'knowledge',
    topic:clean(input.topic,160),
    status:'active',
    tags:textList(input.tags),
    updated_at:clean(input.updated_at,100)||new Date(0).toISOString(),
    node_type:clean(input.node_type,80)||clean(input.knowledge_type,80)||'knowledge',
    content:clean(input.content,12000),
    project_ref:clean(input.project_ref,180),
    source_kind:clean(input.source_kind,100),
    reference_path:clean(input.reference_path,600),
    event_at:input.event_at?clean(input.event_at,100):null,
    importance:Number.isFinite(Number(input.importance))?Number(input.importance):0,
    metadata:meta(input.metadata),
  };
}

function relationLabel(value:string){
  const key=value.toUpperCase();
  const labels:Record<string,string>={PART_OF:'อยู่ใน',ABOUT:'เกี่ยวกับ',RELATED_TO:'เกี่ยวข้อง',DERIVED_FROM:'มาจาก',MENTIONS:'กล่าวถึง',INVOLVES:'เกี่ยวข้องกับ',OCCURS_AT:'เกิดเมื่อ',SOURCE:'แหล่งที่มา',FOLLOWS:'ต่อจาก'};
  return labels[key]||value;
}

export async function loadKnowledgeGraph(nodeLimit=220,linkLimit=500):Promise<KnowledgeGraph>{
  const db=supabase.schema(KNOWLEDGE_SCHEMA);
  const limit=Math.max(40,Math.min(300,nodeLimit));
  const [memoryNodesR,knowledgeR,linksR,memoriesR,eventsR,tasksR,peopleR,decisionsR,conversationsR,projectsR]=await Promise.all([
    db.from('memory_nodes').select('node_id,node_type,object_type,object_id,reference_path,title,content,project_ref,memory_kind,source_kind,truth_status,evidence_status,importance,retention_policy,tier,topic_ids,entity_ids,source_refs,derived_from,event_at,metadata,created_at,updated_at').order('updated_at',{ascending:false}).limit(limit),
    db.from('knowledge_entries').select('id,project_id,title,summary,content,knowledge_type,topic,importance,status,tags,metadata,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(limit),
    db.from('knowledge_links').select('id,from_knowledge_id,to_knowledge_id,relation,weight,source,metadata,created_at').order('created_at',{ascending:false}).limit(Math.max(100,Math.min(800,linkLimit))),
    db.from('memories').select('id,project_id,title,content,memory_type,importance,scope,status,tags,metadata,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(limit),
    db.from('events').select('id,project_id,title,description,event_type,start_at,location,status,priority,tags,metadata,created_at,updated_at').order('start_at',{ascending:false}).limit(limit),
    db.from('tasks').select('id,project_id,title,description,status,priority,due_at,tags,metadata,created_at,updated_at').order('updated_at',{ascending:false}).limit(limit),
    db.from('people').select('id,project_id,full_name,nickname,position,organization,relationship,notes,status,tags,importance,metadata,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(limit),
    db.from('decisions').select('id,project_id,title,content,rationale,importance,status,tags,metadata,decided_at,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(limit),
    db.from('conversation_summaries').select('id,project_id,conversation_key,title,summary,decisions,open_loops,facts,status,metadata,started_at,ended_at,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(limit),
    db.from('projects').select('id,name,description,project_key,status,metadata,created_at,updated_at').eq('status','active').order('updated_at',{ascending:false}).limit(100),
  ]);
  const results=[memoryNodesR,knowledgeR,linksR,memoriesR,eventsR,tasksR,peopleR,decisionsR,conversationsR,projectsR];
  const error=results.find(r=>r.error)?.error;if(error)throw error;

  const nodes=new Map<string,KnowledgeGraphNode>();
  const edges=new Map<string,KnowledgeGraphLink>();
  const objectToNode=new Map<string,string>();
  const projectByUuid=new Map<string,string>();
  const projectByRef=new Map<string,string>();
  const conversationByKey=new Map<string,string>();
  const mirroredRefs=new Set<string>();
  const addNode=(n:KnowledgeGraphNode)=>{if(!nodes.has(n.id))nodes.set(n.id,n);return n.id};
  const addEdge=(from:string,to:string,relation:string,weight=.72,source='derived',metadata:Record<string,unknown>={})=>{
    if(!from||!to||from===to||!nodes.has(from)||!nodes.has(to))return;
    const key=[from,to,relation].join('|');if(edges.has(key))return;
    edges.set(key,{id:'edge_'+stable(key),from_knowledge_id:from,to_knowledge_id:to,relation:relationLabel(relation),weight:Math.max(.1,Math.min(1,Number(weight)||.5)),source,metadata,created_at:new Date().toISOString()});
  };

  for(const raw of projectsR.data||[]){
    const id='project:'+raw.id;addNode(node({id,title:raw.name,summary:raw.description,knowledge_type:'project',node_type:'project',topic:raw.project_key,tags:['project'],updated_at:raw.updated_at,project_ref:raw.project_key,reference_path:'ceo://project/'+raw.id,metadata:{...meta(raw.metadata),objectId:raw.id,projectKey:raw.project_key}}));
    projectByUuid.set(String(raw.id),id);projectByRef.set(clean(raw.project_key,180),id);
  }

  for(const raw of memoryNodesR.data||[]){
    const id=String(raw.node_id);const tags=[...textList(raw.topic_ids),clean(raw.memory_kind,80),clean(raw.tier,80)].filter(Boolean);
    addNode(node({id,title:raw.title||raw.node_type,summary:clean(raw.content,900),content:raw.content,knowledge_type:raw.node_type,node_type:raw.node_type,topic:clean(raw.project_ref,160)||textList(raw.topic_ids)[0]||raw.node_type,tags,updated_at:raw.updated_at,project_ref:raw.project_ref,source_kind:raw.source_kind,reference_path:raw.reference_path,event_at:raw.event_at,importance:raw.importance,metadata:{...meta(raw.metadata),objectType:raw.object_type,objectId:raw.object_id,memoryKind:raw.memory_kind,truthStatus:raw.truth_status,evidenceStatus:raw.evidence_status,retentionPolicy:raw.retention_policy,tier:raw.tier,topicIds:textList(raw.topic_ids),entityIds:textList(raw.entity_ids),sourceRefs:textList(raw.source_refs),derivedFrom:textList(raw.derived_from)}}));
    if(raw.object_id)objectToNode.set(String(raw.object_id),id);
    for(const ref of textList(raw.source_refs))mirroredRefs.add(ref);
  }

  const legacy=(id:string,type:string,title:string,summary:string,content:string,updated:string,extra:Record<string,unknown>)=>addNode(node({id,type,title,summary,content,knowledge_type:type,node_type:type,topic:clean(extra.topic||extra.projectRef||type,160),tags:textList(extra.tags),updated_at:updated,project_ref:clean(extra.projectRef,180),source_kind:clean(meta(extra.metadata).source,100)||'legacy',reference_path:'ceo://'+type+'/'+clean(extra.objectId,100),event_at:extra.eventAt?clean(extra.eventAt,100):null,importance:Number(extra.importance||0),metadata:extra} as any));

  for(const raw of knowledgeR.data||[]){if(objectToNode.has(String(raw.id)))continue;const id=String(raw.id);addNode(node({id,title:raw.title,summary:raw.summary,content:raw.content,knowledge_type:raw.knowledge_type,node_type:'knowledge',topic:raw.topic,tags:raw.tags||[],updated_at:raw.updated_at,importance:raw.importance,metadata:{...meta(raw.metadata),objectId:raw.id,projectId:raw.project_id}}));objectToNode.set(String(raw.id),id)}
  for(const raw of memoriesR.data||[]){if(mirroredRefs.has(String(raw.id))||objectToNode.has(String(raw.id)))continue;legacy('memory:'+raw.id,'memory',raw.title||raw.memory_type,raw.content,raw.content,raw.updated_at,{objectId:raw.id,projectId:raw.project_id,projectRef:clean(meta(raw.metadata).projectRef,180),tags:raw.tags,importance:raw.importance,metadata:raw.metadata,memoryType:raw.memory_type,scope:raw.scope});}
  for(const raw of eventsR.data||[]){if(['cancelled'].includes(String(raw.status))||mirroredRefs.has(String(raw.id))||objectToNode.has(String(raw.id)))continue;legacy('event:'+raw.id,'event',raw.title,raw.description,raw.description,raw.updated_at,{objectId:raw.id,projectId:raw.project_id,projectRef:clean(meta(raw.metadata).projectRef,180),tags:raw.tags,eventAt:raw.start_at,metadata:raw.metadata,eventType:raw.event_type,location:raw.location,domainStatus:raw.status,priority:raw.priority});}
  for(const raw of tasksR.data||[]){if(['cancelled'].includes(String(raw.status))||mirroredRefs.has(String(raw.id))||objectToNode.has(String(raw.id)))continue;legacy('task:'+raw.id,'task',raw.title,raw.description,raw.description,raw.updated_at,{objectId:raw.id,projectId:raw.project_id,projectRef:clean(meta(raw.metadata).projectRef,180),tags:raw.tags,eventAt:raw.due_at,metadata:raw.metadata,domainStatus:raw.status,priority:raw.priority});}
  for(const raw of peopleR.data||[]){if(mirroredRefs.has(String(raw.id))||objectToNode.has(String(raw.id)))continue;legacy('person:'+raw.id,'person',raw.full_name,([raw.position,raw.organization].filter(Boolean).join(' · ')),raw.notes,raw.updated_at,{objectId:raw.id,projectId:raw.project_id,projectRef:clean(meta(raw.metadata).projectRef,180),tags:raw.tags,importance:raw.importance,metadata:raw.metadata,nickname:raw.nickname,position:raw.position,organization:raw.organization,relationship:raw.relationship});}
  for(const raw of decisionsR.data||[]){if(mirroredRefs.has(String(raw.id))||objectToNode.has(String(raw.id)))continue;legacy('decision:'+raw.id,'decision',raw.title||'Decision',raw.content,raw.content,raw.updated_at,{objectId:raw.id,projectId:raw.project_id,projectRef:clean(meta(raw.metadata).projectRef,180),tags:raw.tags,importance:raw.importance,eventAt:raw.decided_at,metadata:raw.metadata,rationale:raw.rationale});}
  for(const raw of conversationsR.data||[]){const id='conversation:'+raw.id;addNode(node({id,title:raw.title||'Conversation',summary:raw.summary,content:raw.summary,knowledge_type:'conversation',node_type:'conversation',topic:'conversation',tags:['conversation'],updated_at:raw.updated_at,source_kind:clean(meta(raw.metadata).source,100)||'conversation',reference_path:'ceo://conversation/'+raw.id,event_at:raw.ended_at,metadata:{...meta(raw.metadata),objectId:raw.id,projectId:raw.project_id,conversationKey:raw.conversation_key,decisions:raw.decisions,openLoops:raw.open_loops,facts:raw.facts}}));conversationByKey.set(clean(raw.conversation_key,240),id)}

  // Existing curated Knowledge links.
  for(const raw of linksR.data||[])addEdge(String(raw.from_knowledge_id),String(raw.to_knowledge_id),String(raw.relation||'RELATED_TO'),Number(raw.weight||.7),String(raw.source||'knowledge_links'),meta(raw.metadata));

  // Build project, topic, source, conversation and explicit Memory OS relationships.
  for(const n of [...nodes.values()]){
    const m=meta(n.metadata);const projectId=clean(m.projectId,100);const projectRef=clean(n.project_ref||m.projectRef,180);
    let projectNode=projectId?projectByUuid.get(projectId):undefined;
    if(!projectNode&&projectRef)projectNode=projectByRef.get(projectRef);
    if(!projectNode&&projectRef){projectNode='project-ref:'+stable(projectRef);addNode(node({id:projectNode,title:projectRef,summary:'Project reference',knowledge_type:'project',node_type:'project',topic:projectRef,tags:['project'],updated_at:n.updated_at,project_ref:projectRef,reference_path:'ceo://project-ref/'+encodeURIComponent(projectRef)}));projectByRef.set(projectRef,projectNode)}
    if(projectNode&&projectNode!==n.id)addEdge(n.id,projectNode,'PART_OF',.92,'project');

    const topics=[n.topic,...n.tags,...textList(m.topicIds),...textList(m.topics)].map(x=>clean(x,100)).filter(x=>x&&x.length>1&&!GENERIC_TAGS.has(x.toLocaleLowerCase())&&!['memory','event','task','person','decision','conversation','project','knowledge'].includes(x.toLocaleLowerCase())).slice(0,4);
    for(const topic of [...new Set(topics)]){const topicId='topic:'+stable(topic.toLocaleLowerCase());addNode(node({id:topicId,title:topic,summary:'หัวข้อเชื่อมโยง',knowledge_type:'topic',node_type:'topic',topic,tags:['topic'],updated_at:n.updated_at,reference_path:'ceo://topic/'+encodeURIComponent(topic)}));addEdge(n.id,topicId,'ABOUT',.78,'topic')}

    const conversationKey=clean(m.conversationKey,240);if(conversationKey&&conversationByKey.has(conversationKey))addEdge(n.id,conversationByKey.get(conversationKey)!,'DERIVED_FROM',.96,'auto-memory');
    const sourceRef=clean(m.sourceRef,500);if(sourceRef){const sourceId='source:'+stable(sourceRef);addNode(node({id:sourceId,title:clean(m.source,80)||'Source',summary:sourceRef,content:sourceRef,knowledge_type:'source',node_type:'source',topic:'source',tags:['source'],updated_at:n.updated_at,source_kind:clean(m.source,80),reference_path:sourceRef,metadata:{sourceRef}}));addEdge(n.id,sourceId,'SOURCE',.84,'provenance')}
    for(const target of textList(m.derivedFrom)){if(nodes.has(target))addEdge(n.id,target,'DERIVED_FROM',.94,'memory-os')}
    for(const target of textList(m.entityIds)){if(nodes.has(target))addEdge(n.id,target,'INVOLVES',.82,'memory-os')}
  }

  // Connect nodes sharing the same non-generic topic, but keep the graph readable.
  const groups=new Map<string,string[]>();for(const n of nodes.values()){const t=clean(n.topic,100).toLocaleLowerCase();if(!t||GENERIC_TAGS.has(t)||['memory','event','task','person','decision','conversation','project','knowledge','source'].includes(t))continue;const list=groups.get(t)||[];if(list.length<12)list.push(n.id);groups.set(t,list)}
  for(const ids of groups.values())for(let i=1;i<ids.length;i++)addEdge(ids[0]!,ids[i]!,'RELATED_TO',.48,'topic-cluster');

  const finalNodes=[...nodes.values()].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,320);
  const visible=new Set(finalNodes.map(n=>n.id));
  const finalLinks=[...edges.values()].filter(e=>visible.has(e.from_knowledge_id)&&visible.has(e.to_knowledge_id)).slice(0,900);
  return {nodes:finalNodes,links:finalLinks};
}
