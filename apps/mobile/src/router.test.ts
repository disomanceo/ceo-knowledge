import { describe,expect,it } from 'vitest';
import { DEFAULT_ROUTER_PREFERENCES, loadRouterPreferences, normalizeRouterPreferences, routerRequest, saveRouterPreferences } from './router';

describe('AI Router preferences',()=>{
  it('defaults to AUTO',()=>{expect(normalizeRouterPreferences(null)).toEqual(DEFAULT_ROUTER_PREFERENCES)});
  it('forces provider/model consistently',()=>{
    expect(normalizeRouterPreferences({mode:'provider',provider:'claude'})).toMatchObject({mode:'provider',provider:'claude'});
    expect(normalizeRouterPreferences({mode:'model',provider:'auto',primaryModel:'gemini-test'})).toMatchObject({mode:'model',provider:'gemini',primaryModel:'gemini-test'});
    expect(routerRequest({mode:'provider',provider:'gemini',primaryModel:'x',backgroundModel:'lite'})).toEqual({mode:'provider',provider:'gemini',model:'',backgroundModel:'lite'});
    expect(routerRequest({mode:'model',provider:'gemini',primaryModel:'x',backgroundModel:'lite'})).toEqual({mode:'model',provider:'gemini',model:'x',backgroundModel:'lite'});
  });
  it('persists locally',()=>{const m=new Map<string,string>(),s={getItem:(k:string)=>m.get(k)||null,setItem:(k:string,v:string)=>void m.set(k,v)};saveRouterPreferences({mode:'model',provider:'ollama',primaryModel:'qwen3:4b',backgroundModel:'qwen3:4b'},s);expect(loadRouterPreferences(s).primaryModel).toBe('qwen3:4b')});
});
