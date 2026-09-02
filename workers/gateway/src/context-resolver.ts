import { recallAnswerField, recallSubjectQuery, type RecallAnswerField } from './chat';
import { detectChatIntent, isQuestionLike } from './chat-intelligence';
import { resolveCloudContext, type CloudContextResolution } from './cloud-ai';
import type { Env } from './supabase';

const clean=(value:unknown,max=4000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export type RecentContextTurn={role:string;text:string;sourceId?:string;query?:string};
export type ConversationState={
  recentTurns:RecentContextTurn[];
  previousUserQuery:string;
  previousResolvedQuery:string;
  previousAssistantText:string;
  previousSourceId:string;
};

export type ContextResolution={
  attempted:boolean;
  usedAI:boolean;
  source:'deterministic'|'gemini'|'openai-compatible'|'none';
  confidence:number;
  ambiguous:boolean;
  resolvedQuery:string;
  subject:string;
  intent:string;
  answerField:RecallAnswerField;
  dependsOnPriorContext:boolean;
  reason:string;
  clarificationRequired:boolean;
};

const FOLLOWUP_PREFIX=/^(?:แล้ว(?:ก็)?|แล้วอันนั้น|แล้วเรื่องนั้น|อันนั้น|เรื่องนั้น|ตัวนั้น|อันนี้|เรื่องนี้|มัน|เขา|อีกอัน|อีกเรื่อง|ส่วน(?:อัน|เรื่อง|คน|ที่)นั้น)\b|^(?:แล้ว)?\s*(?:วันที่|วัน)?\s*\d{1,2}(?:\s|$)/iu;
const FOLLOWUP_SUFFIX=/(?:ล่ะ|ละ|ด้วย|อีกล่ะ|อีกไหม|อันนั้น|เรื่องนั้น)(?:ครับ|คะ|ค่ะ|นะ)?\s*[?？]?$/iu;
const REFERENCE_WORD=/(?:อันนั้น|เรื่องนั้น|ตัวนั้น|อันนี้|เรื่องนี้|มัน|เขา|ที่ว่า|เมื่อกี้|ก่อนหน้านี้)/iu;
const DATE_ONLY=/^(?:แล้ว\s*)?(?:วันที่|วัน)?\s*\d{1,2}(?:\s*(?:ก\.?ย\.?|ก\.ย\.|กันยายน|นี้|ล่ะ|ละ|ครับ|คะ|ค่ะ|นะ))*\s*[?？]?$/iu;

export function buildConversationState(recentContext:RecentContextTurn[]):ConversationState{
  const turns=(Array.isArray(recentContext)?recentContext:[]).slice(-8).map(turn=>({
    role:clean(turn?.role,20),text:clean(turn?.text,1200),sourceId:clean(turn?.sourceId,200),query:clean(turn?.query,1200),
  })).filter(turn=>turn.text);
  const priorUsers=turns.filter(turn=>turn.role==='user');
  const priorAssistants=turns.filter(turn=>turn.role==='ceo'||turn.role==='assistant');
  const lastUser=priorUsers.at(-1),lastAssistant=priorAssistants.at(-1);
  return{
    recentTurns:turns,
    previousUserQuery:clean(lastUser?.text,1200),
    previousResolvedQuery:clean(lastAssistant?.query||lastUser?.query,1200),
    previousAssistantText:clean(lastAssistant?.text,1200),
    previousSourceId:clean(lastAssistant?.sourceId,200),
  };
}

export function needsAiContextResolution(message:string,recentContext:RecentContextTurn[]):boolean{
  const text=clean(message,1200),state=buildConversationState(recentContext);
  if(!text||!state.recentTurns.length)return false;
  const subject=recallSubjectQuery(text),field=recallAnswerField(text);
  const short=text.length<=36;
  const bareField=field!=='general'&&subject.length<2;
  const followup=FOLLOWUP_PREFIX.test(text)||FOLLOWUP_SUFFIX.test(text)||REFERENCE_WORD.test(text);
  const fragment=!isQuestionLike(text)&&short&&/(?:ด้วย|ล่ะ|ละ|อีก|อันนั้น|เรื่องนั้น)$/u.test(text.replace(/[?？]|ครับ|คะ|ค่ะ|นะ/g,''));
  return bareField||followup||(DATE_ONLY.test(text)&&Boolean(state.previousUserQuery))||fragment;
}

function priorTopicQuery(state:ConversationState):string{
  const prior=state.previousResolvedQuery||state.previousUserQuery;
  return clean(prior,1200);
}

function deterministicResolution(message:string,recentContext:RecentContextTurn[]):ContextResolution{
  const text=clean(message,1200),state=buildConversationState(recentContext),field=recallAnswerField(text);
  const ambiguous=needsAiContextResolution(text,recentContext);
  let resolvedQuery=text,depends=false,reason=ambiguous?'AMBIGUOUS_FOLLOWUP':'CLEAR_MESSAGE';
  if(field!=='general'&&recallSubjectQuery(text).length<2){
    const prior=priorTopicQuery(state);
    if(prior){resolvedQuery=prior;depends=true;reason='BARE_FIELD_PRIOR_QUERY';}
  }else if(DATE_ONLY.test(text)){
    const prior=priorTopicQuery(state),subject=recallSubjectQuery(prior);
    if(subject.length>=2){resolvedQuery=`${subject} ${text}`.replace(/\s+/g,' ').trim();depends=true;reason='DATE_FOLLOWUP_PRIOR_TOPIC';}
  }
  const intent=detectChatIntent(resolvedQuery).kind;
  return{attempted:false,usedAI:false,source:'deterministic',confidence:ambiguous?(depends?0.82:0.45):1,ambiguous,resolvedQuery,subject:recallSubjectQuery(resolvedQuery),intent,answerField:field,dependsOnPriorContext:depends,reason,clarificationRequired:false};
}

function safeCloudResolution(base:ContextResolution,cloud:CloudContextResolution):ContextResolution{
  if(!cloud.ok||!cloud.data)return{...base,attempted:true,reason:cloud.reason||'CONTEXT_AI_UNAVAILABLE',clarificationRequired:base.ambiguous&&base.confidence<0.6};
  const data=cloud.data;
  const confidence=Math.max(0,Math.min(1,Number(data.confidence)||0));
  const resolvedQuery=clean(data.resolvedQuery,1200)||base.resolvedQuery;
  const allowedFields=new Set<RecallAnswerField>(['date','time','location','person','status','general']);
  const answerField=allowedFields.has(data.answerField as RecallAnswerField)?data.answerField as RecallAnswerField:base.answerField;
  const allowedIntent=new Set(['recall','date','temporal','today','tasks','live','general','unknown']);
  const intent=allowedIntent.has(clean(data.intent,30))?clean(data.intent,30):detectChatIntent(resolvedQuery).kind;
  return{
    attempted:true,usedAI:true,source:cloud.provider,confidence,ambiguous:true,resolvedQuery,
    subject:clean(data.subject,300)||recallSubjectQuery(resolvedQuery),intent,answerField,
    dependsOnPriorContext:data.dependsOnPriorContext===true,
    reason:'AI_CONTEXT_RESOLVED',clarificationRequired:confidence<0.6,
  };
}

const ANCHOR_STOP=new Set(['วันไหน','วันที่','ที่ไหน','กี่โมง','อะไร','อะไรบ้าง','ใคร','ครับ','ค่ะ','คะ','นะ','ล่ะ','ละ','แล้ว','ด้วย','เรื่อง','อันนั้น','เรื่องนั้น']);
function anchorTokens(value:string):string[]{
  return [...new Set(clean(value,3000).toLocaleLowerCase()
    .replace(/(ประเมิน|นิเทศ|โรงเรียน|วัด|ครู|ผอ\.?|งาน|เลี้ยง|เกษียณ|ประชุม|อบรม|รับทุน|ส่งเล่ม|วันที่|วันไหน|ที่ไหน|กี่โมง)/gu,' $1 ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').split(/\s+/).filter(token=>token.length>=2&&!ANCHOR_STOP.has(token)))];
}
function contextAnchorSupport(message:string,state:ConversationState,resolution:ContextResolution):number{
  const source=clean([message,...state.recentTurns.flatMap(turn=>[turn.text,turn.query||''])].join(' '),12_000).toLocaleLowerCase();
  const tokens=anchorTokens(resolution.subject||resolution.resolvedQuery);
  if(!tokens.length)return 1;
  const supported=tokens.filter(token=>source.includes(token)).length;
  return supported/tokens.length;
}

export async function resolveConversationContext(env:Env,message:string,recentContext:RecentContextTurn[],options:{model?:string}={}):Promise<ContextResolution>{
  const base=deterministicResolution(message,recentContext);
  if(!base.ambiguous)return base;
  const state=buildConversationState(recentContext);
  const cloud=await resolveCloudContext(env,{
    message:clean(message,1200),
    recentTurns:state.recentTurns.map(turn=>({role:turn.role,text:turn.text,resolvedQuery:turn.query||'',sourceId:turn.sourceId||''})),
  },{model:clean(options.model,120)}).catch(()=>({ok:false,provider:'none' as const,model:'',reason:'CONTEXT_AI_REQUEST_FAILED',data:null}));
  const resolved=safeCloudResolution(base,cloud);
  if(resolved.usedAI){
    const support=contextAnchorSupport(message,state,resolved);
    if(support<0.45)return{...resolved,confidence:Math.min(resolved.confidence,0.55),reason:'AI_CONTEXT_UNSUPPORTED',clarificationRequired:true};
  }
  return resolved;
}

export function contextResolutionPublic(result:ContextResolution){
  return{
    attempted:result.attempted,usedAI:result.usedAI,source:result.source,confidence:Math.round(result.confidence*100)/100,
    resolvedQuery:result.resolvedQuery,intent:result.intent,answerField:result.answerField,dependsOnPriorContext:result.dependsOnPriorContext,
    reason:result.reason,
  };
}

export function isContextualQuestion(message:string,resolution:ContextResolution):boolean{
  if(isQuestionLike(message))return true;
  return resolution.usedAI&&resolution.dependsOnPriorContext&&['recall','date','temporal','today','tasks','live'].includes(resolution.intent);
}
