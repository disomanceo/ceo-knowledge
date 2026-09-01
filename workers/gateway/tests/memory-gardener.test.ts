import { afterEach, describe, expect, it, vi } from 'vitest';
import { memorySimilarity, planMemoryMaintenance, applyMemoryMaintenance } from '../src/memory-gardener';

const env:any={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public'};
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

describe('Memory Gardener',()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it('detects semantically-near duplicate Thai memories',()=>{
    expect(memorySimilarity('14 กันยายน 2569 ประเมิน PA ครู โรงเรียนวัดบางจิก','วันที่ 14 กันยายน 2569 ประเมิน PA ครูที่โรงเรียนวัดบางจิก')).toBeGreaterThan(.68);
    expect(memorySimilarity('ส่งเล่ม PA สำนักงานเขต','ซื้ออาหารกลางวันนักเรียน')).toBeLessThan(.5);
  });

  it('prefers pinned canonical and proposes safe tier/archive actions',async()=>{
    const old=new Date(Date.now()-220*86400000).toISOString();
    vi.stubGlobal('fetch',async(input:any)=>{const url=String(input);if(url.includes('/rest/v1/memory_nodes?'))return json([
      {node_id:'mem_pin12345678',node_type:'memory',title:'14 กันยายน ประเมิน PA ครู โรงเรียนวัดบางจิก',content:'14 กันยายน 2569 ประเมิน PA ครู โรงเรียนวัดบางจิก',importance:3,retention_policy:'permanent',tier:'pinned',source_refs:['a'],metadata:{pinned:true},event_at:'2026-09-14T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
      {node_id:'mem_dup12345678',node_type:'memory',title:'วันที่ 14 กันยายน ประเมิน PA ครูที่โรงเรียนวัดบางจิก',content:'วันที่ 14 กันยายน 2569 ประเมิน PA ครูที่โรงเรียนวัดบางจิก',importance:2,retention_policy:'standard',tier:'hot',source_refs:['b'],metadata:{},event_at:'2026-09-14T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
      {node_id:'mem_old12345678',node_type:'memory',title:'บันทึกเก่า',content:'ข้อมูลเก่าที่ไม่สำคัญมากและไม่มีการใช้งานมานาน',importance:1,retention_policy:'standard',tier:'hot',source_refs:[],metadata:{},event_at:null,updated_at:old},
      {node_id:'mem_tmp12345678',node_type:'memory',title:'ข้อมูลชั่วคราว',content:'ข้อมูลชั่วคราวสำหรับทดสอบระบบที่หมดอายุแล้ว',importance:1,retention_policy:'temporary',tier:'warm',source_refs:[],metadata:{},event_at:null,updated_at:old},
    ]);throw new Error('unexpected '+url)});
    const plan=await planMemoryMaintenance(env,'token',{limit:100});
    expect(plan.duplicateGroups).toHaveLength(1);
    expect(plan.duplicateGroups[0]?.canonicalId).toBe('mem_pin12345678');
    expect(plan.duplicateGroups[0]?.duplicateIds).toContain('mem_dup12345678');
    expect(plan.tierActions.some(x=>x.nodeId==='mem_old12345678'&&x.to==='cold')).toBe(true);
    expect(plan.archiveActions.some(x=>x.nodeId==='mem_tmp12345678')).toBe(true);
  });

  it('applies only safe governance actions through memory_node_manage',async()=>{
    const calls:any[]=[];
    vi.stubGlobal('fetch',async(input:any,init:any={})=>{const url=String(input),method=String(init.method||'GET').toUpperCase();let body:any={};try{body=init.body?JSON.parse(String(init.body)):{} }catch{};calls.push({url,method,body});
      if(url.includes('/rest/v1/memory_nodes?'))return json([
        {node_id:'mem_can12345678',node_type:'memory',title:'ส่งเล่ม PA วันที่ 17 กันยายน',content:'วันที่ 17 กันยายน 2569 ต้องส่งเล่ม PA ให้สำนักงานเขต',importance:3,retention_policy:'standard',tier:'hot',source_refs:['a'],metadata:{},event_at:'2026-09-17T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
        {node_id:'mem_dup22345678',node_type:'memory',title:'วันที่ 17 กันยายน ต้องส่งเล่ม PA',content:'วันที่ 17 กันยายน 2569 ต้องส่งเล่ม PA ให้สำนักงานเขต',importance:2,retention_policy:'standard',tier:'hot',source_refs:['b'],metadata:{},event_at:'2026-09-17T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'},
      ]);
      if(url.endsWith('/rest/v1/rpc/memory_node_manage')&&method==='POST')return json({nodeId:body.p_node_id,metadata:{}});
      if(url.includes('/rest/v1/memory_maintenance_runs?')&&method==='POST')return new Response('',{status:201});
      throw new Error('unexpected '+method+' '+url);
    });
    const result=await applyMemoryMaintenance(env,'token',{limit:50,maxActions:10});
    expect(result.result.appliedCount).toBeGreaterThanOrEqual(2);
    const manage=calls.filter(x=>x.url.endsWith('/rest/v1/rpc/memory_node_manage'));
    expect(manage.some(x=>x.body.p_action==='mark_canonical'&&x.body.p_node_id==='mem_can12345678')).toBe(true);
    expect(manage.some(x=>x.body.p_action==='link_duplicate'&&x.body.p_node_id==='mem_dup22345678')).toBe(true);
  });
});
