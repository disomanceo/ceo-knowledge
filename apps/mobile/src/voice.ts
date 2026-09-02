export type VoiceMode = 'off' | 'manual' | 'auto' | 'smart';

export interface VoicePreferences {
  mode: VoiceMode;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI: string;
}

export interface SpeechFormatOptions {
  preserveMeaningfulSymbols?: boolean;
  announceLinks?: boolean;
  announceCode?: boolean;
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
  [/\bAPI\b/gi,'เอพีไอ'],[/\bMCP\b/gi,'เอ็มซีพี'],[/\bPA\b/g,'พีเอ'],[/\bAI\b/gi,'เอไอ'],[/\bPWA\b/gi,'พีดับเบิลยูเอ'],
  [/\bTTS\b/gi,'ทีทีเอส'],[/\bSTT\b/gi,'เอสทีที'],[/\bUI\b/gi,'ยูไอ'],[/\bUX\b/gi,'ยูเอ็กซ์'],[/\bURL\b/gi,'ยูอาร์แอล'],
  [/\bCeo\b/gi,'ซีอีโอ'],[/\bGemini\b/gi,'เจมิไน'],[/\bSupabase\b/gi,'ซูพาเบส'],[/\bOllama\b/gi,'โอลามา'],
  [/\bChatGPT\b/gi,'แชตจีพีที'],[/\bClaude\b/gi,'คลอด'],[/\bAndroid\b/gi,'แอนดรอยด์'],[/\biOS\b/gi,'ไอโอเอส'],
];

const thaiMonths: Record<string,string> = {
  'ม.ค.':'มกราคม','ก.พ.':'กุมภาพันธ์','มี.ค.':'มีนาคม','เม.ย.':'เมษายน','พ.ค.':'พฤษภาคม','มิ.ย.':'มิถุนายน',
  'ก.ค.':'กรกฎาคม','ส.ค.':'สิงหาคม','ก.ย.':'กันยายน','ต.ค.':'ตุลาคม','พ.ย.':'พฤศจิกายน','ธ.ค.':'ธันวาคม',
};

function expandThaiMonths(text:string):string {
  let out=text;
  for(const [shortName,longName] of Object.entries(thaiMonths))out=out.replaceAll(shortName,longName);
  return out;
}

function normalizeMeaningfulSymbols(text:string,preserve:boolean):string {
  const symbolContext=/(?:พิมพ์|เขียน|เครื่องหมาย|สัญลักษณ์|ใช้|ใส่|ตามด้วย|ขึ้นต้นด้วย|ลงท้ายด้วย)/i;
  if(!preserve || !symbolContext.test(text))return text.replace(/[*#_~|]+/g,' ');
  return text
    .replace(/\*/g,' เครื่องหมายดอกจัน ')
    .replace(/#/g,' เครื่องหมายแฮช ')
    .replace(/_/g,' เครื่องหมายขีดล่าง ')
    .replace(/~/g,' เครื่องหมายตัวหนอน ')
    .replace(/\|/g,' เครื่องหมายขีดตั้ง ');
}

export function normalizeSpeechText(input: string, options: SpeechFormatOptions = {}): string {
  const {preserveMeaningfulSymbols=true,announceLinks=true,announceCode=true}=options;
  let text=String(input||'').normalize('NFC');
  text=text
    .replace(/```[\s\S]*?```/g,announceCode?' รายละเอียดโค้ดอยู่บนหน้าจอ ':' ')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi,'$1')
    .replace(/https?:\/\/\S+/gi,announceLinks?' ลิงก์อยู่บนหน้าจอ ':' ')
    .replace(/^\s*(?:Ceo\s*:\s*)/gim,'')
    .replace(/^\s{0,3}#{1,6}\s+/gm,'')
    .replace(/^\s*>+\s?/gm,'')
    .replace(/^\s*(?:[-+*•]|\d+[.)])\s+/gm,'')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/~~([^~]+)~~/g,'$1')
    .replace(/[│├└┌┐┘┬┴┼─]+/g,' ')
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:น\.)?/g,(_m,h,m)=>`${Number(h)} นาฬิกา${Number(m) ? ' '+Number(m)+' นาที' : ''}`)
    .replace(/\b([01]?\d|2[0-3])\s*นาฬิกา\s*00\s*นาที\b/g,'$1 นาฬิกา')
    .replace(/\s*→\s*/g,' แล้ว ')
    .replace(/\s*[=]{2,}\s*/g,' ')
    .replace(/\.{3,}/g,'…');

  text=expandThaiMonths(text);
  text=normalizeMeaningfulSymbols(text,preserveMeaningfulSymbols);
  for(const [pattern,replacement] of replacements)text=text.replace(pattern,replacement);

  return text
    .replace(/\s*([,;:])\s*/g,'$1 ')
    .replace(/\s+([.!?…])/g,'$1')
    .replace(/([.!?…])(?=[^\s])/g,'$1 ')
    .replace(/\s+/g,' ')
    .trim();
}

export function smartSpeechText(input: string, maxChars = 420): string {
  const original=String(input||'').trim();
  if(!original)return'';
  const technical=/```|\b(?:npm|git|commit|push|build|test|typecheck|HTTP|JSON|TypeScript|JavaScript)\b/i.test(original);
  const normalized=normalizeSpeechText(original);
  if(!normalized)return'';
  if(technical && normalized.length>260)return 'ดำเนินการด้านเทคนิคแล้วครับ รายละเอียดอยู่บนหน้าจอ';
  if(normalized.length<=maxChars)return normalized;
  const sentences=normalized.split(/(?<=[.!?…]|ครับ|ค่ะ|คะ)\s+/).filter(Boolean);
  let summary='';
  for(const sentence of sentences){
    if((summary+' '+sentence).trim().length>maxChars-55)break;
    summary=(summary+' '+sentence).trim();
    if(summary.length>180&&sentences.indexOf(sentence)>=1)break;
  }
  if(!summary)summary=normalized.slice(0,maxChars-60).trim();
  return `${summary} มีรายละเอียดเพิ่มเติมบนหน้าจอครับ`;
}

export function speechTextForMode(input:string,mode:VoiceMode):string {
  if(mode==='off'||mode==='manual')return'';
  return mode==='smart'?smartSpeechText(input):normalizeSpeechText(input);
}

export function splitSpeechText(input:string,maxChars=220):string[] {
  const text=String(input||'').trim();if(!text)return[];
  const sentences=text.split(/(?<=[.!?…]|ครับ|ค่ะ|คะ)\s+/).filter(Boolean),out:string[]=[];
  for(const sentence of sentences){
    if(sentence.length<=maxChars){out.push(sentence);continue;}
    const phrases=sentence.split(/(?<=[,;:])\s+/).filter(Boolean);
    let part='';
    for(const phrase of phrases){
      if(phrase.length>maxChars){
        const words=phrase.split(/\s+/);
        for(const word of words){if(part&&(part+' '+word).length>maxChars){out.push(part);part=word}else part=(part+' '+word).trim();}
        continue;
      }
      if(part&&(part+' '+phrase).length>maxChars){out.push(part);part=phrase}else part=(part+' '+phrase).trim();
    }
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
