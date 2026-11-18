import {BadGatewayException,BadRequestException,Injectable} from '@nestjs/common';
import {AvitoService} from './avito.service';

export function validatePeriod(from:string,to:string){
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!valid(from)||!valid(to)||from>to||Date.parse(to)-Date.parse(from)>89*86400000)throw new BadRequestException('Выберите период до 90 дней');
}
export function metric(row:any,slug:string):number|null {
 const m=Array.isArray(row?.metrics)?row.metrics.find((x:any)=>x?.slug===slug):null;
 return typeof m?.value==='number'&&Number.isFinite(m.value)?m.value:null;
}
@Injectable()
export class AvitoStatsService {
 constructor(private readonly avito:AvitoService){}
 private cache=new Map<string,{expires:number;value:any}>();
 private pending=new Map<string,Promise<any>>();
 async stats(from:string,to:string){
  validatePeriod(from,to);
  const key=from+':'+to,cached=this.cache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  if(this.pending.has(key))return this.pending.get(key);
  const task=this.load(from,to);this.pending.set(key,task);
  try{const value=await task;if(this.cache.size>=20)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{expires:Date.now()+60000,value});return value;}finally{this.pending.delete(key);}
 }
 private async load(from:string,to:string){
  const profile=await this.avito.profile(),rows=new Map<number,any>();let offset=0,total=0,stamp='';
  do{
   const data=await this.avito.request(`/stats/v2/accounts/${profile.id}/items`,{dateFrom:from,dateTo:to,grouping:'item',metrics:['views','contacts','spending'],limit:100,offset});
   const result=data?.result;
   if(!Array.isArray(result?.groupings)||!Number.isSafeInteger(result.dataTotalCount)||result.dataTotalCount<0)throw new BadGatewayException('Авито вернул неполную статистику');
   total=result.dataTotalCount;stamp=String(result.timestamp||'');
   if(total>10000)throw new BadRequestException('Слишком много объявлений. Сократите период');
   for(const row of result.groupings){if(!Number.isSafeInteger(row?.id)||row.type!=='items')throw new BadGatewayException('Авито вернул неизвестный формат статистики');rows.set(row.id,row);}
   if(!result.groupings.length&&offset<total)throw new BadGatewayException('Авито вернул неполную статистику');
   offset+=result.groupings.length;
  }while(offset<total);
  if(rows.size!==total)throw new BadGatewayException('Статистика Авито изменилась при загрузке. Обновите ещё раз');
  const titles=new Map<number,string>();
  // Titles are optional: historical ads may be absent from the current item list.
  try{for(let page=1;page<=20;page++){
   const data=await this.avito.request(`/core/v1/items?per_page=100&page=${page}`);
   if(!Array.isArray(data.resources))break;
   for(const item of data.resources)if(Number.isSafeInteger(item?.id)&&typeof item.title==='string')titles.set(item.id,item.title);
   if(data.resources.length<100||[...rows.keys()].every(id=>titles.has(id)))break;
  }}catch{}
  const ms=Number(stamp)*1000;
  return {items:[...rows.values()].map(row=>{const spending=metric(row,'spending');return {id:row.id,title:titles.get(row.id)||`Объявление № ${row.id}`,views:metric(row,'views'),contacts:metric(row,'contacts'),spendingRub:spending===null?null:spending/100};}),updatedAt:Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():new Date().toISOString()};
 }
}
