import { rest, type Env } from './supabase';

const clean=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const qs=(params:Record<string,string|number|undefined|null>)=>{const q=new URLSearchParams();for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')q.set(k,String(v));const s=q.toString();return s?'?'+s:''};

export async function insertRuntimeJob(env:Env, token:string, payload:any) {
  const key=clean(payload?.idempotency_key,200);
  try {
    const rows=await rest<any[]>(env,token,'runtime_jobs?select=*',{method:'POST',body:payload,prefer:'return=representation'});
    return rows[0]||null;
  } catch(error:any) {
    const conflict=Number(error?.status)===409||String(error?.detail?.code||'')==='23505';
    if(!conflict||!key)throw error;
    const rows=await rest<any[]>(env,token,'runtime_jobs'+qs({select:'*',idempotency_key:'eq.'+key,limit:1}));
    return rows[0]||null;
  }
}
