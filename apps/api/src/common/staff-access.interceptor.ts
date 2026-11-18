import {Injectable,NestInterceptor,ExecutionContext,CallHandler,ForbiddenException,StreamableFile} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {map} from 'rxjs/operators';
const MONEY=new Set(['payment','payments','paid','partsCost','prepay','partsYesNo','masterSalary','masterPct','toCompany','reinvestAmount','ownerNet','reinvestPct','averageCheck','revenue','amount','paidAmount','cashTx','settlements','salaryCategory','salaryCategories','workSum','refundSum','orderSum','totalPaid','totalRevenue','documents','claims','orderSum','refundSum','totalPaid','revenue']);
export function redactStaffMoney(value:any):any {if(!value||typeof value!=='object'||value instanceof Date||value instanceof StreamableFile)return value;if(typeof value.toJSON==='function')return redactStaffMoney(value.toJSON());if(Array.isArray(value))return value.map(redactStaffMoney);return Object.fromEntries(Object.entries(value).filter(([key])=>!MONEY.has(key)).map(([k,v])=>[k,redactStaffMoney(v)]));}
export function assertStaffAccess(profile:string,method:string,path:string,body:any){
 if(profile==='logistic'&&method!=='GET'&&path.startsWith('/claims'))throw new ForbiddenException('Изменение претензий доступно помощнику или владельцу');
 if((method==='GET'&&['/masters/schedule','/masters/paged','/master-portal/inbox','/master-portal/inbox/paged'].includes(path))||(['GET','POST'].includes(method)&&/^\/master-portal\/orders\/[^/]+\/messages(?:\/paged)?$/.test(path)))return;
 if(method==='GET'&&/^\/masters\/[^/]+\/jobs$/.test(path))return;
 const read=method==='GET';
 const allowed=read?/^\/(auth\/me|orders(?:\/[^/]+)?|clients(?:\/[^/]+)?|masters|partners|cities(?:\/age-categories)?|claims(?:\/[^/]+)?)$/.test(path):/^\/(auth\/change-password|orders(?:\/[^/]+)?|orders\/[^/]+\/(repeat|warranty)|clients\/[^/]+\/comment|claims(?:\/[^/]+)?)$/.test(path);
 const docs=profile==='assistant'&&/^\/orders\/[^/]+\/documents(?:\/|$)/.test(path)&&method!=='DELETE';
 if(!allowed&&!docs)throw new ForbiddenException('Недостаточно прав');
 if(method==='DELETE')throw new ForbiddenException('Удаление доступно владельцу');
 if(profile==='logistic'&&body&&(/^\/orders/.test(path))){if([...MONEY].some(k=>body[k]!==undefined)||body.status==='DONE')throw new ForbiddenException('Оплата и закрытие доступны помощнику или владельцу');}
}
export function redactStaffSecrets(value:any):any {if(!value||typeof value!=='object'||value instanceof Date||value instanceof StreamableFile)return value;if(typeof value.toJSON==='function')return redactStaffSecrets(value.toJSON());if(Array.isArray(value))return value.map(redactStaffSecrets);return Object.fromEntries(Object.entries(value).filter(([key])=>!['passwordHash','passportEnc','contractPhotoPath','employeePhotoPath','refreshToken','token','filePath','documentPath'].includes(key)).map(([k,v])=>[k,redactStaffSecrets(v)]));}
export function assertMasterAccess(method:string,path:string){if((method==='GET'&&path==='/auth/me')||(method==='POST'&&path==='/auth/change-password')||path.startsWith('/master-portal/'))return;throw new ForbiddenException('Доступен только кабинет мастера');}
@Injectable() export class StaffAccessInterceptor implements NestInterceptor {
 constructor(private readonly prisma:PrismaService){}
 async intercept(context:ExecutionContext,next:CallHandler){const req=context.switchToHttp().getRequest();if(req.user?.role==='MASTER')assertMasterAccess(req.method,(req.path||req.url).split('?')[0].replace(/^\/api(?=\/)/,'').replace(/\/$/,''));const perms=req.user?.permissions||[];const profile=perms.includes('staff.logistic')?'logistic':perms.includes('staff.assistant')?'assistant':null;if(!profile)return next.handle();const path=(req.path||req.url).split('?')[0].replace(/^\/api(?=\/)/,'').replace(/\/$/,'');assertStaffAccess(profile,req.method,path,req.body);if(profile==='logistic'&&req.method!=='GET'&&/^\/orders\/[^/]+/.test(path)){const order=await this.prisma.order.findUnique({where:{id:path.split('/')[2]},select:{status:true}});if(order?.status==='DONE')throw new ForbiddenException('Закрытые заявки может менять помощник или владелец');}return next.handle().pipe(map(value=>profile==='logistic'?redactStaffMoney(redactStaffSecrets(value)):redactStaffSecrets(value)));}
}
