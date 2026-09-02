import { describe,expect,it } from 'vitest';
import { detectLiveResolverKind, resolveLiveDirect } from '../src/live-resolver';

describe('live direct resolver',()=>{
  it('detects Thai fuel-price questions',()=>{expect(detectLiveResolverKind('ราคาน้ำมันวันนี้')).toBe('fuel_price');expect(detectLiveResolverKind('ดีเซลวันนี้ราคาเท่าไหร่')).toBe('fuel_price')});
  it('detects weather questions',()=>{expect(detectLiveResolverKind('เช็คสภาพอากาศตอนนี้ให้หน่อย')).toBe('weather');expect(detectLiveResolverKind('พรุ่งนี้ฝนจะตกไหม')).toBe('weather')});
  it('formats location-aware weather without an AI model',async()=>{const payload={current:{temperature_2m:31.4,apparent_temperature:35.2,precipitation:0,rain:0,weather_code:2},daily:{weather_code:[2,80],temperature_2m_max:[33,32],temperature_2m_min:[25,24],precipitation_probability_max:[30,70]}};const fetcher=async()=>new Response(JSON.stringify(payload),{status:200});const current=await resolveLiveDirect('สภาพอากาศตอนนี้',fetcher as any,{latitude:14.47,longitude:100.12,timezone:'Asia/Bangkok'});expect(current.ok).toBe(true);expect(current.answer).toContain('31.4 องศาเซลเซียส');const tomorrow=await resolveLiveDirect('พรุ่งนี้ฝนจะตกไหม',fetcher as any,{latitude:14.47,longitude:100.12});expect(tomorrow.answer).toContain('โอกาสฝนสูงสุด 70 เปอร์เซ็นต์')});
  it('requires client location for direct weather',async()=>{const result=await resolveLiveDirect('สภาพอากาศตอนนี้');expect(result.ok).toBe(false);expect(result.reason).toBe('WEATHER_LOCATION_REQUIRED')});
  it('formats official fuel data without an AI model',async()=>{
    const payload=[{OilRemark2:'ราคามีผล ณ วันที่ 2 ก.ย. 69 เวลา 05.00 น.',OilList:JSON.stringify([
      {OilName:'แก๊สโซฮอล์ 95 S EVO',PriceToday:38.29},{OilName:'แก๊สโซฮอล์ 91 S EVO',PriceToday:37.92},{OilName:'แก๊สโซฮอล์ E20 S EVO',PriceToday:33.29},{OilName:'ดีเซล B20',PriceToday:34.14},
    ])}];
    const fetcher=async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    const result=await resolveLiveDirect('ราคาน้ำมันวันนี้',fetcher as any);
    expect(result.ok).toBe(true);expect(result.answer).toContain('แก๊สโซฮอล์ 95 38.29 บาท/ลิตร');expect(result.answer).toContain('ดีเซล B20 34.14 บาท/ลิตร');expect(result.source).toBe('Bangchak');
  });
});
