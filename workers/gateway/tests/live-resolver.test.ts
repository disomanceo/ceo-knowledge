import { describe,expect,it } from 'vitest';
import { detectLiveResolverKind, resolveLiveDirect } from '../src/live-resolver';

describe('live direct resolver',()=>{
  it('detects Thai fuel-price questions',()=>{expect(detectLiveResolverKind('ราคาน้ำมันวันนี้')).toBe('fuel_price');expect(detectLiveResolverKind('ดีเซลวันนี้ราคาเท่าไหร่')).toBe('fuel_price')});
  it('formats official fuel data without an AI model',async()=>{
    const payload=[{OilRemark2:'ราคามีผล ณ วันที่ 2 ก.ย. 69 เวลา 05.00 น.',OilList:JSON.stringify([
      {OilName:'แก๊สโซฮอล์ 95 S EVO',PriceToday:38.29},{OilName:'แก๊สโซฮอล์ 91 S EVO',PriceToday:37.92},{OilName:'แก๊สโซฮอล์ E20 S EVO',PriceToday:33.29},{OilName:'ดีเซล B20',PriceToday:34.14},
    ])}];
    const fetcher=async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    const result=await resolveLiveDirect('ราคาน้ำมันวันนี้',fetcher as any);
    expect(result.ok).toBe(true);expect(result.answer).toContain('แก๊สโซฮอล์ 95 38.29 บาท/ลิตร');expect(result.answer).toContain('ดีเซล B20 34.14 บาท/ลิตร');expect(result.source).toBe('Bangchak');
  });
});
