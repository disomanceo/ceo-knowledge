export type VoiceMode = 'off' | 'manual' | 'auto' | 'smart';

export interface VoicePreferences {
  mode: VoiceMode;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI: string;
}

export const VOICE_PREFS_KEY = 'ceo-voice-preferences-v1';
export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  mode: 'manual',
  lang: 'th-TH',
  rate: 1,
  pitch: 1,
  volume: 1,
  voiceURI: '',
};

const MODES = new Set<VoiceMode>(['off','manual','auto','smart']);
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,Number.isFinite(value)?value:min));

export function normalizeVoicePreferences(value: unknown): VoicePreferences {
  const source = value && typeof value === 'object' ? value as Partial<VoicePreferences> : {};
  const mode = MODES.has(source.mode as VoiceMode) ? source.mode as VoiceMode : DEFAULT_VOICE_PREFERENCES.mode;
  return {
    mode,
    lang: String(source.lang || DEFAULT_VOICE_PREFERENCES.lang).slice(0,20),
    rate: clamp(Number(source.rate ?? DEFAULT_VOICE_PREFERENCES.rate),0.6,1.6),
    pitch: clamp(Number(source.pitch ?? DEFAULT_VOICE_PREFERENCES.pitch),0.5,1.5),
    volume: clamp(Number(source.volume ?? DEFAULT_VOICE_PREFERENCES.volume),0,1),
    voiceURI: String(source.voiceURI || '').slice(0,300),
  };
}

export function loadVoicePreferences(storage?: Pick<Storage,'getItem'> | null): VoicePreferences {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    const raw = target?.getItem(VOICE_PREFS_KEY);
    return raw ? normalizeVoicePreferences(JSON.parse(raw)) : {...DEFAULT_VOICE_PREFERENCES};
  } catch { return {...DEFAULT_VOICE_PREFERENCES}; }
}

export function saveVoicePreferences(preferences: VoicePreferences, storage?: Pick<Storage,'setItem'> | null) {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    target?.setItem(VOICE_PREFS_KEY,JSON.stringify(normalizeVoicePreferences(preferences)));
  } catch {}
}

export function speechSynthesisSupported(scope: any = typeof window !== 'undefined' ? window : undefined): boolean {
  return Boolean(scope?.speechSynthesis && scope?.SpeechSynthesisUtterance);
}

const replacements: Array<[RegExp,string]> = [
  [/\bAPI\b/gi,'เอพีไอ'],[/\bMCP\b/gi,'เอ็มซีพี'],[/\bPA\b/g,'พีเอ'],[/\bAI\b/gi,'เอไอ'],
  [/\bCeo\b/gi,'ซีอีโอ'],[/\bGemini\b/gi,'เจมิไน'],[/\bSupabase\b/gi,'ซูพาเบส'],[/\bOllama\b/gi,'โอลามา'],
];

export function normalizeSpeechText(input: string): string {
  let text=String(input||'').normalize('NFC');
  text=text.replace(/```[\s\S]*?```/g,' รายละเอียดโค้ดอยู่บนหน้าจอ ')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/https?:\/\/\S+/gi,' ลิงก์อยู่บนหน้าจอ ')
    .replace(/^\s*(?:Ceo\s*:\s*)/gim,'')
    .replace(/^[•*-]\s+/gm,'')
    .replace(/[│├└─]+/g,' ')
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g,(_m,h,m)=>`${Number(h)} นาฬิกา ${Number(m) ? Number(m)+' นาที' : ''}`)
    .replace(/\s+/g,' ').trim();
  for(const [pattern,replacement] of replacements)text=text.replace(pattern,replacement);
  return text.replace(/\s+([,.!?])/g,'$1').trim();
}

export function smartSpeechText(input: string, maxChars = 420): string {
  const original=String(input||'').trim();
  if(!original)return'';
  const technical=/```|\b(?:npm|git|commit|push|build|test|typecheck|HTTP|JSON|TypeScript|JavaScript)\b/i.test(original);
  const normalized=normalizeSpeechText(original);
  if(!normalized)return'';
  if(technical && normalized.length>260)return 'ดำเนินการด้านเทคนิคแล้วครับ รายละเอียดอยู่บนหน้าจอ';
  if(normalized.length<=maxChars)return normalized;
  const sentences=normalized.split(/(?<=[.!?]|ครับ|ค่ะ|คะ)\s+/).filter(Boolean);
  let summary='';
  for(const sentence of sentences){if((summary+' '+sentence).trim().length>maxChars-55)break;summary=(summary+' '+sentence).trim();if(summary.length>180&&sentences.indexOf(sentence)>=1)break;}
  if(!summary)summary=normalized.slice(0,maxChars-60).trim();
  return `${summary} มีรายละเอียดเพิ่มเติมบนหน้าจอครับ`;
}

export function speechTextForMode(input:string,mode:VoiceMode):string {
  if(mode==='off'||mode==='manual')return'';
  return mode==='smart'?smartSpeechText(input):normalizeSpeechText(input);
}

export function splitSpeechText(input:string,maxChars=240):string[] {
  const text=String(input||'').trim();if(!text)return[];
  const sentences=text.split(/(?<=[.!?]|ครับ|ค่ะ|คะ)\s+/).filter(Boolean),out:string[]=[];
  for(const sentence of sentences){
    if(sentence.length<=maxChars){out.push(sentence);continue;}
    const words=sentence.split(/\s+/);let part='';
    for(const word of words){if(part&&(part+' '+word).length>maxChars){out.push(part);part=word}else part=(part+' '+word).trim();}
    if(part)out.push(part);
  }
  return out.length?out:[text.slice(0,maxChars)];
}

export function chooseVoice<T extends {lang?:string;voiceURI?:string;default?:boolean}>(voices:T[],prefs:Pick<VoicePreferences,'lang'|'voiceURI'>):T|null {
  if(!Array.isArray(voices)||!voices.length)return null;
  if(prefs.voiceURI){const exact=voices.find(v=>v.voiceURI===prefs.voiceURI);if(exact)return exact;}
  const lang=String(prefs.lang||'th-TH').toLowerCase(),base=lang.split('-')[0];
  return voices.find(v=>String(v.lang||'').toLowerCase()===lang)
    || voices.find(v=>String(v.lang||'').toLowerCase().startsWith(base+'-'))
    || voices.find(v=>v.default)
    || voices[0]
    || null;
}
