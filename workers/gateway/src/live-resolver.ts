const clean=(value:unknown,max=12_000)=>String(value??'').replace(/\u0000/g,'').trim().slice(0,max);

export type LiveResolverKind='fuel_price'|'none';
export type LiveResolverResult={ok:boolean;kind:LiveResolverKind;answer:string;source:string;sourceUrl:string;data?:unknown;reason?:string};

export function detectLiveResolverKind(input:string):LiveResolverKind{
  const text=clean(input,1000).toLocaleLowerCase();
  if(/(?:ราคา)?น้ำมัน(?:วันนี้|ตอนนี้|ล่าสุด|เท่าไร|เท่าไหร่)|(?:แก๊สโซฮอล์|ดีเซล).*(?:ราคา|วันนี้|เท่าไร|เท่าไหร่)/i.test(text))return'fuel_price';
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

export async function resolveLiveDirect(input:string,fetcher:typeof fetch=fetch):Promise<LiveResolverResult>{
  const kind=detectLiveResolverKind(input);
  if(kind==='none')return{ok:false,kind:'none',answer:'',source:'',sourceUrl:'',reason:'NO_DIRECT_RESOLVER'};
  if(kind==='fuel_price'){
    const url='https://oil-price.bangchak.co.th/ApiOilPrice2/th';
    try{const response=await fetcher(url,{headers:{accept:'application/json'}});if(!response.ok)return{ok:false,kind,answer:'',source:'Bangchak',sourceUrl:url,reason:`FUEL_HTTP_${response.status}`};return fuelAnswer(await response.json())}catch(error:any){return{ok:false,kind,answer:'',source:'Bangchak',sourceUrl:url,reason:`FUEL_REQUEST_FAILED:${clean(error?.message||error,180)}`}}
  }
  return{ok:false,kind:'none',answer:'',source:'',sourceUrl:'',reason:'NO_DIRECT_RESOLVER'};
}
