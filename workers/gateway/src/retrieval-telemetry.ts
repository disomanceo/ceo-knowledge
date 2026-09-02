const events:Array<Record<string,unknown>>=[];
const counters={queries:0,accepted:0,judged:0,rejected:0,corrections:0};
export function recordRetrieval(event:Record<string,unknown>){counters.queries++;const gate=String(event.gate||'');if(gate==='accept')counters.accepted++;else if(gate==='judge')counters.judged++;else if(gate==='reject')counters.rejected++;events.push({...event,at:new Date().toISOString()});if(events.length>120)events.splice(0,events.length-120)}
export function recordCorrection(event:Record<string,unknown>){counters.corrections++;events.push({type:'correction',...event,at:new Date().toISOString()});if(events.length>120)events.splice(0,events.length-120)}
export function retrievalTelemetry(){return{...counters,recent:events.slice(-20)}}
