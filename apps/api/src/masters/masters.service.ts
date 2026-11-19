import {PageQuery,pageInput,pageResult} from '../orders/paging';
import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  private async activity(ids:string[]) {
    if(!ids.length)return new Map<string,string>();
    const rows=await this.prisma.order.groupBy({by:['masterId','status'],where:{masterId:{in:ids},isPersonal:false,status:{in:['WAITING','NOT_SCHEDULED','ON_THE_WAY','IN_PROGRESS','IN_PROGRESS_SD']}},_count:{_all:true}});
    return new Map(ids.map(id=>{const own=rows.filter(r=>r.masterId===id);return [id,own.some(r=>r.status==='ON_THE_WAY')?'На адресе':own.some(r=>r.status==='IN_PROGRESS')?'В работе':own.some(r=>r.status==='IN_PROGRESS_SD')?'Ремонт СД':own.length?'Есть назначенные заявки':'Свободен'];}));
  }

  async remove(id:string,confirmation:string){
    return this.prisma.$transaction(async tx=>{
      const master=await tx.master.findUnique({where:{id},include:{user:true,_count:{select:{orders:true,settlements:true,cashFines:true}}}});
      if(!master)throw new NotFoundException('Мастер не найден');
      if(confirmation!==master.user.fullName)throw new BadRequestException('Введите имя мастера для подтверждения');
      if(master._count.orders||master._count.cashFines||await tx.masterSettlement.count({where:{masterId:id,OR:[{amount:{gt:0}},{paidAmount:{gt:0}}]}}))throw new BadRequestException('У мастера есть заявки или финансовая история. Удалите ошибочные записи либо уберите мастера из активных.');
      await tx.user.update({where:{id:master.userId},data:{status:UserStatus.FIRED,telegramId:null,firedAt:new Date()}});
      await tx.masterSettlement.deleteMany({where:{masterId:id}});
      await tx.master.delete({where:{id}});
      await tx.appSetting.deleteMany({where:{key:{contains:id}}});
      return {deleted:true};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async paged(userId:string,role:Role,q:PageQuery) {
    const {page,limit,search}=pageInput(q);const allowed=await this.branch.allowedCityIds(userId,role),cityIds=this.branch.resolveCityIds(allowed,q.cityId);
    const where:Prisma.MasterWhereInput={status:'ACTIVE',cityId:this.branch.cityWhere(cityIds),...(q.tech?{repairTech:{has:q.tech}}:{}),...(search?{user:{OR:[{fullName:{contains:search,mode:'insensitive'}},{phone:{contains:search.replace(/\D/g,'')||search}}]}}:{})};
    const total=await this.prisma.master.count({where});
    const scoped=cityIds===null?Prisma.empty:cityIds.length?Prisma.sql`AND m.city_id IN (${Prisma.join(cityIds)})`:Prisma.sql`AND FALSE`;
    const searched=search?Prisma.sql`AND (u.full_name ILIKE ${'%'+search+'%'} OR u.phone LIKE ${'%'+(search.replace(/\D/g,'')||search)+'%'})`:Prisma.empty;
    const tech=q.tech?Prisma.sql`AND ${q.tech}=ANY(m.repair_tech)`:Prisma.empty;
    const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Samara',weekday:'short'}).format(new Date()))||7;
    const stats=await this.prisma.$queryRaw<{id:string;averageCheck:number;completedOrders:bigint;activeCount:bigint;sdCount:bigint}[]>(Prisma.sql`
      SELECT m.id,COALESCE(AVG(COALESCE(p.paid,0)) FILTER(WHERE o.status='DONE' AND NOT o.is_personal),0)::float AS "averageCheck",
      COUNT(o.id) FILTER(WHERE o.status='DONE' AND NOT o.is_personal) AS "completedOrders",
      COUNT(o.id) FILTER(WHERE o.status NOT IN ('DONE','REFUSAL','CANCELLED_CC','IN_PROGRESS_SD')) AS "activeCount",
      COUNT(o.id) FILTER(WHERE o.status='IN_PROGRESS_SD') AS "sdCount"
      FROM masters m JOIN users u ON u.id=m.user_id LEFT JOIN orders o ON o.master_id=m.id LEFT JOIN order_payments p ON p.order_id=o.id
      WHERE m.status='ACTIVE' ${scoped} ${searched} ${tech}
      GROUP BY m.id,u.full_name ORDER BY COALESCE((SELECT CASE WHEN w.is_working THEN 0 ELSE 2 END FROM master_weekdays w WHERE w.master_id=m.id AND w.weekday=${weekday}),1),"averageCheck" DESC,"completedOrders" DESC,u.full_name,m.id LIMIT ${limit} OFFSET ${(page-1)*limit}`);
    const masters=await this.prisma.master.findMany({where:{id:{in:stats.map(x=>x.id)}},include:{workSchedule:true,user:{select:{fullName:true,phone:true,telegramId:true}}}});
    const activity=await this.activity(masters.map(m=>m.id));
    return pageResult(stats.map(row=>({...masters.find(m=>m.id===row.id)!,activity:activity.get(row.id),averageCheck:Math.round(row.averageCheck*100)/100,completedOrders:Number(row.completedOrders),activeCount:Number(row.activeCount),sdCount:Number(row.sdCount)})),total,page,limit);
  }

  async jobs(id:string,userId:string,role:Role,q:PageQuery) {
    const {page,limit}=pageInput(q);const allowed=await this.branch.allowedCityIds(userId,role);
    if(!await this.prisma.master.findFirst({where:{id,cityId:this.branch.cityWhere(allowed)}}))throw new NotFoundException('Мастер не найден');
    const where:Prisma.OrderWhereInput={masterId:id,status:{notIn:['DONE','REFUSAL','CANCELLED_CC']}};
    const [total,items]=await this.prisma.$transaction([this.prisma.order.count({where}),this.prisma.order.findMany({where,skip:(page-1)*limit,take:limit,select:{id:true,publicId:true,masterId:true,status:true,address:true,scheduledAt:true,sdDueAt:true,client:{select:{name:true}}},orderBy:[{scheduledAt:'asc'},{id:'asc'}]})]);return pageResult(items,total,page,limit);
  }

  async schedule(userId:string,role:Role,from:string,to:string) {
    const parse=(v:string)=> { const d=new Date(v+'T00:00:00.000Z'); if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'') || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==v)throw new BadRequestException('Некорректная дата'); return d; };
    const start=parse(from),end=parse(to);
    if(end<start || end.getTime()-start.getTime()>93*86400000)throw new BadRequestException('Выберите период до 93 дней');
    const allowed=await this.branch.allowedCityIds(userId,role);
    const masters=await this.prisma.master.findMany({where:{status:'ACTIVE',cityId:this.branch.cityWhere(allowed)},include:{workSchedule:true}});
    const days:{masterId:string;date:string;isWorking:boolean}[]=[];
    for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1))for(const master of masters) {
      const row=master.workSchedule.find(w=>w.weekday===(d.getUTCDay()||7));
      if(row)days.push({masterId:master.id,date:d.toISOString().slice(0,10),isWorking:row.isWorking});
    }
    return {from,to,days};
  }

  async list(
    userId: string,
    role: Role | string,
    activeOnly = true,
    cityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, cityId);
    const masters=await this.prisma.master.findMany({
      where: {
        status: activeOnly ? UserStatus.ACTIVE : undefined,
        cityId: this.branch.cityWhere(cityIds),
      },
      include: { user: true, city: true, workSchedule: {orderBy:{weekday:'asc'}} },
      orderBy: { createdAt: 'desc' },
    });
    if(!masters.length)return [];
    const stats=await this.prisma.$queryRaw<{masterId:string;count:bigint;average:number}[]>(Prisma.sql`SELECT o.master_id AS "masterId",COUNT(*) AS count,AVG(COALESCE(p.paid,0))::float AS average FROM orders o LEFT JOIN order_payments p ON p.order_id=o.id WHERE o.status='DONE' AND NOT o.is_personal AND o.master_id IN (${Prisma.join(masters.map(m=>m.id))}) GROUP BY o.master_id`);
    const byId=new Map(stats.map(r=>[r.masterId,r]));
    const activity=await this.activity(masters.map(m=>m.id));
    return masters.map(m=>{const r=byId.get(m.id);return {...m,activity:activity.get(m.id),completedOrders:Number(r?.count||0),averageCheck:Math.round(Number(r?.average||0)*100)/100};}).sort((a,b)=>b.averageCheck-a.averageCheck||b.completedOrders-a.completedOrders||a.user.fullName.localeCompare(b.user.fullName,'ru'));


  }

  async create(input: {
    fullName: string;
    repairTech?: string[];
    address?: string;
    login?: string;
    password?: string;
    phone?: string;
    cityId?: string;
    telegramId?: string;
  }) {
    const login =
      input.login?.trim().toLowerCase() ||
      `master_${Date.now().toString(36)}`;
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new ConflictException('Логин занят');

    const passwordHash = await bcrypt.hash(input.password ?? 'master123', 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login,
          passwordHash,
          fullName: input.fullName.trim(),
          role: Role.MASTER,
          phone: input.phone?.trim() || null,
          cityId: input.cityId?.trim() || null,
          telegramId: input.telegramId?.trim() || null,
          status: UserStatus.ACTIVE,
          hiredAt: new Date(),
        },
      });
      // Мастер без кабинета: роль на User остаётся служебной;
      // доступ в web не выдаём по masterProfile, выбор идёт из Master.
      return tx.master.create({
        data: {
          userId: user.id,
          address: input.address,
          repairTech: input.repairTech,
          cityId: input.cityId?.trim() || null,
          status: UserStatus.ACTIVE,
        },
        include: { user: true, city: true },
      });
    });
  }

  /**
   * «Удаление» мастера: статус FIRED, открытые заявки без исполнителя.
   */
  async update(id: string, input: {fullName:string;repairTech?:string[];phone?:string;address?:string;telegramId?:string}) {
    return this.prisma.master.update({where:{id},data:{address:input.address,repairTech:input.repairTech,user:{update:{fullName:input.fullName.trim(),phone:input.phone,telegramId:input.telegramId}}},include:{user:true}});
  }
  async deactivate(id: string) {
    const master = await this.prisma.master.findUnique({ where: { id } });
    if (!master) throw new NotFoundException('Мастер не найден');

    return this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          masterId: id,
          status: {
            notIn: ['DONE', 'REFUSAL', 'CANCELLED_CC'],
          },
        },
        data: { masterId: null },
      });

      await tx.user.update({
        where: { id: master.userId },
        data: { status: UserStatus.FIRED, firedAt: new Date() },
      });

      return tx.master.update({
        where: { id },
        data: { status: UserStatus.FIRED },
        include: { user: true },
      });
    });
  }

  /** Восстановление мастера (аналог users.restore). */
  async restore(id: string) {
    const master = await this.prisma.master.findUnique({ where: { id } });
    if (!master) throw new NotFoundException('Мастер не найден');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: master.userId },
        data: {
          status: UserStatus.ACTIVE,
          firedAt: null,
          fireReason: null,
          recommendedHire: null,
        },
      });

      return tx.master.update({
        where: { id },
        data: { status: UserStatus.ACTIVE },
        include: { user: true },
      });
    });
  }
}
