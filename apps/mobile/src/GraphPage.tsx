import { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, List, Minus, Network, Plus, RefreshCw, RotateCcw, Search, Share2 } from 'lucide-react';
import type { KnowledgeGraph, KnowledgeGraphNode } from '@ceo-knowledge/shared';
import { loadKnowledgeGraph } from './graph';
import './graph.css';

const short=(value:string,max=26)=>value.length>max?value.slice(0,max-1)+'…':value;
const typeName=(value:string)=>({memory:'Memory',event:'Event',task:'Task',person:'Person',decision:'Decision',project:'Project',conversation:'Conversation',topic:'Topic',source:'Source',knowledge:'Knowledge',claim:'Claim',summary:'Summary'} as Record<string,string>)[value]||value||'Knowledge';
const TYPE_FILTERS=['all','memory','event','task','person','decision','project','conversation','knowledge'] as const;
type FilterType=typeof TYPE_FILTERS[number];

function searchGraph(graph:KnowledgeGraph,query:string,type:FilterType,focusId:string):KnowledgeGraph{
  const q=query.trim().toLocaleLowerCase();
  const typeMatches=(node:KnowledgeGraphNode)=>type==='all'||String(node.node_type||node.knowledge_type).toLocaleLowerCase()===type;
  let direct=new Set(graph.nodes.filter(node=>typeMatches(node)&&(!q||[node.title,node.summary,node.content,node.topic,node.node_type,node.knowledge_type,node.project_ref,node.source_kind,...(node.tags||[])].join(' ').toLocaleLowerCase().includes(q))).map(node=>node.id));
  if(focusId){direct=new Set([focusId]);}
  if(!direct.size)return {nodes:[],links:[]};
  const visible=new Set(direct);
  for(const link of graph.links){if(direct.has(link.from_knowledge_id)||direct.has(link.to_knowledge_id)){visible.add(link.from_knowledge_id);visible.add(link.to_knowledge_id)}}
  const nodes=graph.nodes.filter(node=>visible.has(node.id)&&(type==='all'||focusId?true:typeMatches(node)||!direct.has(node.id)));
  const ids=new Set(nodes.map(node=>node.id));
  return {nodes,links:graph.links.filter(link=>ids.has(link.from_knowledge_id)&&ids.has(link.to_knowledge_id))};
}

function spiderLayout(graph:KnowledgeGraph,width=1400,height=1000){
  const degree=new Map<string,number>();for(const n of graph.nodes)degree.set(n.id,0);for(const e of graph.links){degree.set(e.from_knowledge_id,(degree.get(e.from_knowledge_id)||0)+1);degree.set(e.to_knowledge_id,(degree.get(e.to_knowledge_id)||0)+1)}
  const sorted=[...graph.nodes].sort((a,b)=>(degree.get(b.id)||0)-(degree.get(a.id)||0)||String(a.title).localeCompare(String(b.title)));
  const cx=width/2,cy=height/2,golden=2.399963229728653;
  return sorted.map((node,index)=>{
    if(index===0)return {...node,x:cx,y:cy,degree:degree.get(node.id)||0};
    const rx=Math.min(width*.44,54*Math.sqrt(index)),ry=Math.min(height*.43,38*Math.sqrt(index));
    const angle=index*golden;
    return {...node,x:cx+Math.cos(angle)*rx,y:cy+Math.sin(angle)*ry,degree:degree.get(node.id)||0};
  });
}

export default function GraphPage(){
  const[graph,setGraph]=useState<KnowledgeGraph>({nodes:[],links:[]});
  const[selectedId,setSelectedId]=useState('');const[query,setQuery]=useState('');const[type,setType]=useState<FilterType>('all');const[focusId,setFocusId]=useState('');
  const[mode,setMode]=useState<'graph'|'list'>('graph');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const[view,setView]=useState({x:0,y:0,scale:.72});const drag=useRef<{x:number;y:number;cx:number;cy:number}|null>(null);
  const load=async()=>{setBusy(true);setError('');try{const data=await loadKnowledgeGraph();setGraph(data);setSelectedId(current=>data.nodes.some(node=>node.id===current)?current:(data.nodes[0]?.id||''));}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}};
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>searchGraph(graph,query,type,focusId),[graph,query,type,focusId]);
  const layout=useMemo(()=>spiderLayout(visible),[visible]);const positions=useMemo(()=>new Map(layout.map(node=>[node.id,node])),[layout]);
  const selected=graph.nodes.find(node=>node.id===selectedId)||visible.nodes[0]||null;
  const related=selected?graph.links.filter(link=>link.from_knowledge_id===selected.id||link.to_knowledge_id===selected.id):[];
  const relatedIds=new Set(related.flatMap(link=>[link.from_knowledge_id,link.to_knowledge_id]));
  const counts=useMemo(()=>graph.nodes.reduce<Record<string,number>>((acc,n)=>{const key=String(n.node_type||n.knowledge_type||'knowledge');acc[key]=(acc[key]||0)+1;return acc},{}),[graph]);
  const resetView=()=>setView({x:0,y:0,scale:.72});
  const zoom=(delta:number)=>setView(v=>({...v,scale:Math.max(.28,Math.min(2.8,v.scale+delta))}));

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Memory Graph</h1><p className="muted text-xs mt-1">เครือข่าย Memory OS · ความจำ งาน นัด คน โปรเจกต์ และบทสนทนา</p></div><button className="btn px-3" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={query} onChange={e=>{setQuery(e.target.value);setFocusId('')}} placeholder="ค้นเรื่อง / คน / โปรเจกต์ / source"/></div><button className="btn px-3" onClick={()=>setMode(mode==='graph'?'list':'graph')} title={mode==='graph'?'ดูแบบรายการ':'ดูแบบกราฟ'}>{mode==='graph'?<List size={18}/>:<Network size={18}/>}</button></div>
    <div className="graph-filter-row">{TYPE_FILTERS.map(value=><button key={value} onClick={()=>{setType(value);setFocusId('')}} className={'graph-filter '+(type===value?'graph-filter-active':'')}>{value==='all'?'ทั้งหมด':typeName(value)}{value!=='all'&&counts[value]?<span>{counts[value]}</span>:null}</button>)}</div>
    <div className="flex gap-2 flex-wrap"><span className="badge">Nodes {visible.nodes.length}</span><span className="badge">Links {visible.links.length}</span>{focusId&&<button className="badge accent" onClick={()=>setFocusId('')}>ออกจาก Focus</button>}</div>

    {mode==='graph'?<section className="card graph-shell overflow-hidden relative">
      <div className="graph-toolbar"><button onClick={()=>zoom(.18)} title="Zoom in"><Plus size={16}/></button><button onClick={()=>zoom(-.18)} title="Zoom out"><Minus size={16}/></button><button onClick={resetView} title="Fit view"><RotateCcw size={16}/></button></div>
      {layout.length?<svg className="graph-canvas graph-interactive" viewBox="0 0 1400 1000" role="img" aria-label="Ceo Memory Graph" onWheel={e=>{e.preventDefault();setView(v=>({...v,scale:Math.max(.28,Math.min(2.8,v.scale*(e.deltaY>0?.9:1.1))) }))}} onPointerDown={e=>{if((e.target as Element).closest('.graph-node'))return;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);drag.current={x:view.x,y:view.y,cx:e.clientX,cy:e.clientY}}} onPointerMove={e=>{if(!drag.current)return;setView(v=>({...v,x:drag.current!.x+(e.clientX-drag.current!.cx)/Math.max(.4,v.scale),y:drag.current!.y+(e.clientY-drag.current!.cy)/Math.max(.4,v.scale)}))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g>{visible.links.map(link=>{const a=positions.get(link.from_knowledge_id),b=positions.get(link.to_knowledge_id);if(!a||!b)return null;const active=selectedId&&(link.from_knowledge_id===selectedId||link.to_knowledge_id===selectedId);return <line key={link.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={active?'graph-edge graph-edge-active':'graph-edge'} strokeWidth={1+Math.max(0,Math.min(1,Number(link.weight||0)))*2.2}/>})}</g>
          <g>{layout.map(node=>{const active=node.id===selectedId,neighbor=relatedIds.has(node.id),kind=String(node.node_type||node.knowledge_type||'knowledge').toLowerCase();const r=16+Math.min(6,node.degree)*1.6;return <g key={node.id} className="graph-node" role="button" tabIndex={0} aria-label={node.title||'Node'} onClick={()=>setSelectedId(node.id)} onDoubleClick={()=>{setSelectedId(node.id);setFocusId(node.id);setView({x:0,y:0,scale:1})}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedId(node.id)}}}><circle cx={node.x} cy={node.y} r={r} className={`graph-dot graph-dot-${kind} ${active?'graph-dot-active':neighbor?'graph-dot-related':''}`}/><text x={node.x} y={node.y+r+14} textAnchor="middle" className="graph-label">{short(node.title||node.topic||typeName(kind),20)}</text></g>})}</g>
        </g>
      </svg>:<div className="p-8 text-center muted text-sm">{busy?'กำลังโหลด Graph…':query?'ไม่พบโหนดที่ตรงกับคำค้น':'ยังไม่มี Memory Graph'}</div>}
      <div className="graph-zoom-readout">{Math.round(view.scale*100)}%</div>
    </section>:<section className="space-y-2">{visible.nodes.map(n=><button key={n.id} className={'card p-4 w-full text-left '+(n.id===selectedId?'graph-list-active':'')} onClick={()=>{setSelectedId(n.id);setMode('graph')}}><div className="flex items-center gap-2"><span className={'graph-type-pill type-'+String(n.node_type||n.knowledge_type)}>{typeName(String(n.node_type||n.knowledge_type))}</span><div className="font-semibold">{n.title||n.topic||'Node'}</div></div><div className="muted text-xs mt-1">{n.project_ref||n.topic||n.source_kind||''}</div>{(n.summary||n.content)&&<p className="text-sm mt-2 text-[#c7ccda] line-clamp-2">{n.summary||n.content}</p>}</button>)}{!visible.nodes.length&&<div className="card p-6 text-center muted text-sm">ไม่พบโหนด</div>}</section>}

    {selected&&<section className="card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex gap-2 items-center flex-wrap"><span className={'graph-type-pill type-'+String(selected.node_type||selected.knowledge_type)}>{typeName(String(selected.node_type||selected.knowledge_type))}</span><div className="font-semibold text-lg">{selected.title||selected.topic||'Node'}</div></div><div className="muted text-xs mt-2">{selected.project_ref?`Project · ${selected.project_ref}`:selected.topic?`Topic · ${selected.topic}`:''}{selected.source_kind?` · Source ${selected.source_kind}`:''}</div></div><Share2 className="accent shrink-0" size={20}/></div>
      {(selected.content||selected.summary)&&<p className="text-sm leading-6 text-[#c7ccda] mt-3 whitespace-pre-wrap">{selected.content||selected.summary}</p>}
      <div className="graph-detail-grid mt-3"><div><span>อยู่ที่</span><b>{selected.reference_path||'Ceo Knowledge Cloud'}</b></div>{selected.event_at&&<div><span>วันเวลา</span><b>{new Date(selected.event_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</b></div>}<div><span>ความสัมพันธ์</span><b>{related.length} โหนด</b></div>{selected.importance!==undefined&&<div><span>ความสำคัญ</span><b>{selected.importance}/3</b></div>}</div>
      <div className="flex gap-2 mt-3 flex-wrap">{(selected.tags||[]).slice(0,8).map(tag=><span className="badge" key={tag}>{tag}</span>)}<button className="badge accent" onClick={()=>{setFocusId(selected.id);setView({x:0,y:0,scale:1})}}><Focus size={13}/> โฟกัสโหนดนี้</button></div>
      {related.length>0&&<div className="mt-4 pt-3 border-t border-[#262c3a] space-y-2"><div className="muted text-xs">โหนดที่เชื่อมโยง</div>{related.slice(0,18).map(link=>{const otherId=link.from_knowledge_id===selected.id?link.to_knowledge_id:link.from_knowledge_id;const other=graph.nodes.find(node=>node.id===otherId);return <button key={link.id} onClick={()=>setSelectedId(otherId)} className="w-full flex items-center justify-between gap-3 text-left py-1.5"><span className="text-sm">{other?.title||otherId}</span><span className="badge">{link.relation} · {Math.round(Number(link.weight||0)*100)}%</span></button>})}</div>}
    </section>}
  </div>;
}
