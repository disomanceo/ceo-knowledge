import { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, List, Minus, Network, Plus, RefreshCw, RotateCcw, Search, Share2 } from 'lucide-react';
import type { KnowledgeGraph, KnowledgeGraphNode } from '@ceo-knowledge/shared';
import { loadKnowledgeGraph } from './graph';
import './graph.css';

const WORLD_W=1600, WORLD_H=1080, MIN_VIEW_W=230, MAX_VIEW_W=2200;
const short=(value:string,max=26)=>value.length>max?value.slice(0,max-1)+'…':value;
const typeName=(value:string)=>({memory:'Memory',event:'Event',task:'Task',person:'Person',decision:'Decision',project:'Project',conversation:'Conversation',topic:'Topic',source:'Source',knowledge:'Knowledge',claim:'Claim',summary:'Summary'} as Record<string,string>)[value]||value||'Knowledge';
const TYPE_FILTERS=['all','memory','event','task','person','decision','project','conversation','knowledge'] as const;
type FilterType=typeof TYPE_FILTERS[number];
type ViewBox={x:number;y:number;w:number;h:number};
type LayoutNode=KnowledgeGraphNode&{x:number;y:number;degree:number;component:number};

function hash(value:string){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function unit(value:string){return (hash(value)%10000)/10000}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
function boundedView(next:ViewBox):ViewBox{
  const margin=130,{w,h}=next,minX=-margin,maxX=WORLD_W+margin-w,minY=-margin,maxY=WORLD_H+margin-h;
  const x=maxX<minX?(WORLD_W-w)/2:clamp(next.x,minX,maxX),y=maxY<minY?(WORLD_H-h)/2:clamp(next.y,minY,maxY);
  return{x,y,w,h};
}

function searchGraph(graph:KnowledgeGraph,query:string,type:FilterType,focusId:string):KnowledgeGraph{
  const q=query.trim().toLocaleLowerCase();
  const typeMatches=(node:KnowledgeGraphNode)=>type==='all'||String(node.node_type||node.knowledge_type).toLocaleLowerCase()===type;
  let direct=new Set(graph.nodes.filter(node=>typeMatches(node)&&(!q||[node.title,node.summary,node.content,node.topic,node.node_type,node.knowledge_type,node.project_ref,node.source_kind,...(node.tags||[])].join(' ').toLocaleLowerCase().includes(q))).map(node=>node.id));
  if(focusId)direct=new Set([focusId]);
  if(!direct.size)return {nodes:[],links:[]};
  const visible=new Set(direct);
  for(const link of graph.links)if(direct.has(link.from_knowledge_id)||direct.has(link.to_knowledge_id)){visible.add(link.from_knowledge_id);visible.add(link.to_knowledge_id)}
  const nodes=graph.nodes.filter(node=>visible.has(node.id)&&(type==='all'||focusId?true:typeMatches(node)||!direct.has(node.id)));
  const ids=new Set(nodes.map(node=>node.id));
  return {nodes,links:graph.links.filter(link=>ids.has(link.from_knowledge_id)&&ids.has(link.to_knowledge_id))};
}

function neuralMeshLayout(graph:KnowledgeGraph):LayoutNode[]{
  const ids=graph.nodes.map(n=>n.id), index=new Map(ids.map((id,i)=>[id,i]));
  const adjacency=ids.map(()=>[] as number[]), degree=new Array(ids.length).fill(0);
  for(const edge of graph.links){const a=index.get(edge.from_knowledge_id),b=index.get(edge.to_knowledge_id);if(a===undefined||b===undefined||a===b)continue;adjacency[a]!.push(b);adjacency[b]!.push(a);degree[a]++;degree[b]++}
  const component=new Array(ids.length).fill(-1), components:number[][]=[];
  for(let start=0;start<ids.length;start++){
    if(component[start]>=0)continue;const c=components.length, queue=[start], members:number[]=[];component[start]=c;
    while(queue.length){const i=queue.shift()!;members.push(i);for(const n of adjacency[i]!)if(component[n]<0){component[n]=c;queue.push(n)}}components.push(members);
  }
  const positions=ids.map((id,i)=>({x:WORLD_W/2+(unit(id+'x')-.5)*60,y:WORLD_H/2+(unit(id+'y')-.5)*60,vx:0,vy:0,component:component[i]!}));
  const golden=2.399963229728653;
  components.forEach((members,c)=>{
    const compAngle=c*golden, compRadius=c===0?0:Math.min(390,170+75*Math.sqrt(c));
    const cx=WORLD_W/2+Math.cos(compAngle)*compRadius,cy=WORLD_H/2+Math.sin(compAngle)*compRadius*.72;
    const root=members.slice().sort((a,b)=>{
      const ta=String(graph.nodes[a]?.node_type||graph.nodes[a]?.knowledge_type),tb=String(graph.nodes[b]?.node_type||graph.nodes[b]?.knowledge_type);
      const pa=ta==='project'?3:ta==='topic'?2:0,pb=tb==='project'?3:tb==='topic'?2:0;
      return pb-pa||degree[b]-degree[a]||ids[a]!.localeCompare(ids[b]!);
    })[0]!;
    const parent=new Map<number,number>(),depth=new Map<number,number>([[root,0]]),queue=[root],order=[root];
    while(queue.length){const current=queue.shift()!;for(const next of adjacency[current]!.slice().sort((a,b)=>degree[b]-degree[a]))if(!depth.has(next)){parent.set(next,current);depth.set(next,(depth.get(current)||0)+1);queue.push(next);order.push(next)}}
    for(const orphan of members)if(!depth.has(orphan)){depth.set(orphan,1);order.push(orphan)}
    positions[root]={...positions[root]!,x:cx,y:cy};
    const siblingCount=new Map<number,number>();
    for(const i of order.slice(1)){
      const p=parent.get(i)??root, d=depth.get(i)||1, sibling=siblingCount.get(p)||0;siblingCount.set(p,sibling+1);
      const pPos=positions[p]!, branchBase=Math.atan2(pPos.y-cy,pPos.x-cx)||unit(ids[p]+'angle')*Math.PI*2;
      const spread=.56+Math.min(.7,adjacency[p]!.length*.06),direction=branchBase+(sibling-(adjacency[p]!.length-1)/2)*spread+(unit(ids[i]+'j')-.5)*.28;
      const length=74+Math.min(95,d*12)+Math.min(42,degree[i]*4);
      positions[i]={...positions[i]!,x:pPos.x+Math.cos(direction)*length,y:pPos.y+Math.sin(direction)*length};
    }
  });

  // Deterministic force relaxation: connected nodes pull together, nearby nodes repel.
  for(let iteration=0;iteration<72;iteration++){
    const cool=1-iteration/90;
    for(const p of positions){p.vx*=.72;p.vy*=.72}
    for(const edge of graph.links){const ai=index.get(edge.from_knowledge_id),bi=index.get(edge.to_knowledge_id);if(ai===undefined||bi===undefined)continue;const a=positions[ai]!,b=positions[bi]!;let dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;const target=86+Math.min(46,(degree[ai]+degree[bi])*3),strength=.018*(.55+Number(edge.weight||.5));const force=(dist-target)*strength*cool;dx/=dist;dy/=dist;a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force}
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
      const a=positions[i]!,b=positions[j]!;let dx=b.x-a.x,dy=b.y-a.y,dist2=dx*dx+dy*dy;if(dist2>27000)continue;if(dist2<36){dx=(unit(ids[i]!+ids[j]!)-.5)*12||4;dy=(unit(ids[j]!+ids[i]!)-.5)*12||-4;dist2=dx*dx+dy*dy}const dist=Math.sqrt(dist2),push=(85/(dist2+70))*cool;dx/=dist;dy/=dist;a.vx-=dx*push;a.vy-=dy*push;b.vx+=dx*push;b.vy+=dy*push
    }
    for(let i=0;i<positions.length;i++){
      const p=positions[i]!,c=p.component,angle=c*golden,r=c===0?0:Math.min(390,170+75*Math.sqrt(c)),cx=WORLD_W/2+Math.cos(angle)*r,cy=WORLD_H/2+Math.sin(angle)*r*.72;
      p.vx+=(cx-p.x)*.0018*cool;p.vy+=(cy-p.y)*.0018*cool;p.x=clamp(p.x+p.vx,55,WORLD_W-55);p.y=clamp(p.y+p.vy,55,WORLD_H-55);
    }
  }
  return graph.nodes.map((node,i)=>({...node,x:positions[i]!.x,y:positions[i]!.y,degree:degree[i]!,component:component[i]!}));
}

function fitView(layout:LayoutNode[]):ViewBox{
  if(!layout.length)return{x:0,y:0,w:WORLD_W,h:WORLD_H};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const n of layout){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x);maxY=Math.max(maxY,n.y)}
  const pad=100, ratio=WORLD_W/WORLD_H;let w=Math.max(420,maxX-minX+pad*2),h=Math.max(300,maxY-minY+pad*2);if(w/h>ratio)h=w/ratio;else w=h*ratio;
  return{x:(minX+maxX)/2-w/2,y:(minY+maxY)/2-h/2,w,h};
}
function edgePath(a:LayoutNode,b:LayoutNode,id:string){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2,sign=unit(id+'bend')>.5?1:-1,bend=Math.min(44,len*.11)*(0.45+unit(id+'amount')*.7),cx=mx-dy/len*bend*sign,cy=my+dx/len*bend*sign;return`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}

export default function GraphPage(){
  const[graph,setGraph]=useState<KnowledgeGraph>({nodes:[],links:[]});
  const[selectedId,setSelectedId]=useState('');const[query,setQuery]=useState('');const[type,setType]=useState<FilterType>('all');const[focusId,setFocusId]=useState('');
  const[mode,setMode]=useState<'graph'|'list'>('graph');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const[view,setView]=useState<ViewBox>({x:0,y:0,w:WORLD_W,h:WORLD_H});const baseView=useRef<ViewBox>({x:0,y:0,w:WORLD_W,h:WORLD_H});
  const drag=useRef<{pointerId:number;cx:number;cy:number;scaleX:number;scaleY:number;view:ViewBox}|null>(null);
  const load=async()=>{setBusy(true);setError('');try{const data=await loadKnowledgeGraph();setGraph(data);setSelectedId(current=>data.nodes.some(node=>node.id===current)?current:(data.nodes[0]?.id||''));}catch(e:any){setError(String(e?.message||e))}finally{setBusy(false)}};
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>searchGraph(graph,query,type,focusId),[graph,query,type,focusId]);
  const layout=useMemo(()=>neuralMeshLayout(visible),[visible]);const positions=useMemo(()=>new Map(layout.map(node=>[node.id,node])),[layout]);
  useEffect(()=>{const fitted=fitView(layout);baseView.current=fitted;if(focusId){const n=layout.find(node=>node.id===focusId);if(n){const w=520,h=w*(WORLD_H/WORLD_W);setView(boundedView({x:n.x-w/2,y:n.y-h/2,w,h}));return}}setView(boundedView(fitted))},[layout,focusId]);
  const selected=graph.nodes.find(node=>node.id===selectedId)||visible.nodes[0]||null;
  const related=selected?graph.links.filter(link=>link.from_knowledge_id===selected.id||link.to_knowledge_id===selected.id):[];
  const relatedIds=new Set(related.flatMap(link=>[link.from_knowledge_id,link.to_knowledge_id]));
  const counts=useMemo(()=>graph.nodes.reduce<Record<string,number>>((acc,n)=>{const key=String(n.node_type||n.knowledge_type||'knowledge');acc[key]=(acc[key]||0)+1;return acc},{}),[graph]);
  const resetView=()=>setView(boundedView(baseView.current));
  const zoomAtWorld=(factor:number,anchorX:number,anchorY:number)=>setView(v=>{const w=clamp(v.w*factor,MIN_VIEW_W,MAX_VIEW_W),h=w*(WORLD_H/WORLD_W),ratio=w/v.w;return boundedView({x:anchorX-(anchorX-v.x)*ratio,y:anchorY-(anchorY-v.y)*ratio,w,h})});
  const zoomCenter=(factor:number)=>setView(v=>{const anchorX=v.x+v.w/2,anchorY=v.y+v.h/2,w=clamp(v.w*factor,MIN_VIEW_W,MAX_VIEW_W),h=w*(WORLD_H/WORLD_W),ratio=w/v.w;return boundedView({x:anchorX-(anchorX-v.x)*ratio,y:anchorY-(anchorY-v.y)*ratio,w,h})});
  const focusNode=(id:string)=>{const n=positions.get(id);if(!n)return;const w=520,h=w*(WORLD_H/WORLD_W);setView(boundedView({x:n.x-w/2,y:n.y-h/2,w,h}))};
  const zoomPercent=Math.round(baseView.current.w/view.w*100);

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Memory Graph</h1><p className="muted text-xs mt-1">Neural Mesh · ความจำ งาน นัด คน โปรเจกต์ และบทสนทนา</p></div><button className="btn px-3" onClick={()=>void load()} disabled={busy}><RefreshCw size={17} className={busy?'animate-spin':''}/></button></div>
    {error&&<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded-xl p-3">{error}</div>}
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 muted" size={18}/><input className="input pl-10" value={query} onChange={e=>{setQuery(e.target.value);setFocusId('')}} placeholder="ค้นเรื่อง / คน / โปรเจกต์ / source"/></div><button className="btn px-3" onClick={()=>setMode(mode==='graph'?'list':'graph')} title={mode==='graph'?'ดูแบบรายการ':'ดูแบบกราฟ'}>{mode==='graph'?<List size={18}/>:<Network size={18}/>}</button></div>
    <div className="graph-filter-row">{TYPE_FILTERS.map(value=><button key={value} onClick={()=>{setType(value);setFocusId('')}} className={'graph-filter '+(type===value?'graph-filter-active':'')}>{value==='all'?'ทั้งหมด':typeName(value)}{value!=='all'&&counts[value]?<span>{counts[value]}</span>:null}</button>)}</div>
    <div className="flex gap-2 flex-wrap"><span className="badge">Nodes {visible.nodes.length}</span><span className="badge">Links {visible.links.length}</span>{focusId&&<button className="badge accent" onClick={()=>setFocusId('')}>ออกจาก Focus</button>}</div>

    {mode==='graph'?<section className="card graph-shell graph-neural-shell overflow-hidden relative">
      <div className="graph-toolbar"><button onClick={()=>zoomCenter(.82)} title="Zoom in"><Plus size={16}/></button><button onClick={()=>zoomCenter(1.22)} title="Zoom out"><Minus size={16}/></button><button onClick={resetView} title="Fit view"><RotateCcw size={16}/></button></div>
      {layout.length?<svg className="graph-canvas graph-interactive" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Ceo Memory Neural Graph"
        onWheel={e=>{e.preventDefault();const svg=e.currentTarget,ctm=svg.getScreenCTM();if(!ctm)return;const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const world=point.matrixTransform(ctm.inverse());zoomAtWorld(e.deltaY>0?1.12:.88,world.x,world.y)}}
        onPointerDown={e=>{if((e.target as Element).closest('.graph-node'))return;const ctm=e.currentTarget.getScreenCTM();if(!ctm)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointerId:e.pointerId,cx:e.clientX,cy:e.clientY,scaleX:Math.max(.0001,Math.abs(ctm.a)),scaleY:Math.max(.0001,Math.abs(ctm.d)),view:{...view}}}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;const dx=(e.clientX-d.cx)/d.scaleX,dy=(e.clientY-d.cy)/d.scaleY;setView(boundedView({...d.view,x:d.view.x-dx,y:d.view.y-dy}))}}
        onPointerUp={e=>{if(drag.current?.pointerId===e.pointerId)drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
        <defs><filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <g className="graph-fibers">{visible.links.map(link=>{const a=positions.get(link.from_knowledge_id),b=positions.get(link.to_knowledge_id);if(!a||!b)return null;const active=Boolean(selectedId&&(link.from_knowledge_id===selectedId||link.to_knowledge_id===selectedId)),d=edgePath(a,b,link.id);return <g key={link.id}><path d={d} className="graph-edge-halo" vectorEffect="non-scaling-stroke"/><path d={d} className={active?'graph-edge graph-edge-active':'graph-edge'} strokeWidth={.65+Math.max(0,Math.min(1,Number(link.weight||0)))*1.5} vectorEffect="non-scaling-stroke"/></g>})}</g>
        <g>{layout.map(node=>{const active=node.id===selectedId,neighbor=relatedIds.has(node.id),kind=String(node.node_type||node.knowledge_type||'knowledge').toLowerCase(),r=7+Math.min(13,Math.sqrt(node.degree+1)*3.2)+(kind==='project'?5:kind==='topic'?2:0);return <g key={node.id} className="graph-node" role="button" tabIndex={0} aria-label={node.title||'Node'} onClick={()=>setSelectedId(node.id)} onDoubleClick={()=>{setSelectedId(node.id);setFocusId(node.id);setTimeout(()=>focusNode(node.id),0)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedId(node.id)}}}>
          <circle cx={node.x} cy={node.y} r={r+7} className={`graph-node-halo ${active?'graph-node-halo-active':neighbor?'graph-node-halo-related':''}`}/>
          <circle cx={node.x} cy={node.y} r={r} filter={active?'url(#nodeGlow)':undefined} className={`graph-dot graph-dot-${kind} ${active?'graph-dot-active':neighbor?'graph-dot-related':''}`}/>
          <circle cx={node.x-r*.22} cy={node.y-r*.22} r={Math.max(1.4,r*.18)} className="graph-node-core"/>
          <text x={node.x} y={node.y+r+15} textAnchor="middle" className="graph-label">{short(node.title||node.topic||typeName(kind),20)}</text>
        </g>})}</g>
      </svg>:<div className="p-8 text-center muted text-sm">{busy?'กำลังโหลด Graph…':query?'ไม่พบโหนดที่ตรงกับคำค้น':'ยังไม่มี Memory Graph'}</div>}
      <div className="graph-zoom-readout">{zoomPercent}%</div><div className="graph-hint">Scroll = Zoom · Drag = Pan · Double click = Focus</div>
    </section>:<section className="space-y-2">{visible.nodes.map(n=><button key={n.id} className={'card p-4 w-full text-left '+(n.id===selectedId?'graph-list-active':'')} onClick={()=>{setSelectedId(n.id);setMode('graph')}}><div className="flex items-center gap-2"><span className={'graph-type-pill type-'+String(n.node_type||n.knowledge_type)}>{typeName(String(n.node_type||n.knowledge_type))}</span><div className="font-semibold">{n.title||n.topic||'Node'}</div></div><div className="muted text-xs mt-1">{n.project_ref||n.topic||n.source_kind||''}</div>{(n.summary||n.content)&&<p className="text-sm mt-2 text-[#c7ccda] line-clamp-2">{n.summary||n.content}</p>}</button>)}{!visible.nodes.length&&<div className="card p-6 text-center muted text-sm">ไม่พบโหนด</div>}</section>}

    {selected&&<section className="card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex gap-2 items-center flex-wrap"><span className={'graph-type-pill type-'+String(selected.node_type||selected.knowledge_type)}>{typeName(String(selected.node_type||selected.knowledge_type))}</span><div className="font-semibold text-lg">{selected.title||selected.topic||'Node'}</div></div><div className="muted text-xs mt-2">{selected.project_ref?`Project · ${selected.project_ref}`:selected.topic?`Topic · ${selected.topic}`:''}{selected.source_kind?` · Source ${selected.source_kind}`:''}</div></div><Share2 className="accent shrink-0" size={20}/></div>
      {(selected.content||selected.summary)&&<p className="text-sm leading-6 text-[#c7ccda] mt-3 whitespace-pre-wrap">{selected.content||selected.summary}</p>}
      <div className="graph-detail-grid mt-3"><div><span>อยู่ที่</span><b>{selected.reference_path||'Ceo Knowledge Cloud'}</b></div>{selected.event_at&&<div><span>วันเวลา</span><b>{new Date(selected.event_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</b></div>}<div><span>ความสัมพันธ์</span><b>{related.length} โหนด</b></div>{selected.importance!==undefined&&<div><span>ความสำคัญ</span><b>{selected.importance}/3</b></div>}</div>
      <div className="flex gap-2 mt-3 flex-wrap">{(selected.tags||[]).slice(0,8).map(tag=><span className="badge" key={tag}>{tag}</span>)}<button className="badge accent" onClick={()=>{setFocusId(selected.id);setTimeout(()=>focusNode(selected.id),0)}}><Focus size={13}/> โฟกัสโหนดนี้</button></div>
      {related.length>0&&<div className="mt-4 pt-3 border-t border-[#262c3a] space-y-2"><div className="muted text-xs">โหนดที่เชื่อมโยง</div>{related.slice(0,18).map(link=>{const otherId=link.from_knowledge_id===selected.id?link.to_knowledge_id:link.from_knowledge_id;const other=graph.nodes.find(node=>node.id===otherId);return <button key={link.id} onClick={()=>{setSelectedId(otherId);focusNode(otherId)}} className="w-full flex items-center justify-between gap-3 text-left py-1.5"><span className="text-sm">{other?.title||otherId}</span><span className="badge">{link.relation} · {Math.round(Number(link.weight||0)*100)}%</span></button>})}</div>}
    </section>}
  </div>;
}
