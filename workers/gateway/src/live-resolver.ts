const clean=(value:unknown,max=12_000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export type LiveResolverKind='fuel_price'|'weather'|'none';
export type LiveResolverResult={ok:boolean;kind:LiveResolverKind;answer:string;source:string;sourceUrl:string;data?:unknown;reason?:string};
export type LiveClientContext={latitude?:number;longitude?:number;timezone?:string};

export function detectLiveResolverKind(input:string):LiveResolverKind{
  const text=clean(input,1000).toLocaleLowerCase();
  if(/(?:ราคา)?น้ำมัน(?:วันนี้|ตอนนี้|ล่าสุด|เท่าไร|เท่าไหร่)|(?:แก๊สโซฮอล์|ดีเซล).*(?:ราคา|วันนี้|เท่าไร|เท่าไหร่)/i.test(text))return'fuel_price';
  if(/(?:สภาพอากาศ|พยากรณ์อากาศ|อากาศ|ฝน|อุณหภูมิ|weather|forecast|rain|temperature)/i.test(text))return'weather';
  return'none';
}

function fuelAnswer(payload:any):LiveResolverResult{
  const row=Array.isArray(payload)?payload[0]:null;
  if(!row)return{ok:false,kind:'fuel_price',answer:'',source:'Bangchak',sourceUrl:'https://oil-price.bangchak.co.th/ApiOilPrice2/th',reason:'FUEL_EMPTY'};
  let list:any[]=[];
  try{list=Array.isArray(row.OilList)?row.OilList:JSON.parse(String(row.OilList||'[]'))}catch{return{ok:false,kind:'fuel_price',answer:'',source:'Bangchak',sourceUrl:'https://oil-price.bangchak.co.th/ApiOilPrice2/th',reason:'FUEL_PARSE_FAILED'}}
  const wanted=[
    ['แก๊สโซฮอล์ 95',/แก๊สโซฮอล์\s*95/i],['แก๊สโซฮอล์ 91',/แก๊สโซฮอล์\s*91/i],['E20',/แก๊สโซฮอล์\s*E20/i],['E85',/แก๊สโซฮอล์\s*E85/i],['ดีเซล B20',/ดีเซล\s*B20/i],['ไฮดีเซล',/ไฮดีเซล/i],
  ] as const;
  const parts:string[]=[];
  for(const [label,pattern] of wanted){const item=list.find(x=>pattern.test(String(x?.OilName||'')));if(item&&Number.isFinite(Number(item.PriceToday)))parts.push(`${label} ${Number(item.PriceToday).toFixed(2)} บาท/ลิตร`)}
  if(!parts.length)return{ok:false,kind:'fuel_price',answer:'',source:'Bangchak',sourceUrl:'https://oil-price.bangchak.co.th/ApiOilPrice2/th',reason:'FUEL_PRICES_MISSING'};
  const effective=clean(row.OilRemark2,300)||clean(row.OilDateNow,80);
  return{ok:true,kind:'fuel_price',answer:`ราคาน้ำมันวันนี้จากบางจากครับ ${parts.join(' · ')}${effective?` · ${effective}`:''}`,source:'Bangchak',sourceUrl:'https://www.bangchak.co.th/th/OilPrice',data:{effective,prices:parts}};
}

function weatherLabel(code:number):string{if(code===0)return'ท้องฟ้าแจ่มใส';if(code<=3)return'มีเมฆบางส่วน';if(code<=48)return'มีหมอก';if(code<=57)return'มีฝนปรอย';if(code<=67)return'มีฝน';if(code<=77)return'มีหิมะ';if(code<=82)return'มีฝนเป็นช่วง ๆ';if(code<=86)return'มีหิมะเป็นช่วง ๆ';return'มีพายุฝนฟ้าคะนอง'}
function weatherAnswer(payload:any,input:string):LiveResolverResult{
  const tomorrow=/(?:พรุ่งนี้|tomorrow)/i.test(input),daily=payload?.daily||{},current=payload?.current||{};
  if(tomorrow){const tempMax=Number(daily?.temperature_2m_max?.[1]),tempMin=Number(daily?.temperature_2m_min?.[1]),rain=Number(daily?.precipitation_probability_max?.[1]),code=Number(daily?.weather_code?.[1]);if(!Number.isFinite(tempMax)&&!Number.isFinite(rain))return{ok:false,kind:'weather',answer:'',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',reason:'WEATHER_DATA_MISSING'};const parts=[`พรุ่งนี้ ${weatherLabel(Number.isFinite(code)?code:3)}`,Number.isFinite(tempMin)&&Number.isFinite(tempMax)?`อุณหภูมิประมาณ ${tempMin.toFixed(0)}–${tempMax.toFixed(0)} องศาเซลเซียส`:'',Number.isFinite(rain)?`โอกาสฝนสูงสุด ${rain.toFixed(0)} เปอร์เซ็นต์`:''].filter(Boolean);return{ok:true,kind:'weather',answer:parts.join(' · ')+'ครับ',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',data:{tomorrow:true,tempMin,tempMax,rain,code}};}
  const temp=Number(current?.temperature_2m),feels=Number(current?.apparent_temperature),rain=Number(current?.rain),precip=Number(current?.precipitation),code=Number(current?.weather_code);if(!Number.isFinite(temp))return{ok:false,kind:'weather',answer:'',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',reason:'WEATHER_DATA_MISSING'};const parts=[`ตอนนี้ ${weatherLabel(Number.isFinite(code)?code:3)}`,`อุณหภูมิ ${temp.toFixed(1)} องศาเซลเซียส`,Number.isFinite(feels)?`รู้สึกเหมือน ${feels.toFixed(1)} องศา`:'',(Number.isFinite(rain)&&rain>0)||(Number.isFinite(precip)&&precip>0)?`มีฝน ${Math.max(rain||0,precip||0).toFixed(1)} มิลลิเมตร`:''].filter(Boolean);return{ok:true,kind:'weather',answer:parts.join(' · ')+'ครับ',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',data:{tomorrow:false,temp,feels,rain,precip,code}};
}
export async function resolveLiveDirect(input:string,fetcher:typeof fetch=fetch,context:LiveClientContext={}):Promise<LiveResolverResult>{
  const kind=detectLiveResolverKind(input);
  if(kind==='none')return{ok:false,kind:'none',answer:'',source:'',sourceUrl:'',reason:'NO_DIRECT_RESOLVER'};
  if(kind==='fuel_price'){
    const url='https://oil-price.bangchak.co.th/ApiOilPrice2/th';
    try{const response=await fetcher(url,{headers:{accept:'application/json'}});if(!response.ok)return{ok:false,kind,answer:'',source:'Bangchak',sourceUrl:url,reason:`FUEL_HTTP_${response.status}`};return fuelAnswer(await response.json())}catch(error:any){return{ok:false,kind,answer:'',source:'Bangchak',sourceUrl:url,reason:`FUEL_REQUEST_FAILED:${clean(error?.message||error,180)}`}}
  }
  if(kind==='weather'){
    const latitude=Number(context.latitude),longitude=Number(context.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return{ok:false,kind,answer:'',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',reason:'WEATHER_LOCATION_REQUIRED'};
    const timezone=encodeURIComponent(clean(context.timezone,80)||'Asia/Bangkok'),url=`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(5)}&longitude=${longitude.toFixed(5)}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${timezone}&forecast_days=2`;
    try{const response=await fetcher(url,{headers:{accept:'application/json'}});if(!response.ok)return{ok:false,kind,answer:'',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',reason:`WEATHER_HTTP_${response.status}`};return weatherAnswer(await response.json(),input)}catch(error:any){return{ok:false,kind,answer:'',source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',reason:`WEATHER_REQUEST_FAILED:${clean(error?.message||error,180)}`}}
  }
  return{ok:false,kind:'none',answer:'',source:'',sourceUrl:'',reason:'NO_DIRECT_RESOLVER'};
}
