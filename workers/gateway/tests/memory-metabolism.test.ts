import { describe,expect,it } from 'vitest';
import { canonicalMatchScore,chooseCanonicalCandidate,claimLifecycle,retrievalEligible } from '../src/memory-metabolism';
import { evaluateRetrieval } from '../src/retrieval-eval';

describe('memory metabolism',()=>{
 it('matches the same dated event before creating a duplicate',()=>{const incoming={kind:'events',title:'รับทุน ปตท.',description:'รับทุน ปตท. ครูอ๊อฟไปด้วย',start_at:'2026-09-11T02:00:00Z'},old={id:'e11',kind:'events',title:'รับทุน ปตท.',description:'วันที่ 11 กันยายน รับทุน ปตท.',start_at:'2026-09-11T02:00:00Z'};expect(canonicalMatchScore(incoming,old)).toBeGreaterThan(.72);expect(chooseCanonicalCandidate(incoming,[old])?.row.id).toBe('e11')});
 it('filters superseded and refuted knowledge from retrieval',()=>{expect(claimLifecycle({metadata:{supersededBy:'claim_new'}})).toBe('superseded');expect(retrievalEligible({metadata:{supersededBy:'claim_new'}})).toBe(false);expect(retrievalEligible({truth_status:'refuted'})).toBe(false);expect(retrievalEligible({evidence_status:'conflicting'})).toBe(true)});
 it('measures recall and false absence',()=>{const a={id:'a',kind:'events',title:'รับทุน ปตท.',description:'11 กันยายน'},b={id:'b',kind:'events',title:'งานเลี้ยงเกษียณ',description:'18 กันยายน'};const result=evaluateRetrieval([{query:'รับทุน ปตท วันไหน',expectedIds:['a'],candidates:[b,a]}]);expect(result.recallAt3).toBe(1);expect(result.mrr).toBeGreaterThan(0);expect(result.falseAbsenceRate).toBe(0)});
});
