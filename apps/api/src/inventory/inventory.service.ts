import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'crypto';
import {PrismaService} from '../prisma/prisma.service';
@Injectable() export class InventoryService {
 constructor(private readonly db:PrismaService){}
 list(){return this.db.$queryRaw`SELECT p.*,COALESCE((SELECT SUM(u.quantity)::int FROM stock_usage u JOIN orders o ON o.id=u.order_id WHERE u.part_id=p.id AND o.status::text NOT IN ('DONE','REFUSAL','CANCELLED_CC','NO_ARRIVAL')),0) AS planned FROM stock_parts p WHERE p.active ORDER BY p.category,p.name`;}
 async paged(q:string,group:string,low:boolean,pageInput:string){
  const page=Number(pageInput);if(!Number.isSafeInteger(page)||page<1||page>1000000||q.length>200||group.length>80)throw new BadRequestException('Некорректный фильтр');
  const pattern='%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%';const category=group.trim().toLocaleLowerCase('ru');const offset=(page-1)*30;
  const [items,counts,groups,lowCount]=await Promise.all([
   this.db.$queryRaw`SELECT p.*,COALESCE((SELECT SUM(u.quantity)::int FROM stock_usage u JOIN orders o ON o.id=u.order_id WHERE u.part_id=p.id AND o.status::text NOT IN ('DONE','REFUSAL','CANCELLED_CC','NO_ARRIVAL')),0) AS planned FROM stock_parts p WHERE p.active AND (p.name||' '||p.category) ILIKE ${pattern} AND (${category}='' OR lower(COALESCE(NULLIF(trim(p.category),''),'Без группы'))=${category}) AND (${low}=false OR p.quantity<=p.minimum) ORDER BY p.category,p.name,p.id LIMIT 30 OFFSET ${offset}`,
   this.db.$queryRaw<{total:number}[]>`SELECT COUNT(*)::int AS total FROM stock_parts p WHERE p.active AND (p.name||' '||p.category) ILIKE ${pattern} AND (${category}='' OR lower(COALESCE(NULLIF(trim(p.category),''),'Без группы'))=${category}) AND (${low}=false OR p.quantity<=p.minimum)`,
   this.db.$queryRaw<{name:string}[]>`SELECT DISTINCT COALESCE(NULLIF(trim(category),''),'Без группы') AS name FROM stock_parts WHERE active ORDER BY name`,
   this.db.$queryRaw<{total:number}[]>`SELECT COUNT(*)::int AS total FROM stock_parts WHERE active AND quantity<=minimum`
  ]);const total=counts[0].total;return {items,total,page,totalPages:Math.ceil(total/30),groups:groups.map(g=>g.name),lowTotal:lowCount[0].total};
 }
 history(){return this.db.$queryRaw`SELECT m.*,p.name FROM stock_moves m JOIN stock_parts p ON p.id=m.part_id ORDER BY m.created_at DESC,m.id DESC LIMIT 100`;}
 async edit(id:string,d:{name:string;category:string;minimum:number}){
  if(!d.name.trim())throw new BadRequestException('Укажите название');
  try{const count=await this.db.$executeRaw`UPDATE stock_parts SET name=${d.name.trim()},category=${d.category.trim()},minimum=${d.minimum} WHERE id=${id}`;if(!count)throw new NotFoundException('Запчасть не найдена');return {ok:true};}catch(e){if(String(e).includes('23505'))throw new BadRequestException('Такая запчасть уже есть в этой категории');throw e;}
 }
 async create(d:{name:string;category:string;quantity:number;minimum:number}){
  if(!d.name.trim())throw new BadRequestException('Укажите название');
  try{return await this.db.$transaction(async tx=>{const id=randomUUID();await tx.$executeRaw`INSERT INTO stock_parts(id,name,category,quantity,minimum) VALUES(${id},${d.name.trim()},${d.category.trim()},${d.quantity},${d.minimum})`;if(d.quantity)await tx.$executeRaw`INSERT INTO stock_moves(part_id,delta,reason) VALUES(${id},${d.quantity},'initial')`;return {id};});}catch(e){if(String(e).includes('23505'))throw new BadRequestException('Такая запчасть уже есть в этой категории');throw e;}
 }
 async receive(id:string,d:{delta:number;reason:string;requestId:string}){
  if(!d.delta||!d.reason.trim())throw new BadRequestException('Укажите количество и причину');
  return this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73184199)`;
   const prior:any[]=await tx.$queryRaw`SELECT * FROM stock_moves WHERE id=${d.requestId}`;
   if(prior.length){if(prior[0].part_id!==id||prior[0].delta!==d.delta||prior[0].reason!==d.reason.trim())throw new BadRequestException('Этот запрос уже использован');return {ok:true};}
   const changed=await tx.$executeRaw`UPDATE stock_parts SET quantity=quantity+${d.delta} WHERE id=${id} AND quantity+${d.delta}>=0`;
   if(!changed)throw new BadRequestException('Запчасть не найдена или остатка недостаточно');
   await tx.$executeRaw`INSERT INTO stock_moves(id,part_id,delta,reason) VALUES(${d.requestId},${id},${d.delta},${d.reason.trim()})`;
   return {ok:true};
  });
 }
 async order(id:string){
  const order=await this.db.order.findUnique({where:{id},select:{status:true}});if(!order)throw new NotFoundException('Заявка не найдена');
  const items=await this.db.$queryRaw`SELECT u.part_id AS "partId",u.quantity,u.applied,p.name,p.category FROM stock_usage u JOIN stock_parts p ON p.id=u.part_id WHERE u.order_id=${id} ORDER BY p.category,p.name`;
  return {...order,items};
 }
 async save(id:string,items:{partId:string;quantity:number}[],guard?:(tx:any,order:any)=>Promise<void>){
  try{await this.db.$transaction(async tx=>{
   const orders:any[]=await tx.$queryRaw`SELECT status,is_personal AS "isPersonal",is_service_center AS "isServiceCenter",master_id AS "masterId",updated_at AS "updatedAt" FROM orders WHERE id=${id} FOR UPDATE`;if(!orders.length)throw new NotFoundException('Заявка не найдена');
   if(guard)await guard(tx,orders[0]);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(73184199)`;
   await tx.$executeRaw`UPDATE stock_usage SET quantity=0 WHERE order_id=${id}`;
   for(const item of items){
    const parts:any[]=await tx.$queryRaw`SELECT id FROM stock_parts WHERE id=${item.partId} AND active`;if(!parts.length)throw new BadRequestException('Запчасть не найдена');
    await tx.$executeRaw`INSERT INTO stock_usage(order_id,part_id,quantity) VALUES(${id},${item.partId},${item.quantity}) ON CONFLICT(order_id,part_id) DO UPDATE SET quantity=EXCLUDED.quantity`;
   }
   await tx.$executeRaw`SELECT sync_order_stock(${id},${orders[0].status==='DONE'})`;
   await tx.$executeRaw`DELETE FROM stock_usage WHERE order_id=${id} AND quantity=0 AND applied=0`;
  });}catch(e){if(String(e).includes('Not enough stock:'))throw new BadRequestException('На складе недостаточно выбранных запчастей');throw e;}
  return this.order(id);
 }
}
