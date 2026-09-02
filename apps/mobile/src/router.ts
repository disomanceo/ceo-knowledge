export type RouterMode='auto'|'provider'|'model';
export type RouterProvider='auto'|'gemini'|'openai'|'claude'|'ollama';
export interface RouterPreferences{
  mode:RouterMode;
  provider:RouterProvider;
  primaryModel:string;
  backgroundModel:string;
}

export const ROUTER_PREFS_KEY='ceo-ai-router-preferences-v1';
export const DEFAULT_ROUTER_PREFERENCES:RouterPreferences={mode:'auto',provider:'auto',primaryModel:'',backgroundModel:''};

const modes=new Set<RouterMode>(['auto','provider','model']);
const providers=new Set<RouterProvider>(['auto','gemini','openai','claude','ollama']);
const clean=(value:unknown,max=120)=>String(value??'').trim().slice(0,max);

export function normalizeRouterPreferences(value:unknown):RouterPreferences{
  const source=value&&typeof value==='object'?value as Partial<RouterPreferences>:{};
  const mode=modes.has(source.mode as RouterMode)?source.mode as RouterMode:'auto';
  let provider=providers.has(source.provider as RouterProvider)?source.provider as RouterProvider:'auto';
  if(mode==='auto')provider='auto';
  if(mode==='model'&&provider==='auto')provider='gemini';
  return{mode,provider,primaryModel:clean(source.primaryModel),backgroundModel:clean(source.backgroundModel)};
}

export function loadRouterPreferences(storage?:Pick<Storage,'getItem'>|null):RouterPreferences{
  try{const target=storage??(typeof window!=='undefined'?window.localStorage:null),raw=target?.getItem(ROUTER_PREFS_KEY);return raw?normalizeRouterPreferences(JSON.parse(raw)):{...DEFAULT_ROUTER_PREFERENCES}}catch{return{...DEFAULT_ROUTER_PREFERENCES}}
}

export function saveRouterPreferences(value:RouterPreferences,storage?:Pick<Storage,'setItem'>|null){
  try{const target=storage??(typeof window!=='undefined'?window.localStorage:null);target?.setItem(ROUTER_PREFS_KEY,JSON.stringify(normalizeRouterPreferences(value)))}catch{}
}

export function routerRequest(value:RouterPreferences){
  const prefs=normalizeRouterPreferences(value);
  return{mode:prefs.mode,provider:prefs.mode==='auto'?'auto':prefs.provider,model:prefs.mode==='model'?prefs.primaryModel:'',backgroundModel:prefs.backgroundModel};
}

export const MODEL_SUGGESTIONS:Record<Exclude<RouterProvider,'auto'>,string[]>={
  gemini:['gemini-3.6-flash','gemini-3.5-flash-lite','gemini-2.5-flash'],
  openai:['gpt-5.6','gpt-5-mini'],
  claude:['claude-sonnet-5','claude-haiku-4.5'],
  ollama:['qwen3:4b','qwen2.5-coder:7b','qwen2.5vl:3b'],
};
