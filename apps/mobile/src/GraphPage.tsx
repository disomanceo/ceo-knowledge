import { useEffect, useMemo, useState } from 'react';
import { List, Network, RefreshCw, Search, Share2 } from 'lucide-react';
import { layoutKnowledgeGraph, type KnowledgeGraph, type KnowledgeGraphLayoutNode } from '@ceo-knowledge/shared';
import { loadKnowledgeGraph } from './graph';

const short=(value:string,max=24)=>value.length>max?value.slice(0,max-1)+'…':value;

function viewForQuery(graph:KnowledgeGraph, query:string):KnowledgeGraph {
  const q=query.trim().toLocaleLowerCase();
  if(!q)return graph;
  const direct=new Set(graph.nodes.filter(node=>[node.title,node.topic,node.knowledge_type,...(node.tags||[])].join(' ').toLocaleLowerCase().includes(q)).map(node=>node.id));
  if(!direct.size)return {nodes:[],links:[]};
  const visible=new Set(direct);
  for(const link of graph.links){if(direct.has(link.from_knowledge_id)||direct.has(link.to_knowledge_id)){visible.add(link.from_knowledge_id);visible.add(link.to_knowledge_id);}}
  return {nodes:graph.nodes.filter(node=>visible.has(node.id)),links:graph.links.filter(link=>visible.has(link.from_knowledge_id)&&visible.has(link.to_knowledge_id))};
}

export default function GraphPage(){
  const[graph,setGraph]=useState<KnowledgeGraph>({nodes:[],links:[]});
  const[selectedId,setSelectedId]=useState('');
  const[query,setQuery]=useState('');
  const[mode,setMode]=useState<'graph'|'list'>('graph');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const load=async()=>{setBusy(true);setError('');try{const data=await loadKnowledgeGraph();setGraph(data);setSelectedId(current=>data.nodes.some(node=>node.id===current)?current:(data.nodes[0]?.id||''));}catch(e:any){setError(String(e?.message||e));}finally{setBusy(false)}};
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>viewForQuery(graph,query),[graph,query]);
  const layout=useMemo(()=>layoutKnowledgeGraph(visible,720,430),[visible]);
  const positions=useMemo(()=>new Map(layout.nodes.map(node=>[node.id,node])),[layout]);
  const selected=graph.nodes.find(node=>node.id===selectedId)||visible.nodes[0]||null;
  const related=selected?graph.links.filter(link=>link.from_knowledge_id===selected.id||link.to_knowledge_id===selected.id):[];
  const relatedIds=new Set(related.flatMap(link=>[link.from_knowledge_id,link.to_knowledge_id]));
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Knowledge Graph</h1><p className="muted text-xs mt-1">อ่านจาก Supabase Cloud โดยตรง · ไม่ต้องเปิด PC</p></div><button className="btn px-3" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหัวข้อ / tag / type"/></div><button className="btn px-3" onClick={()=>setMode(mode==='graph'?'list':'graph')} title={mode==='graph'?'ดูแบบรายการ':'ดูแบบกราฟ'}>{mode==='graph'?<List size={18}/>:<Network size={18}/>}</button></div>
    <div className="flex gap-2 flex-wrap"><span className="badge">Knowledge {visible.nodes.length}</span><span className="badge">Links {visible.links.length}</span><span className="badge">Active only</span></div>
    {mode==='graph'?<section className="card graph-shell overflow-hidden">
      {layout.nodes.length?<svg className="graph-canvas" viewBox={'0 0 '+layout.width+' '+layout.height} role="img" aria-label="Ceo Knowledge Graph">
        <g>{layout.links.map(link=>{const a=positions.get(link.from_knowledge_id),b=positions.get(link.to_knowledge_id);if(!a||!b)return null;const active=selectedId&&(link.from_knowledge_id===selectedId||link.to_knowledge_id===selectedId);return <line key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={active?'graph-edge graph-edge-active':'graph-edge'} strokeWidth={1+Math.max(0,Math.min(1,Number(link.weight||0)))*2.5}/>})}</g>
        <g>{layout.nodes.map((node:KnowledgeGraphLayoutNode)=>{const active=node.id===selectedId,neighbor=relatedIds.has(node.id);const r=17+Math.min(5,node.degree)*2;return <g key={node.id} className="graph-node" role="button" tabIndex={0} aria-label={node.title||'Knowledge'} onClick={()=>setSelectedId(node.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedId(node.id)}}}><circle cx={node.x} cy={node.y} r={r} className={active?'graph-dot graph-dot-active':neighbor?'graph-dot graph-dot-related':'graph-dot'}/><text x={node.x} y={node.y+r+15} textAnchor="middle" className="graph-label">{short(node.title||node.topic||'Knowledge',18)}</text></g>})}</g>
      </svg>:<div className="p-8 text-center muted text-sm">{busy?'กำลังโหลด Graph…':query?'ไม่พบ Knowledge ที่ตรงกับคำค้น':'ยังไม่มี Knowledge Graph'}</div>}
    </section>:<section className="space-y-2">{visible.nodes.map(node=><button key={node.id} className={'card p-4 w-full text-left '+(node.id===selectedId?'graph-list-active':'')} onClick={()=>{setSelectedId(node.id);setMode('graph')}}><div className="font-semibold">{node.title||node.topic||'Knowledge'}</div><div className="muted text-xs mt-1">{node.knowledge_type}{node.topic?' · '+node.topic:''}</div>{node.summary&&<p className="text-sm mt-2 text-[#c7ccda] line-clamp-2">{node.summary}</p>}</button>)}{!visible.nodes.length&&<div className="card p-6 text-center muted text-sm">ไม่พบ Knowledge</div>}</section>}
    {selected&&<section className="card p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-lg">{selected.title||selected.topic||'Knowledge'}</div><div className="muted text-xs mt-1">{selected.knowledge_type}{selected.topic?' · '+selected.topic:''}</div></div><Share2 className="accent shrink-0" size={20}/></div>{selected.summary&&<p className="text-sm leading-6 text-[#c7ccda] mt-3">{selected.summary}</p>}<div className="flex gap-2 mt-3 flex-wrap">{(selected.tags||[]).slice(0,8).map(tag=><span className="badge" key={tag}>{tag}</span>)}<span className="badge">สัมพันธ์ {related.length}</span></div>{related.length>0&&<div className="mt-4 pt-3 border-t border-[#262c3a] space-y-2">{related.slice(0,10).map(link=>{const otherId=link.from_knowledge_id===selected.id?link.to_knowledge_id:link.from_knowledge_id;const other=graph.nodes.find(node=>node.id===otherId);return <button key={link.id} onClick={()=>setSelectedId(otherId)} className="w-full flex items-center justify-between gap-3 text-left py-1.5"><span className="text-sm">{other?.title||otherId}</span><span className="badge">{link.relation} · {Math.round(Number(link.weight||0)*100)}%</span></button>})}</div>}</section>}
  </div>;
}
