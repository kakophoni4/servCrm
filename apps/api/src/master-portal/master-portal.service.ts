import {masterContactVisible} from '../common/utils/master-contact';
import {Injectable,Logger,BadRequestException,ForbiddenException,NotFoundException,ConflictException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {SalaryService} from '../salary/salary.service';
import {SettlementsService} from '../settlements/settlements.service';
import {DocumentsService} from '../documents/documents.service';
import {BotService} from '../bot/bot.service';
import {BranchScopeService} from '../common/branch/branch-scope.service';
import {sdDeadline} from '../bot/group-flow';
import {calcPayment} from '../common/utils/formulas';
import {DocKind,Prisma} from '@prisma/client';
import {extname} from 'path';
import * as bcrypt from 'bcrypt';
export type Actor={userId:string;role:string};
export function money(value:any){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000||Math.abs(value*100-Math.round(value*100))>0.00001)throw new BadRequestException('Введите сумму с точностью до копеек');return value;}
export function validateFiles(files:any[]){if(!files.length||files.length>30)throw new BadRequestException('От 1 до 30 файлов');for(const f of files){const b=f.buffer as Buffer;if(!Buffer.isBuffer(b)||!b.length||b.length>10*1024*1024)throw new BadRequestException('Файл должен быть не больше 10 МБ');const ext=extname(f.originalname).toLowerCase();const head=b.subarray(0,12);const valid=(['.jpg','.jpeg'].includes(ext)&&head[0]===255&&head[1]===216&&head[2]===255)||(ext==='.png'&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(ext==='.pdf'&&head.toString().startsWith('%PDF-'))||(ext==='.gif'&&/^GIF8[79]a/.test(head.toString()))||(ext==='.webp'&&head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP')||(ext==='.heic'&&head.subarray(4,8).toString()==='ftyp'&&['heic','heix','mif1','hevc'].includes(head.subarray(8,12).toString()));if(!valid)throw new BadRequestException('Прикрепите фото или PDF');}}
@Injectable()
export class MasterPortalService {
 private readonly logger=new Logger(MasterPortalService.name);
 constructor(private prisma:PrismaService,private salary:SalaryService,private settlements:SettlementsService,private documents:DocumentsService,private bot:BotService,private branch:BranchScopeService){}
 async master(u:Actor){if(u.role!=='MASTER')throw new ForbiddenException();const m=await this.prisma.master.findUnique({where:{userId:u.userId},include:{user:true}});if(!m||m.status!=='ACTIVE'||m.user.status!=='ACTIVE'||!m.user.masterWebEnabled)throw new ForbiddenException();return m;}
 async scope(u:Actor){if(u.role==='MASTER')return {masterId:(await this.master(u)).id,isPersonal:false};if(!['OWNER','ADMIN','DIRECTOR','DISPATCHER'].includes(u.role))throw new ForbiddenException();return {cityId:this.branch.cityWhere(await this.branch.allowedCityIds(u.userId,u.role))};}
 async order(u:Actor,id:string,db:any=this.prisma){const o=await db.order.findFirst({where:{id,...await this.scope(u)},include:{client:true,payment:true,documents:true}});if(!o)throw new NotFoundException('Заявка недоступна');return o;}
 async view(o:any){const a=await this.prisma.appSetting.findUnique({where:{key:'bot.orders.accepted.'+o.id}});return {id:o.id,publicId:o.publicId,status:o.status,address:o.address,typeTech:o.typeTech,problem:o.comment,notes:o.adminComment,scheduledAt:o.scheduledAt,sdStartedAt:o.sdStartedAt,sdDueFrom:o.sdDueFrom,sdDueAt:o.sdDueAt,isServiceCenter:o.isServiceCenter,updatedAt:o.updatedAt,accepted:a?.value===o.masterId,client:{name:o.client.name,phone:masterContactVisible(o,a?.value)?o.client.phoneNormalized:null},payment:o.payment?{paid:o.payment.paid,partsCost:o.payment.partsCost,prepay:o.payment.prepay,masterSalary:o.payment.masterSalary}:null,documents:o.documents.filter((d:any)=>!['AD_SCREEN','CASH_DOC'].includes(d.kind)).map((d:any)=>({id:d.id,fileName:d.fileName,kind:d.kind,createdAt:d.createdAt,mimeType:d.mimeType}))};}
 async list(u:Actor){const master=await this.master(u);const orders=await this.prisma.order.findMany({where:{masterId:master.id,isPersonal:false},include:{client:true,payment:true,documents:true},orderBy:{scheduledAt:'desc'}});return Promise.all(orders.map(o=>this.view(o)));}
 async detail(u:Actor,id:string){await this.master(u);return this.view(await this.order(u,id));}
 async access(id:string,login:string,password:string){login=login.trim().toLowerCase();if(!/^[a-z0-9_.-]{3,60}$/.test(login)||password.length<8||password.length>100)throw new BadRequestException('Логин: 3–60 латинских символов. Пароль: от 8 символов');const m=await this.prisma.master.findUnique({where:{id},include:{user:true}});if(!m||m.status!=='ACTIVE'||m.user.status!=='ACTIVE'||m.user.role!=='MASTER')throw new NotFoundException('Мастер недоступен');try{await this.prisma.user.update({where:{id:m.userId},data:{login,passwordHash:await bcrypt.hash(password,12),masterWebEnabled:true}})}catch(e:any){if(e.code==='P2002')throw new BadRequestException('Логин уже занят');throw e}return {ok:true,login};}
 async action(u:Actor,id:string,d:any){const m=await this.master(u);if(typeof d.version!=='string'||!Number.isFinite(Date.parse(d.version)))throw new BadRequestException('Обновите заявку');await this.prisma.$transaction(async tx=>{const o=await this.order(u,id,tx);if(o.updatedAt.toISOString()!==d.version)throw new ConflictException('Заявка изменилась. Обновите страницу');const accepted=await tx.appSetting.findUnique({where:{key:'bot.orders.accepted.'+id}});let data:any={notifyAckedAt:new Date(),updatedAt:new Date(Math.max(Date.now(),o.updatedAt.getTime()+1))};let payment:any=null;
 if(d.action==='accept'){if(!['WAITING','NOT_SCHEDULED'].includes(o.status)||accepted?.value===m.id)throw new ConflictException('Заявка уже принята');if(o.isServiceCenter)data.status='IN_PROGRESS';}
 else if(d.action==='arrive'){if(o.isServiceCenter||!['WAITING','NOT_SCHEDULED'].includes(o.status)||accepted?.value!==m.id)throw new BadRequestException('Сначала примите заявку');data.status='ON_THE_WAY';}
 else if(d.action==='leave'){if(o.isServiceCenter||o.status!=='ON_THE_WAY')throw new BadRequestException('Сначала отметьте прибытие');data.status='IN_PROGRESS';}
 else if(d.action==='sd'){if(o.status!=='IN_PROGRESS')throw new BadRequestException('Заявка должна быть в работе');const from=d.sdDaysFrom,to=d.sdDaysTo;if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>365)throw new BadRequestException('Срок от 1 до 365 дней');const start=new Date();data={...data,status:'IN_PROGRESS_SD',sdStartedAt:start,sdDueFrom:sdDeadline(from),sdDueAt:sdDeadline(to)};payment={prepay:money(d.prepay)};}
 else if(d.action==='close'){if(!['IN_PROGRESS','IN_PROGRESS_SD'].includes(o.status))throw new BadRequestException('Заявка должна быть в работе');const paid=money(d.paid),partsCost=money(d.partsCost);if(partsCost>paid||paid<Number(o.payment?.prepay||0))throw new BadRequestException('Проверьте оплату, расходы и предоплату');const terms=await this.salary.termsFor(paid-partsCost,o.typeTech,m.id);const base=calcPayment(paid,partsCost,o.sourceKind==='PARTNER'?0.5:terms.masterPct);const reinvestPct=o.sourceKind==='PARTNER'?0:o.isServiceCenter?0.3:terms.reinvestPct;const reinvestAmount=Math.round(base.toCompany*reinvestPct*100)/100;payment={paid,partsCost,partsYesNo:partsCost>0,...base,reinvestPct,reinvestAmount,ownerNet:Math.round((base.toCompany-reinvestAmount)*100)/100};data={...data,status:'DONE',completedAt:o.completedAt||new Date(),docsViaAdmin:false};}
 else throw new BadRequestException('Неизвестное действие');
 const changed=await tx.order.updateMany({where:{id,masterId:m.id,isPersonal:false,status:o.status,updatedAt:o.updatedAt},data});if(changed.count!==1)throw new ConflictException('Заявка изменилась. Обновите страницу');
 if(d.action==='accept'){const key='bot.orders.accepted.'+id;await tx.appSetting.upsert({where:{key},create:{key,value:m.id},update:{value:m.id}})}
 if(payment)await tx.orderPayment.upsert({where:{orderId:id},create:{orderId:id,...payment},update:payment});
 if(d.action==='close'){const cash=await tx.cashTx.findFirst({where:{orderId:id,incomeBasis:'ORDER'}});const entry={amount:payment.toCompany,cityId:o.cityId,description:'Приход по заявке (чистыми)'};if(cash)await tx.cashTx.update({where:{id:cash.id},data:entry});else await tx.cashTx.create({data:{...entry,orderId:id,direction:'INCOME',incomeBasis:'ORDER',createdById:u.userId}})}
 });if(d.action==='close')await this.settlements.syncForCompletedOrder(id).catch(()=>this.logger.warn('Settlement sync failed after saved closure'));await this.bot.refreshSavedDocumentCards(id).catch(()=>undefined);return this.detail(u,id);}
 async messages(u:Actor,id:string){await this.order(u,id);const rows=await this.prisma.orderDiscussionMessage.findMany({where:{orderId:id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:500});const users=await this.prisma.user.findMany({where:{id:{in:[...new Set(rows.map(r=>r.userId))]}},select:{id:true,fullName:true,role:true}});return rows.reverse().map(r=>({...r,user:users.find(x=>x.id===r.userId)}));}
 async message(u:Actor,id:string,body:string){body=body.trim();if(!body||body.length>4000)throw new BadRequestException('Сообщение: от 1 до 4000 символов');const row=await this.prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR NO KEY UPDATE`;await this.order(u,id,tx);return tx.orderDiscussionMessage.create({data:{orderId:id,userId:u.userId,body}})});const user=await this.prisma.user.findUnique({where:{id:u.userId},select:{id:true,fullName:true,role:true}});return {...row,user};}
 async inbox(u:Actor){return (await this.inboxPage(u,'',1,100)).items;}
 async inboxPage(u:Actor,q='',page=1,limit=30){
  if(!Number.isInteger(page)||page<1||page>100000||q.length>200)throw new BadRequestException('Некорректный поиск');
  let access=Prisma.sql`TRUE`;
  if(u.role==='MASTER'){const m=await this.master(u);access=Prisma.sql`o.master_id=${m.id} AND NOT o.is_personal`;}
  else {await this.scope(u);const cities=await this.branch.allowedCityIds(u.userId,u.role);if(cities!==null)access=cities.length?Prisma.sql`o.city_id IN (${Prisma.join(cities)})`:Prisma.sql`FALSE`;}
  const term='%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%';
  const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT o.id AS "orderId",o.public_id AS "publicId",c.name AS "clientName",
      json_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'user',json_build_object('id',u.id,'fullName',u.full_name,'role',u.role)) AS "lastMessage"
    FROM orders o JOIN clients c ON c.id=o.client_id
    JOIN LATERAL (SELECT id,body,created_at,user_id FROM order_discussion_messages WHERE order_id=o.id ORDER BY created_at DESC,id DESC LIMIT 1) m ON TRUE
    JOIN users u ON u.id=m.user_id
    WHERE ${access} AND (c.name ILIKE ${term} OR o.public_id ILIKE ${term})
    ORDER BY m.created_at DESC,m.id DESC LIMIT ${limit+1} OFFSET ${(page-1)*limit}`);
  return {items:rows.slice(0,limit),hasMore:rows.length>limit,page};
 }
 async messagePage(u:Actor,id:string,before?:string){
  await this.order(u,id);let cursor:any;
  if(before){cursor=await this.prisma.orderDiscussionMessage.findFirst({where:{id:before,orderId:id}});if(!cursor)throw new BadRequestException('Сообщение не найдено');}
  const rows=await this.prisma.orderDiscussionMessage.findMany({where:{orderId:id,...(cursor?{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51});
  const users=await this.prisma.user.findMany({where:{id:{in:[...new Set(rows.map(r=>r.userId))]}},select:{id:true,fullName:true,role:true}});
  return {items:rows.slice(0,50).reverse().map(r=>({...r,user:users.find(x=>x.id===r.userId)})),hasMore:rows.length>50};
 }
 async listPage(u:Actor,closed=false,page=1){
  const m=await this.master(u);if(!Number.isInteger(page)||page<1||page>100000)throw new BadRequestException('Некорректная страница');
  const statuses=['DONE','REFUSAL','CANCELLED_CC'] as any;const where={masterId:m.id,isPersonal:false,status:closed?{in:statuses}:{notIn:statuses}};
  const [total,items]=await this.prisma.$transaction([this.prisma.order.count({where}),this.prisma.order.findMany({where,select:{id:true,publicId:true,status:true,address:true,scheduledAt:true,client:{select:{name:true}}},orderBy:[{scheduledAt:'desc'},{id:'desc'}],take:30,skip:(page-1)*30})]);
  return {items,total,page,totalPages:Math.max(1,Math.ceil(total/30))};
 }
 async upload(u:Actor,id:string,kind:DocKind,files:any[]){await this.master(u);validateFiles(files);const result=await this.prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} FOR NO KEY UPDATE`;await this.order(u,id,tx);return this.documents.uploadMany(id,kind,files,u.userId,undefined,{preserveOrder:true})},{timeout:60000});await this.bot.refreshSavedDocumentCards(id).catch(()=>undefined);return {created:result.created.map(d=>({id:d.id,fileName:d.fileName,kind:d.kind})),skipped:result.skipped};}
 async document(u:Actor,id:string,docId:string){await this.master(u);await this.order(u,id);const doc=await this.documents.getDoc(id,docId);if(['AD_SCREEN','CASH_DOC'].includes(doc.kind))throw new NotFoundException('Документ недоступен');return doc;}
}
