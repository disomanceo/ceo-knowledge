import { describe, expect, it } from 'vitest';
import { filterActiveKnowledgeGraph, isRemoteSafeTool, layoutKnowledgeGraph, normalizeSearchTokens, REMOTE_SAFE_TOOLS } from '../src/index';

describe('shared contracts', () => {
  it('does not expose raw shell/process mutation tools remotely', () => {
    expect(REMOTE_SAFE_TOOLS).not.toContain('process.run' as never);
    expect(REMOTE_SAFE_TOOLS).not.toContain('shell.execute' as never);
    expect(isRemoteSafeTool('runtime.status')).toBe(true);
    expect(isRemoteSafeTool('knowledge.semantic_search')).toBe(true);
    expect(isRemoteSafeTool('knowledge.graph')).toBe(true);
    expect(isRemoteSafeTool('knowledge.sources')).toBe(true);
    expect(isRemoteSafeTool('knowledge.ingest_file')).toBe(false);
    expect(isRemoteSafeTool('process.run')).toBe(false);
  });

  it('normalizes and deduplicates search tokens', () => {
    expect(normalizeSearchTokens('Ceo   Ceo Knowledge, Runtime')).toEqual(['ceo','knowledge','runtime']);
  });

  it('filters graph links whose endpoints are not active', () => {
    const graph = filterActiveKnowledgeGraph({
      nodes: [
        { id:'a',title:'A',summary:'',knowledge_type:'project',topic:'',status:'active',tags:[],updated_at:'' },
        { id:'b',title:'B',summary:'',knowledge_type:'project',topic:'',status:'active',tags:[],updated_at:'' },
        { id:'c',title:'C',summary:'',knowledge_type:'project',topic:'',status:'forgotten',tags:[],updated_at:'' },
      ],
      links: [
        { id:'l1',from_knowledge_id:'a',to_knowledge_id:'b',relation:'related_to',weight:.7,source:'semantic',metadata:{},created_at:'' },
        { id:'l2',from_knowledge_id:'a',to_knowledge_id:'c',relation:'related_to',weight:.8,source:'semantic',metadata:{},created_at:'' },
      ],
    });
    expect(graph.nodes.map(node=>node.id)).toEqual(['a','b']);
    expect(graph.links.map(link=>link.id)).toEqual(['l1']);
  });

  it('lays out the highest-degree graph node at the center with bounded coordinates', () => {
    const graph = {
      nodes: ['a','b','c'].map(id=>({ id,title:id.toUpperCase(),summary:'',knowledge_type:'project',topic:'',status:'active',tags:[],updated_at:'' })),
      links: [
        { id:'l1',from_knowledge_id:'a',to_knowledge_id:'b',relation:'related_to',weight:.7,source:'semantic',metadata:{},created_at:'' },
        { id:'l2',from_knowledge_id:'a',to_knowledge_id:'c',relation:'related_to',weight:.8,source:'semantic',metadata:{},created_at:'' },
      ],
    };
    const layout = layoutKnowledgeGraph(graph, 600, 360);
    expect(layout.nodes[0]?.id).toBe('a');
    expect(layout.nodes[0]?.x).toBe(300);
    expect(layout.nodes[0]?.y).toBe(180);
    expect(layout.nodes.every(node=>node.x>=0&&node.x<=600&&node.y>=0&&node.y<=360)).toBe(true);
  });
});
