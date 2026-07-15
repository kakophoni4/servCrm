/**
 * T13 — изоляция денег по филиалам (касса + отчёты).
 *
 * Требуется тестовая PostgreSQL (DATABASE_URL) с актуальной схемой:
 *   cd apps/api && npx prisma db push
 *
 * Запуск на сервере:
 *   cd apps/api && npm run test:e2e -- cash-reports.e2e-spec.ts
 *
 * Кейсов: 19
 */
import { INestApplication } from '@nestjs/common';
import {
  CashDirection,
  CashExpenseBasis,
  CashIncomeBasis,
  ClaimType,
  OrderStatus,
  Role,
  SourceKind,
  SourceOur,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeToken, SeedBaseDataResult, seedBaseData } from './helpers/auth';
import { createTestApp, resetDb } from './setup-e2e';

const PERIOD_AT = new Date('2026-06-15T12:00:00.000Z');
const REPORT_FROM = '2026-06-01';
const REPORT_TO = '2026-06-30';

/** Суммы города A — уникальные, чтобы отличать от B в ассертах. */
const A = {
  incomeOther: 1100,
  incomeOrder: 2200,
  expenseOperating: 330,
  orderToCompany1: 1000,
  orderToCompany2: 2000,
  orderMasterSalary1: 400,
  orderMasterSalary2: 600,
  orderPaid1: 5000,
  orderPaid2: 7000,
  orderWork1: 3000,
  orderWork2: 5000,
  avitoAds: 5,
} as const;

/** Суммы города B — заведомо другие. */
const B = {
  incomeOther: 5500,
  expenseOperating: 4400,
  orderToCompany1: 3000,
  orderToCompany2: 4000,
  orderMasterSalary1: 900,
  orderMasterSalary2: 1200,
  orderPaid1: 9000,
  orderPaid2: 11000,
  orderWork1: 6000,
  orderWork2: 8000,
  avitoAds: 50,
} as const;

const NULL_CITY_INCOME = 777;


function authHeader(userId: string, role: Role, login: string): string {
  return `Bearer ${makeToken(userId, role, login)}`;
}

async function seedCashReportsFixtures(
  prisma: PrismaService,
  seed: SeedBaseDataResult,
): Promise<void> {
  const { cities, users } = seed;

  const masterA = await prisma.master.findUnique({
    where: { userId: users.masterA.id },
  });
  if (!masterA) {
    throw new Error('masterA not found in seed');
  }

  const masterBUser = await prisma.user.create({
    data: {
      login: 'masterB',
      passwordHash: await bcrypt.hash('unused', 10),
      fullName: 'Master B',
      role: Role.MASTER,
      status: UserStatus.ACTIVE,
      cityId: cities.b.id,
      hiredAt: PERIOD_AT,
    },
  });
  const masterB = await prisma.master.create({
    data: {
      userId: masterBUser.id,
      cityId: cities.b.id,
      status: UserStatus.ACTIVE,
    },
  });

  const clientA = await prisma.client.create({
    data: {
      phoneNormalized: '+79001111111',
      name: 'Client A',
      cityId: cities.a.id,
    },
  });
  const clientB = await prisma.client.create({
    data: {
      phoneNormalized: '+79002222222',
      name: 'Client B',
      cityId: cities.b.id,
    },
  });

  const orderA1 = await prisma.order.create({
    data: {
      publicId: 'ORD-A-1',
      seqPrefix: 'A',
      seq: 1,
      clientId: clientA.id,
      address: 'Address A-1',
      sourceKind: SourceKind.OUR,
      sourceOur: SourceOur.AVITO,
      cityId: cities.a.id,
      masterId: masterA.id,
      status: OrderStatus.DONE,
      createdById: users.adminA.id,
      createdAt: PERIOD_AT,
      updatedAt: PERIOD_AT,
      payment: {
        create: {
          paid: A.orderPaid1,
          toCompany: A.orderToCompany1,
          masterSalary: A.orderMasterSalary1,
          workSum: A.orderWork1,
        },
      },
    },
  });
  const orderA2 = await prisma.order.create({
    data: {
      publicId: 'ORD-A-2',
      seqPrefix: 'A',
      seq: 2,
      clientId: clientA.id,
      address: 'Address A-2',
      sourceKind: SourceKind.OUR,
      sourceOur: SourceOur.LEAFLET,
      cityId: cities.a.id,
      masterId: masterA.id,
      status: OrderStatus.DONE,
      createdById: users.adminA.id,
      createdAt: PERIOD_AT,
      updatedAt: PERIOD_AT,
      payment: {
        create: {
          paid: A.orderPaid2,
          toCompany: A.orderToCompany2,
          masterSalary: A.orderMasterSalary2,
          workSum: A.orderWork2,
        },
      },
    },
  });
  const orderB1 = await prisma.order.create({
    data: {
      publicId: 'ORD-B-1',
      seqPrefix: 'B',
      seq: 1,
      clientId: clientB.id,
      address: 'Address B-1',
      sourceKind: SourceKind.PARTNER,
      cityId: cities.b.id,
      masterId: masterB.id,
      status: OrderStatus.DONE,
      createdById: users.adminB.id,
      createdAt: PERIOD_AT,
      updatedAt: PERIOD_AT,
      payment: {
        create: {
          paid: B.orderPaid1,
          toCompany: B.orderToCompany1,
          masterSalary: B.orderMasterSalary1,
          workSum: B.orderWork1,
        },
      },
    },
  });
  const orderB2 = await prisma.order.create({
    data: {
      publicId: 'ORD-B-2',
      seqPrefix: 'B',
      seq: 2,
      clientId: clientB.id,
      address: 'Address B-2',
      sourceKind: SourceKind.OUR,
      sourceOur: SourceOur.AVITO,
      cityId: cities.b.id,
      masterId: masterB.id,
      status: OrderStatus.DONE,
      createdById: users.adminB.id,
      createdAt: PERIOD_AT,
      updatedAt: PERIOD_AT,
      payment: {
        create: {
          paid: B.orderPaid2,
          toCompany: B.orderToCompany2,
          masterSalary: B.orderMasterSalary2,
          workSum: B.orderWork2,
        },
      },
    },
  });

  await prisma.cashTx.createMany({
    data: [
      {
        direction: CashDirection.INCOME,
        amount: A.incomeOther,
        incomeBasis: CashIncomeBasis.OTHER,
        description: 'A other income',
        cityId: cities.a.id,
        createdById: users.adminA.id,
        createdAt: PERIOD_AT,
      },
      {
        direction: CashDirection.INCOME,
        amount: A.incomeOrder,
        incomeBasis: CashIncomeBasis.ORDER,
        description: 'A order income',
        cityId: cities.a.id,
        orderId: orderA1.id,
        createdById: users.adminA.id,
        createdAt: PERIOD_AT,
      },
      {
        direction: CashDirection.EXPENSE,
        amount: A.expenseOperating,
        expenseBasis: CashExpenseBasis.OPERATING,
        description: 'A operating expense',
        cityId: cities.a.id,
        documentPath: 'cash/a-expense.pdf',
        createdById: users.adminA.id,
        createdAt: PERIOD_AT,
      },
      {
        direction: CashDirection.INCOME,
        amount: B.incomeOther,
        incomeBasis: CashIncomeBasis.OTHER,
        description: 'B other income',
        cityId: cities.b.id,
        createdById: users.adminB.id,
        createdAt: PERIOD_AT,
      },
      {
        direction: CashDirection.EXPENSE,
        amount: B.expenseOperating,
        expenseBasis: CashExpenseBasis.OPERATING,
        description: 'B operating expense',
        cityId: cities.b.id,
        documentPath: 'cash/b-expense.pdf',
        createdById: users.adminB.id,
        createdAt: PERIOD_AT,
      },
      {
        direction: CashDirection.INCOME,
        amount: NULL_CITY_INCOME,
        incomeBasis: CashIncomeBasis.OTHER,
        description: 'Global income without city',
        cityId: null,
        createdById: users.owner.id,
        createdAt: PERIOD_AT,
      },
    ],
  });

  await prisma.claim.createMany({
    data: [
      {
        orderId: orderA1.id,
        type: ClaimType.PRICE_DISSATISFIED,
        cityId: cities.a.id,
        createdAt: PERIOD_AT,
      },
      {
        orderId: orderB1.id,
        type: ClaimType.MASTER_BROKE,
        cityId: cities.b.id,
        createdAt: PERIOD_AT,
      },
    ],
  });

  await prisma.adDailyReport.createMany({
    data: [
      {
        reportDate: PERIOD_AT,
        cityId: cities.a.id,
        avitoAdsCount: A.avitoAds,
        promotersCount: 2,
        leafletsSpread: 100,
        cardsSpread: 10,
        createdById: users.adminA.id,
      },
      {
        reportDate: PERIOD_AT,
        cityId: cities.b.id,
        avitoAdsCount: B.avitoAds,
        promotersCount: 20,
        leafletsSpread: 1000,
        cardsSpread: 100,
        createdById: users.adminB.id,
      },
    ],
  });

}

describe('Cash & Reports branch isolation (e2e) — T13', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeedBaseDataResult;

  const directorANetSum = A.orderToCompany1 + A.orderToCompany2;
  const ownerNetSum =
    directorANetSum + B.orderToCompany1 + B.orderToCompany2;
  const directorACashIncome = A.incomeOther + A.incomeOrder;
  const ownerCashIncome =
    directorACashIncome + B.incomeOther + NULL_CITY_INCOME;
  const branchBCashIncome = B.incomeOther;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedBaseData(prisma);
    await seedCashReportsFixtures(prisma, seed);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET/POST /api/cash', () => {
    it('adminA: GET /api/cash — только транзакции филиала A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cash')
        .query({ from: REPORT_FROM, to: REPORT_TO })
        .set(
          'Authorization',
          authHeader(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      expect(res.body).toEqual(expect.any(Array));
      expect(res.body.length).toBeGreaterThan(0);
      for (const tx of res.body) {
        expect(tx.cityId).toBe(seed.cities.a.id);
      }
      const amounts = res.body.map((tx: { amount: string }) => Number(tx.amount));
      expect(amounts).toContain(A.incomeOther);
      expect(amounts).toContain(A.incomeOrder);
      expect(amounts).not.toContain(B.incomeOther);
      expect(amounts).not.toContain(NULL_CITY_INCOME);
    });

    it('adminA: POST /api/cash/income с cityId=B — 403', async () => {
      await request(app.getHttpServer())
        .post('/api/cash/income')
        .query({ cityId: seed.cities.b.id })
        .set(
          'Authorization',
          authHeader(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({
          amount: 99,
          incomeBasis: CashIncomeBasis.OTHER,
          description: 'forbidden cross-branch',
        })
        .expect(403);
    });

    it('adminA: POST /api/cash/income без cityId — создаётся в филиале A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cash/income')
        .set(
          'Authorization',
          authHeader(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({
          amount: 42,
          incomeBasis: CashIncomeBasis.OTHER,
          description: 'auto city A',
        })
        .expect(201);

      expect(res.body.cityId).toBe(seed.cities.a.id);
    });

    it('directorA: POST /api/cash/income — 403 (нет прав на приход)', async () => {
      await request(app.getHttpServer())
        .post('/api/cash/income')
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .send({
          amount: 50,
          incomeBasis: CashIncomeBasis.OTHER,
        })
        .expect(403);
    });

    it('directorA: POST /api/cash/expense без документа — 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cash/expense')
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .send({
          amount: 100,
          expenseBasis: CashExpenseBasis.SALARY_DIR,
          description: 'no document',
        })
        .expect(400);

      expect(res.body.message).toContain('Без документа');
    });

    it('OWNER: GET /api/cash — транзакции A, B и cityId=null', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cash')
        .query({ from: REPORT_FROM, to: REPORT_TO })
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const cityIds = res.body.map((tx: { cityId: string | null }) => tx.cityId);
      expect(cityIds).toContain(seed.cities.a.id);
      expect(cityIds).toContain(seed.cities.b.id);
      expect(cityIds).toContain(null);

      const amounts = res.body.map((tx: { amount: string }) => Number(tx.amount));
      expect(amounts).toContain(A.incomeOther);
      expect(amounts).toContain(B.incomeOther);
      expect(amounts).toContain(NULL_CITY_INCOME);
    });

    it('OWNER: GET /api/cash?cityId=B — только транзакции B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cash')
        .query({ from: REPORT_FROM, to: REPORT_TO, cityId: seed.cities.b.id })
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      for (const tx of res.body) {
        expect(tx.cityId).toBe(seed.cities.b.id);
      }
      const amounts = res.body.map((tx: { amount: string }) => Number(tx.amount));
      expect(amounts).toContain(B.incomeOther);
      expect(amounts).not.toContain(A.incomeOther);
      expect(amounts).not.toContain(NULL_CITY_INCOME);
    });
  });

  describe('GET /api/reports/* — directorA (только филиал A)', () => {
    const query = { from: REPORT_FROM, to: REPORT_TO };

    it('GET /api/reports/cash — byCity/totals без данных B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/cash')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .expect(200);

      const cityIds = res.body.byCity.map(
        (row: { cityId: string | null }) => row.cityId,
      );
      expect(cityIds).toContain(seed.cities.a.id);
      expect(cityIds).not.toContain(seed.cities.b.id);

      expect(Number(res.body.totals.incomeTotal)).toBe(directorACashIncome);
      expect(Number(res.body.totals.incomeTotal)).not.toBe(ownerCashIncome);
      expect(Number(res.body.totals.masterSalary)).toBe(
        A.orderMasterSalary1 + A.orderMasterSalary2,
      );
    });

    it('GET /api/reports/closed — netSum только по заявкам A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/closed')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .expect(200);

      expect(res.body.closed).toBe(2);
      expect(Number(res.body.netSum)).toBe(directorANetSum);
      expect(Number(res.body.netSum)).not.toBe(ownerNetSum);
    });

    it('GET /api/reports/masters — только мастер филиала A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/masters')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].master).toBe('Master A');
      expect(res.body[0].count).toBe(2);
      expect(Number(res.body[0].net)).toBe(directorANetSum);
    });

    it('GET /api/reports/ads — метрики только филиала A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/ads')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .expect(200);

      expect(res.body.avitoAds).toBe(A.avitoAds);
      expect(res.body.avitoAds).not.toBe(B.avitoAds);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].cityId).toBe(seed.cities.a.id);
    });

    it('GET /api/reports/claims — только претензии филиала A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/claims')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.directorA.id, Role.DIRECTOR, 'directorA'),
        )
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].cityId).toBe(seed.cities.a.id);
      expect(res.body[0].orderId).toBeDefined();
    });
  });

  describe('GET /api/reports/* — OWNER (все филиалы / фильтр B)', () => {
    const query = { from: REPORT_FROM, to: REPORT_TO };

    it('GET /api/reports/cash — агрегаты по всем филиалам', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/cash')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const cityIds = res.body.byCity.map(
        (row: { cityId: string | null }) => row.cityId,
      );
      expect(cityIds).toContain(seed.cities.a.id);
      expect(cityIds).toContain(seed.cities.b.id);
      expect(cityIds).toContain(null);
      expect(Number(res.body.totals.incomeTotal)).toBe(ownerCashIncome);
    });

    it('GET /api/reports/cash?cityId=B — только филиал B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/cash')
        .query({ ...query, cityId: seed.cities.b.id })
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const cityIds = res.body.byCity.map(
        (row: { cityId: string | null }) => row.cityId,
      );
      expect(cityIds).toEqual([seed.cities.b.id]);
      expect(Number(res.body.totals.incomeTotal)).toBe(branchBCashIncome);
      expect(Number(res.body.totals.masterSalary)).toBe(
        B.orderMasterSalary1 + B.orderMasterSalary2,
      );
    });

    it('GET /api/reports/closed — netSum по всем DONE-заявкам', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/closed')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.closed).toBe(4);
      expect(Number(res.body.netSum)).toBe(ownerNetSum);
    });

    it('GET /api/reports/closed?cityId=B — netSum только B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/closed')
        .query({ ...query, cityId: seed.cities.b.id })
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.closed).toBe(2);
      expect(Number(res.body.netSum)).toBe(B.orderToCompany1 + B.orderToCompany2);
    });

    it('GET /api/reports/masters — мастера A и B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/masters')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const names = res.body.map((row: { master: string }) => row.master).sort();
      expect(names).toEqual(['Master A', 'Master B']);
    });

    it('GET /api/reports/ads?cityId=B — только отчёты B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/ads')
        .query({ ...query, cityId: seed.cities.b.id })
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.avitoAds).toBe(B.avitoAds);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].cityId).toBe(seed.cities.b.id);
    });

    it('GET /api/reports/claims — претензии обоих филиалов', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/claims')
        .query(query)
        .set(
          'Authorization',
          authHeader(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const cityIds = res.body.map((c: { cityId: string }) => c.cityId).sort();
      expect(cityIds).toEqual(
        [seed.cities.a.id, seed.cities.b.id].sort(),
      );
    });
  });
});
