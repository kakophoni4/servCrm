import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

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
    const orders=await this.prisma.order.findMany({where:{masterId:{in:masters.map(m=>m.id)},status:'DONE',isPersonal:false},select:{masterId:true,payment:{select:{paid:true}}}});
    return masters.map(m=>{const completed=orders.filter(o=>o.masterId===m.id);const revenue=completed.reduce((sum,o)=>sum+Number(o.payment?.paid||0),0);return {...m,completedOrders:completed.length,averageCheck:completed.length?Math.round(revenue/completed.length*100)/100:0};}).sort((a,b)=>b.averageCheck-a.averageCheck||b.completedOrders-a.completedOrders||a.user.fullName.localeCompare(b.user.fullName,'ru'));

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
