import {BadRequestException} from '@nestjs/common';
export type PageQuery={page?:string;limit?:string;q?:string;filter?:string;tech?:string;cityId?:string;date?:string;kind?:string;state?:string;assignment?:string;masterId?:string};
export function pageInput(q:PageQuery){const page=q.page===undefined?1:Number(q.page),limit=q.limit===undefined?30:Number(q.limit);if(!Number.isSafeInteger(page)||page<1||page>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new BadRequestException('Некорректная страница или размер списка');if(q.q!==undefined&&(typeof q.q!=='string'||q.q.length>200))throw new BadRequestException('Поиск до 200 символов');return {page,limit,search:q.q?.trim()||''};}
export function pageResult<T>(items:T[],total:number,page:number,limit:number){return {items,total,page,limit,totalPages:Math.max(1,Math.ceil(total/limit))};}
export function moscowToday(now=new Date()){const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const gte=new Date(key+'T00:00:00+04:00');return {gte,lt:new Date(gte.getTime()+86400000)};}

export function orderFilters(q:PageQuery) {
  if(q.masterId!==undefined&&(typeof q.masterId!=='string'||q.masterId.length>100||!q.masterId.trim()))throw new BadRequestException('Некорректный мастер');
  if(q.masterId&&(q.assignment==='unassigned'||(q.assignment===undefined&&q.filter==='unassigned')))throw new BadRequestException('Выберите мастера или заявки без мастера');
  const legacy=q.filter||'all';
  if(!['today','tomorrow','sd','partner','all','unassigned','active','personal','center','closed','cancelled'].includes(legacy))throw new BadRequestException('Неизвестный фильтр');
  const values={
    date:q.date??(['today','tomorrow'].includes(legacy)?legacy:'all'),
    kind:q.kind??(['personal','partner','center'].includes(legacy)?legacy:'all'),
    state:q.state??(legacy==='unassigned'?'active':['active','sd','closed','cancelled'].includes(legacy)?legacy:'all'),
    assignment:q.assignment??(legacy==='unassigned'?'unassigned':'all'),
  };
  const allowed={date:['all','today','tomorrow'],kind:['all','personal','partner','center'],state:['all','active','not_assigned','waiting','sd','closed','cancelled'],assignment:['all','unassigned']};
  for(const key of Object.keys(allowed) as (keyof typeof allowed)[])if(!allowed[key].includes(values[key]))throw new BadRequestException('Неизвестный фильтр');
  return values;
}
