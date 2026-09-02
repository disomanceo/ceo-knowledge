import { deterministicMemoryRerank } from './memory-reranker';

export interface RetrievalEvalCase{query:string;expectedIds:string[];candidates:any[];activeSourceId?:string}
export function evaluateRetrieval(cases:RetrievalEvalCase[]){
  let hit1=0,hit3=0,hit10=0,rr=0,falseAbsence=0;
  const results=(Array.isArray(cases)?cases:[]).map(test=>{
    const ranked=deterministicMemoryRerank(test.query,test.candidates,test.activeSourceId||'').scores.map(x=>x.id);
    const expected=new Set(test.expectedIds||[]),rank=ranked.findIndex(id=>expected.has(id))+1;
    if(rank===1)hit1++;if(rank>0&&rank<=3)hit3++;if(rank>0&&rank<=10)hit10++;if(rank)rr+=1/rank;else if(expected.size)falseAbsence++;
    return{query:test.query,rank,top:ranked.slice(0,10),expected:[...expected]};
  });
  const n=Math.max(1,results.length);return{count:results.length,recallAt1:hit1/n,recallAt3:hit3/n,recallAt10:hit10/n,mrr:rr/n,falseAbsenceRate:falseAbsence/n,results};
}
