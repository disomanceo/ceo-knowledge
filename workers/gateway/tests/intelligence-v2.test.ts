import { describe,expect,it } from 'vitest';
import { analyzeIntelligenceV2,eventConstraintMatches,normalizeThaiInput } from '../src/intelligence-v2';

describe('Ceo Intelligence V2',()=>{
  it('segments Thai activity words without spaces',()=>{expect(normalizeThaiInput('ดอนขาดประเมินวันไหน')).toContain('ดอนขาด ประเมิน วันไหน');const x=analyzeIntelligenceV2('ดอนขาดประเมินวันไหน');expect(x.intent).toBe('event');expect(x.answerField).toBe('date');expect(x.eventConstraint).toBe('assessment')});
  it('treats dinner as a strict event type',()=>{const x=analyzeIntelligenceV2('กินเลี้ยงพี่เผือกวันไหน');expect(x.eventConstraint).toBe('dinner');expect(eventConstraintMatches(x.eventConstraint,{title:'งานเลี้ยงเกษียณ ผอ. เผือก'})).toBe(true);expect(eventConstraintMatches(x.eventConstraint,{title:'งานเกษียณ ผอ. เผือก ที่โรงเรียน'})).toBe(false)});
  it('routes news and current internet questions away from AI-only',()=>{const news=analyzeIntelligenceV2('ข่าวเด่นๆ 3 เรื่องวันนี้');expect(news.intent).toBe('news');expect(news.route).toBe('web');expect(news.requestedCount).toBe(3);const fuel=analyzeIntelligenceV2('ราคาน้ำมันวันนี้');expect(fuel.intent).toBe('current_fact');expect(fuel.route).toBe('direct')});
});
