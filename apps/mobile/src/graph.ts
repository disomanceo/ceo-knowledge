import { filterActiveKnowledgeGraph, KNOWLEDGE_SCHEMA, type KnowledgeGraph, type KnowledgeGraphLink, type KnowledgeGraphNode } from '@ceo-knowledge/shared';
import { supabase } from './supabase';

export async function loadKnowledgeGraph(nodeLimit = 80, linkLimit = 200): Promise<KnowledgeGraph> {
  const db = supabase.schema(KNOWLEDGE_SCHEMA);
  const nodesResult = await db.from('knowledge_entries')
    .select('id,title,summary,knowledge_type,topic,status,tags,updated_at')
    .eq('status','active')
    .order('updated_at',{ ascending:false })
    .limit(Math.max(1,Math.min(120,nodeLimit)));
  if (nodesResult.error) throw nodesResult.error;
  const linksResult = await db.from('knowledge_links')
    .select('id,from_knowledge_id,to_knowledge_id,relation,weight,source,metadata,created_at')
    .order('created_at',{ ascending:false })
    .limit(Math.max(1,Math.min(400,linkLimit)));
  if (linksResult.error) throw linksResult.error;
  return filterActiveKnowledgeGraph({
    nodes: (nodesResult.data || []) as KnowledgeGraphNode[],
    links: (linksResult.data || []).map((link:any)=>({ ...link, weight:Number(link.weight||0) })) as KnowledgeGraphLink[],
  });
}
