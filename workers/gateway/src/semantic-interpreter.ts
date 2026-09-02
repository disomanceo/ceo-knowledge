import { recallAnswerField, recallSubjectQuery, type RecallAnswerField } from './chat';
import { detectChatIntent, isQuestionLike } from './chat-intelligence';
import { deriveConversationStateV3 } from './conversation-state-v3';
import { needsAiContextResolution, resolveConversationContext, type RecentContextTurn } from './context-resolver';
import type { Env } from './supabase';

const clean=(v:unknown,max=1800)=>String(v??'').replace(/\u0000/g,'').replace(/\s+/g,' ').trim().slice(0,max);
export type SemanticRelation='NEW_TOPIC'|'FOLLOW_UP'|'ENTITY_SWITCH'|'FIELD_FOLLOW_UP'|'CORRECTION'|'UPDATE'|'SAVE'|'CONFIRMATION';
export interface SemanticFrame{
  original:string;
  standaloneQuery:string;
  topic:string;
  relation:SemanticRelation;
  intent:string;
  requestedField:RecallAnswerField;
  usePriorContext:boolean;
  activeSourceId:string;
  confidence:number;
  ambiguous:boolean;
  aiRequired:boolean;
  aiUsed:boolean;
  interpreterSource:string;
  estimatedInputTokens:number;
  reason:string;
}

function compactTurns(turns:RecentContextTurn[]):RecentContextTurn[]{return (Array.isArray(turns)?turns:[]).slice(-4).map(turn=>({role:clean(turn.role,20),text:clean(turn.text,360),sourceId:clean(turn.sourceId,160),query:clean(turn.query,500)})).filter(turn=>turn.text)}
function tokenEstimate(text:string){return Math.ceil(clean(text,12000).length/3.2)}

export async function interpretSemanticContext(env:Env,message:string,recentContext:RecentContextTurn[],options:{model?:string}={}):Promise<SemanticFrame>{
  const text=clean(message,1200),turns=compactTurns(recentContext),state=deriveConversationStateV3(text,turns),field=recallAnswerField(text),subject=recallSubjectQuery(text);
  const deterministicNewTopic=state.mode==='NEW_TOPIC'&&field!=='general'&&subject.length>=2;
  const ambiguous=needsAiContextResolution(text,turns)||state.mode!=='NEW_TOPIC'||(!isQuestionLike(text)&&text.length<80);
  const aiRequired=!deterministicNewTopic&&ambiguous;
  if(!aiRequired){
    return{original:text,standaloneQuery:text,topic:subject||text,relation:state.mode as SemanticRelation,intent:detectChatIntent(text).kind,requestedField:field,usePriorContext:false,activeSourceId:'',confidence:.98,ambiguous:false,aiRequired:false,aiUsed:false,interpreterSource:'deterministic',estimatedInputTokens:tokenEstimate(text),reason:'CLEAR_STANDALONE'};
  }
  const resolution=await resolveConversationContext(env,text,turns,{model:clean(options.model,120)});
  return{original:text,standaloneQuery:clean(resolution.resolvedQuery,1200)||text,topic:clean(resolution.subject,400)||subject||state.topic,relation:state.mode as SemanticRelation,intent:resolution.intent||detectChatIntent(resolution.resolvedQuery).kind,requestedField:resolution.answerField||field,usePriorContext:resolution.dependsOnPriorContext,activeSourceId:resolution.dependsOnPriorContext?state.activeSourceId:'',confidence:resolution.confidence,ambiguous:resolution.ambiguous,aiRequired:true,aiUsed:resolution.usedAI,interpreterSource:resolution.source,estimatedInputTokens:tokenEstimate(text+' '+turns.map(t=>`${t.role}:${t.query||t.text}`).join(' ')),reason:resolution.reason};
}
