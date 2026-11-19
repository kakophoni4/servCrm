import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashDirection,
  CashIncomeBasis,
  OrderStatus,
  Role,
  Prisma,
} from '@prisma/client';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

/** Границы календарного месяца (локальное время сервера). */
export function calendarMonthBounds(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth();
  const fromDate = new Date(year, month, 1, 0, 0, 0, 0);
  const toDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = toDate.getDate();
  return {
    fromDate,
    toDate,
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  async cashBalance(masterId:string, db:any=this.prisma) {
    const [orders,fines,receipts,corrections]=await Promise.all([
      db.order.findMany({where:{masterId,isPersonal:false,status:OrderStatus.DONE},include:{payment:true}}),
      db.cashTx.findMany({where:{masterId,direction:CashDirection.INCOME,incomeBasis:CashIncomeBasis.FINE}}),
      db.masterSettlement.aggregate({where:{masterId},_sum:{paidAmount:true}}),
      db.appSetting.findMany({where:{key:{startsWith:'cash.correction.'+masterId+'.'}}}),
    ]);
    const cents=(v:any)=>Math.round(Number(v||0)*100);
    const entries=[...orders.map((o:any)=>({id:o.id,publicId:o.publicId,address:o.address,date:o.completedAt||o.updatedAt,amount:cents(o.payment?.toCompany),kind:'order'})),...fines.map((f:any)=>({id:f.id,publicId:null,address:f.description||'Штраф',date:f.createdAt,amount:cents(f.amount),kind:'fine'}))].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()||a.id.localeCompare(b.id));
    const activeCorrections=corrections.flatMap((r:any)=>{try{const v=JSON.parse(r.value);return v.active?[{id:r.key,...v}]:[]}catch{return []}});
    let adjusted=0;
    for(const entry of entries){const waived=activeCorrections.reduce((n:number,c:any)=>n+(c.items||[]).filter((i:any)=>i.id===entry.id&&i.kind===entry.kind).reduce((n:number,i:any)=>n+cents(i.remaining),0),0);const applied=Math.min(entry.amount,waived);entry.amount-=applied;adjusted+=applied;}
    const due=entries.reduce((sum,e)=>sum+e.amount,0),paid=cents(receipts._sum.paidAmount);
    let available=paid;
    const unpaid=entries.flatMap(e=>{const applied=Math.min(Math.max(available,0),e.amount);available-=applied;const remaining=e.amount-applied;return remaining>0?[{...e,amount:e.amount/100,remaining:remaining/100}]:[]});
    return {masterId,adjusted:adjusted/100,corrections:activeCorrections.map((c:any)=>({id:c.id,amount:c.amount,at:c.at})),due:due/100,paid:paid/100,remaining:Math.max(0,due-paid)/100,credit:Math.max(0,paid-due)/100,unpaid};
  }

  async ownerCashReport(now=new Date(),kind:'personal'|'center'='personal') {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const value=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
    const start=new Date(Date.UTC(value('year'),value('month')-1,value('day'))-4*3600000),end=new Date(start.getTime()+86400000);
    const orders=await this.prisma.order.findMany({where:{status:OrderStatus.DONE,completedAt:{gte:start,lt:end},...(kind==='center'?{isServiceCenter:true}:{isPersonal:true,isServiceCenter:false})},include:{payment:true}});
    const sum=(field:'paid'|'partsCost'|'reinvestAmount'|'ownerNet')=>orders.reduce((total,o)=>total+Number(o.payment?.[field]||0),0);
    const money=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
    return [
      'Моя касса · '+now.toLocaleDateString('ru-RU',{timeZone:'Europe/Samara'}),
      kind==='center'?'СЦ':'Личные заявки',
      'Выполнено: '+orders.length,
      'Получено: '+money(sum('paid')),
      'Расходы: '+money(sum('partsCost')),
      'На Авито: '+money(sum('reinvestAmount')),
      'Мне: '+money(sum('ownerNet')),
    ].join('\n');
  }

  async cashReport(masterId:string,now=new Date()) {
    const master=await this.prisma.master.findUnique({where:{id:masterId},include:{user:true}});
    if(!master)throw new NotFoundException('Мастер не найден');
    const balance=await this.cashBalance(masterId);
    const money=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
    return ['Касса '+now.toLocaleDateString('ru-RU',{timeZone:'Europe/Samara'}),'Мастер: '+master.user.fullName,'','К сдаче: '+money(balance.remaining),'',...balance.unpaid.flatMap(e=>[e.kind==='order'?'ID заказа: '+e.publicId:'Штраф',e.address,new Date(e.date).toLocaleDateString('ru-RU',{timeZone:'Europe/Samara'})+' - '+money(e.remaining),'']),...(balance.credit?['Переплата: '+money(balance.credit)]:[])].join('\n').trim();
  }

  async cashBalances() {
    const masters=await this.prisma.master.findMany({include:{user:true},orderBy:{createdAt:'asc'}});
    return Promise.all(masters.map(async m=>({...await this.cashBalance(m.id),name:m.user.fullName})));
  }

  async resetErrors(masterId:string,expected:number,requestId:string,userId:string,role:Role){
    if(role!==Role.OWNER)throw new ForbiddenException('Только владелец');
    if(!/^[a-zA-Z0-9-]{10,80}$/.test(requestId||''))throw new BadRequestException('Некорректный запрос');
    const key='cash.correction.'+masterId+'.'+requestId;
    return this.prisma.$transaction(async tx=>{
      if(await tx.appSetting.findUnique({where:{key}}))return {ok:true};
      const balance=await this.cashBalance(masterId,tx);
      if(balance.remaining!==expected||!expected)throw new BadRequestException('Долг изменился. Обновите кассу.');
      await tx.appSetting.create({data:{key,value:JSON.stringify({active:true,userId,at:new Date().toISOString(),amount:balance.remaining,items:balance.unpaid.map(e=>({id:e.id,kind:e.kind,remaining:e.remaining}))})}});
      return {ok:true};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async undoCorrection(key:string,userId:string,role:Role){
    if(role!==Role.OWNER||!key.startsWith('cash.correction.'))throw new ForbiddenException('Только владелец');
    const row=await this.prisma.appSetting.findUnique({where:{key}});if(!row)throw new NotFoundException('Корректировка не найдена');
    const data=JSON.parse(row.value);await this.prisma.appSetting.updateMany({where:{key,value:row.value},data:{value:JSON.stringify({...data,active:false,undoneBy:userId,undoneAt:new Date().toISOString()})}});return {ok:true};
  }

  async receipts(masterId:string) {
    const refs=await this.prisma.appSetting.findMany({where:{key:{startsWith:'cash.receipt.'},value:{contains:masterId}}});
    const ids=refs.flatMap(r=>{try{const v=JSON.parse(r.value);return v.masterId===masterId&&v.receiptId?[v.receiptId]:[]}catch{return []}});
    return this.prisma.masterSettlement.findMany({where:{id:{in:ids},masterId,paidAmount:{gt:0}},select:{id:true,paidAmount:true,createdAt:true},orderBy:{createdAt:'desc'},take:100});
  }

  async editReceipt(id:string,amount:number,expected:number,userId:string,role:Role) {
    if(role!==Role.OWNER)throw new ForbiddenException('Изменять кассу может только владелец');
    if(!Number.isFinite(amount)||amount<0||amount>999999999)throw new BadRequestException('Проверьте сумму');
    amount=Math.round(amount*100)/100;
    return this.prisma.$transaction(async tx=>{
      const row=await tx.masterSettlement.findUnique({where:{id}});
      if(!row)throw new NotFoundException('Платёж не найден');
      if(Number(row.paidAmount)!==expected)throw new BadRequestException('Платёж изменился. Обновите историю.');
      const refs=await tx.appSetting.findMany({where:{key:{startsWith:'cash.receipt.'},value:{contains:id}}});
      const ref=refs.find(r=>{try{return JSON.parse(r.value).receiptId===id}catch{return false}});
      if(!ref)throw new BadRequestException('Этот платёж нельзя изменить здесь');
      const balance=await this.cashBalance(row.masterId,tx);
      if(amount>Math.max(0,Math.round((balance.due-balance.paid+Number(row.paidAmount))*100)/100))throw new BadRequestException('Сумма превышает долг мастера');
      await tx.appSetting.create({data:{key:'cash.adjustment.'+id+'.'+Date.now(),value:JSON.stringify({userId,before:Number(row.paidAmount),after:amount,at:new Date().toISOString()})}});
      await tx.masterSettlement.update({where:{id},data:{amount,paidAmount:amount}});
      await tx.appSetting.update({where:{key:ref.key},data:{value:JSON.stringify({...JSON.parse(ref.value),amount})}});
      return {ok:true};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async receiveCash(input:{masterId:string;amount:number;requestId:string},userId:string,role:Role) {
    if(role!==Role.OWNER)throw new ForbiddenException('Получение денег подтверждает только владелец');
    const amount=Math.round(input.amount*100)/100;
    if(!Number.isFinite(amount)||amount<=0)throw new BadRequestException('Укажите сумму больше нуля');
    const key='cash.receipt.'+userId+'.'+input.requestId;
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.prisma.$transaction(async tx=>{
        const previous=await tx.appSetting.findUnique({where:{key}});
        if(previous){const saved=JSON.parse(previous.value);if(saved.masterId!==input.masterId||saved.amount!==amount)throw new BadRequestException('Этот платёж уже обработан');return saved;}
        const master=await tx.master.findUnique({where:{id:input.masterId}});
        if(!master)throw new NotFoundException('Мастер не найден');
        const balance=await this.cashBalance(master.id,tx);
        if(amount>balance.remaining)throw new BadRequestException(`К сдаче осталось ${balance.remaining} ₽`);
        const now=new Date();
        const receipt=await tx.masterSettlement.create({data:{masterId:master.id,cityId:master.cityId,amount,paidAmount:amount,periodFrom:now,periodTo:now,confirmedOnce:true,confirmedTwice:true,confirmedById:userId,confirmedAt:now}});
        const result={masterId:master.id,amount,receiptId:receipt.id};
        await tx.appSetting.create({data:{key,value:JSON.stringify(result)}});
        return result;
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
      catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(e.code) && attempt<2)continue;throw e;}
    }
  }

  async list(userId: string, role: Role, requestedCityId?: string) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    return this.prisma.masterSettlement.findMany({
      where: { cityId: this.branch.cityWhere(cityIds) },
      include: { master: { include: { user: true } }, confirmedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Суммы к сдаче (Σ toCompany) по мастерам за период — по дате закрытия (Готов). */
  async preview(
    from: string,
    to: string,
    userId: string,
    role: Role,
    requestedCityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    const { fromDate, toDate } = this.periodBounds(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        masterId: { not: null },
        cityId: this.branch.cityWhere(cityIds),
        OR: [
          { completedAt: { gte: fromDate, lte: toDate } },
          // старые заявки до миграции completedAt
          {
            completedAt: null,
            updatedAt: { gte: fromDate, lte: toDate },
          },
        ],
      },
      include: { payment: true, master: { include: { user: true } } },
    });
    const map = new Map<
      string,
      {
        masterId: string;
        name: string;
        amount: number;
        count: number;
        fines: number;
        salary: number;
      }
    >();
    for (const o of orders) {
      if (!o.masterId || !o.master) continue;
      const cur = map.get(o.masterId) ?? {
        masterId: o.masterId,
        name: o.master.user.fullName,
        amount: 0,
        count: 0,
        fines: 0,
        salary: 0,
      };
      cur.amount += Number(o.payment?.toCompany ?? 0);
      cur.salary += Number(o.payment?.masterSalary ?? 0);
      cur.count += 1;
      map.set(o.masterId, cur);
    }

    // Штрафы мастера увеличивают «к сдаче» и учитываются отдельно (− из ЗП).
    const fineTxs = await this.prisma.cashTx.findMany({
      where: {
        direction: CashDirection.INCOME,
        incomeBasis: CashIncomeBasis.FINE,
        masterId: { not: null },
        createdAt: { gte: fromDate, lte: toDate },
        cityId: this.branch.cityWhere(cityIds),
      },
      include: { master: { include: { user: true } } },
    });
    for (const f of fineTxs) {
      if (!f.masterId || !f.master) continue;
      const cur = map.get(f.masterId) ?? {
        masterId: f.masterId,
        name: f.master.user.fullName,
        amount: 0,
        count: 0,
        fines: 0,
        salary: 0,
      };
      const amt = Number(f.amount);
      cur.fines += amt;
      cur.amount += amt;
      map.set(f.masterId, cur);
    }

    return [...map.values()];
  }

  /**
   * Доска расчёта: мастера за период с суммой к сдаче, оплачено и остатком.
   * «К сдаче» — живая сумма из заявок; «оплачено» — из расчётов за тот же период.
   */
  async board(
    from: string,
    to: string,
    userId: string,
    role: Role,
    requestedCityId?: string,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    const dueRows = await this.preview(from, to, userId, role, requestedCityId);
    const { fromDate, toDate } = this.periodBounds(from, to);

    const settlements = await this.prisma.masterSettlement.findMany({
      where: {
        cityId: this.branch.cityWhere(cityIds),
        periodFrom: { gte: fromDate },
        periodTo: { lte: toDate },
      },
      include: { master: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const fromKey = from.slice(0, 10);
    const toKey = to.slice(0, 10);
    const paidByMaster = new Map<
      string,
      { paid: number; settlementId: string; name: string }
    >();
    for (const s of settlements) {
      const pf = s.periodFrom.toISOString().slice(0, 10);
      const pt = s.periodTo.toISOString().slice(0, 10);
      if (pf !== fromKey || pt !== toKey) continue;
      const cur = paidByMaster.get(s.masterId) ?? {
        paid: 0,
        settlementId: s.id,
        name: s.master.user.fullName,
      };
      cur.paid += Number(s.paidAmount);
      if (!paidByMaster.has(s.masterId)) cur.settlementId = s.id;
      paidByMaster.set(s.masterId, cur);
    }

    const masterIds = new Set<string>([
      ...dueRows.map((r) => r.masterId),
      ...paidByMaster.keys(),
    ]);

    const rows = [...masterIds].map((masterId) => {
      const dueRow = dueRows.find((r) => r.masterId === masterId);
      const paidRow = paidByMaster.get(masterId);
      const due = Math.round((dueRow?.amount ?? 0) * 100) / 100;
      const paid = Math.round((paidRow?.paid ?? 0) * 100) / 100;
      const remaining = Math.max(0, Math.round((due - paid) * 100) / 100);
      const fines = Math.round((dueRow?.fines ?? 0) * 100) / 100;
      const salary = Math.round((dueRow?.salary ?? 0) * 100) / 100;
      const salaryNet = Math.max(0, Math.round((salary - fines) * 100) / 100);
      return {
        masterId,
        name: dueRow?.name ?? paidRow?.name ?? '—',
        due,
        paid,
        remaining,
        fines,
        salary,
        salaryNet,
        orderCount: dueRow?.count ?? 0,
        settlementId: paidRow?.settlementId ?? null,
      };
    });

    rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return rows;
  }

  async amountForMaster(
    masterId: string,
    from: string,
    to: string,
    userId: string,
    role: Role,
  ) {
    const rows = await this.preview(from, to, userId, role);
    const row = rows.find((r) => r.masterId === masterId);
    return {
      amount: row?.amount ?? 0,
      count: row?.count ?? 0,
    };
  }

  async create(
    input: {
      masterId: string;
      periodFrom: string;
      periodTo: string;
      amount?: number;
    },
    userId: string,
    role: Role,
  ) {
    return this.ensurePeriodSettlement(
      input.masterId,
      input.periodFrom,
      input.periodTo,
      userId,
      role,
    );
  }

  /**
   * После «Готов» / смены оплаты — создать или обновить месячный расчёт мастера.
   */
  async syncForCompletedOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, master: true },
    });
    if (
      !order ||
      order.status !== OrderStatus.DONE ||
      !order.masterId ||
      !order.master
    ) {
      return null;
    }

    const when = order.completedAt ?? new Date();
    return this.syncMasterMonth(
      order.masterId,
      when,
      order.master.cityId ?? order.cityId,
    );
  }

  /** Пересчитать сумму сдачи мастера за календарный месяц даты закрытия. */
  async syncMasterMonth(
    masterId: string,
    when: Date,
    cityId?: string | null,
  ) {
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
    });
    if (!master) return null;

    const { from, to, fromDate, toDate } = calendarMonthBounds(when);
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        masterId,
        OR: [
          { completedAt: { gte: fromDate, lte: toDate } },
          {
            completedAt: null,
            updatedAt: { gte: fromDate, lte: toDate },
          },
        ],
      },
      include: { payment: true },
    });
    const fromOrders =
      orders.reduce((s, o) => s + Number(o.payment?.toCompany ?? 0), 0);

    const fineTxs = await this.prisma.cashTx.findMany({
      where: {
        direction: CashDirection.INCOME,
        incomeBasis: CashIncomeBasis.FINE,
        masterId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      select: { amount: true },
    });
    const fromFines = fineTxs.reduce((s, t) => s + Number(t.amount), 0);
    const amount = Math.round((fromOrders + fromFines) * 100) / 100;

    const periodFrom = new Date(from);
    const periodTo = new Date(to);
    const existing = await this.prisma.masterSettlement.findFirst({
      where: { masterId, periodFrom, periodTo },
    });

    if (existing?.confirmedTwice) return existing;

    if (amount <= 0) {
      if (existing && Number(existing.paidAmount) <= 0) {
        await this.prisma.masterSettlement.delete({ where: { id: existing.id } });
      }
      return null;
    }

    const nextAmount = Math.max(amount, Number(existing?.paidAmount ?? 0));

    if (existing) {
      return this.prisma.masterSettlement.update({
        where: { id: existing.id },
        data: { amount: nextAmount },
      });
    }

    return this.prisma.masterSettlement.create({
      data: {
        masterId,
        cityId: cityId ?? master.cityId,
        amount: nextAmount,
        periodFrom,
        periodTo,
      },
    });
  }

  /**
   * Приём сдачи: найти/создать расчёт за период, синхронизировать сумму, внести оплату.
   */
  async acceptPayment(
    input: {
      masterId: string;
      periodFrom: string;
      periodTo: string;
      amount: number;
    },
    userId: string,
    role: Role,
  ) {
    if (role !== Role.OWNER) {
      throw new ForbiddenException('Вносить оплату может только владелец');
    }

    const settlement = await this.ensurePeriodSettlement(
      input.masterId,
      input.periodFrom,
      input.periodTo,
      userId,
      role,
    );
    return this.pay(settlement.id, input.amount, userId, role);
  }

  private async ensurePeriodSettlement(
    masterId: string,
    periodFrom: string,
    periodTo: string,
    userId: string,
    role: Role,
  ) {
    const master = await this.prisma.master.findUnique({
      where: { id: masterId },
    });
    if (!master) throw new NotFoundException('Мастер не найден');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      master.cityId &&
      !allowed.includes(master.cityId)
    ) {
      throw new ForbiddenException('Мастер вне вашего филиала');
    }

    const calc = await this.amountForMaster(
      masterId,
      periodFrom,
      periodTo,
      userId,
      role,
    );
    const due = Math.round(calc.amount * 100) / 100;
    if (due <= 0) {
      throw new BadRequestException(
        'Нет суммы к сдаче за период: нужны закрытые заявки (toCompany > 0) или штрафы мастера',
      );
    }

    const periodFromDate = new Date(periodFrom);
    const periodToDate = new Date(periodTo);
    const existing = await this.prisma.masterSettlement.findFirst({
      where: {
        masterId,
        periodFrom: periodFromDate,
        periodTo: periodToDate,
      },
    });

    if (existing) {
      const paid = Number(existing.paidAmount);
      const nextAmount = Math.max(due, paid);
      return this.prisma.masterSettlement.update({
        where: { id: existing.id },
        data: { amount: nextAmount },
        include: { master: { include: { user: true } } },
      });
    }

    return this.prisma.masterSettlement.create({
      data: {
        masterId,
        cityId: master.cityId,
        amount: due,
        periodFrom: periodFromDate,
        periodTo: periodToDate,
      },
      include: { master: { include: { user: true } } },
    });
  }

  async confirm(id: string, userId: string, role: Role) {
    const row = await this.prisma.masterSettlement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Расчёт не найден');

    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      (!row.cityId || !allowed.includes(row.cityId))
    ) {
      throw new ForbiddenException('Расчёт вне вашего филиала');
    }

    if (row.confirmedTwice) {
      throw new BadRequestException('Уже подтверждено дважды');
    }
    if (!row.confirmedOnce) {
      return this.prisma.masterSettlement.update({
        where: { id },
        data: { confirmedOnce: true },
        include: { master: { include: { user: true } }, confirmedBy: true },
      });
    }
    return this.prisma.masterSettlement.update({
      where: { id },
      data: {
        confirmedTwice: true,
        confirmedById: userId,
        confirmedAt: new Date(),
      },
      include: { master: { include: { user: true } }, confirmedBy: true },
    });
  }

  /**
   * Владелец отмечает сдачу мастера (paidAmount).
   * Деньги уже в кассе как INCOME ORDER при закрытии заявок — второй CashTx не создаём.
   */
  async pay(
    id: string,
    amount: number,
    _userId: string,
    role: Role,
  ) {
    if (role !== Role.OWNER) {
      throw new ForbiddenException('Вносить оплату может только владелец');
    }
    if (!(amount > 0)) {
      throw new BadRequestException('Сумма должна быть больше 0');
    }

    const row = await this.prisma.masterSettlement.findUnique({
      where: { id },
      include: { master: { include: { user: true } } },
    });
    if (!row) throw new NotFoundException('Расчёт не найден');

    const due = Number(row.amount);
    const paid = Number(row.paidAmount);
    const remaining = Math.round((due - paid) * 100) / 100;
    if (remaining <= 0) {
      throw new BadRequestException('Расчёт уже полностью оплачен');
    }
    if (amount > remaining + 0.001) {
      throw new BadRequestException(
        `Нельзя внести больше остатка (${remaining} ₽)`,
      );
    }

    const payAmount = Math.round(amount * 100) / 100;

    return this.prisma.masterSettlement.update({
      where: { id },
      data: { paidAmount: paid + payAmount },
      include: { master: { include: { user: true } }, confirmedBy: true },
    });
  }

  private periodBounds(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    // включить весь день «по»
    toDate.setHours(23, 59, 59, 999);
    return { fromDate, toDate };
  }
}
