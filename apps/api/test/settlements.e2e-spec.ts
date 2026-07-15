import { INestApplication } from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  Role,
  SourceKind,
  SourceOur,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  SeedBaseDataResult,
  makeToken,
  seedBaseData,
} from './helpers/auth';
import { createTestApp, resetDb } from './setup-e2e';

function bearer(userId: string, role: Role, login: string): string {
  return `Bearer ${makeToken(userId, role, login)}`;
}

describe('Settlements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeedBaseDataResult;
  let masterAId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedBaseData(prisma);
    const master = await prisma.master.findFirstOrThrow({
      where: { userId: seed.users.masterA.id },
    });
    masterAId = master.id;

    // DONE-заявка с toCompany — для автосуммы сдачи
    const client = await prisma.client.create({
      data: {
        name: 'Клиент сдачи',
        phoneNormalized: '79001112233',
        cityId: seed.cities.a.id,
      },
    });
    await prisma.order.create({
      data: {
        publicId: 'SETTLE-A-1',
        seqPrefix: 'S',
        seq: 1,
        clientId: client.id,
        type: OrderType.NEW,
        sourceKind: SourceKind.OUR,
        sourceOur: SourceOur.AVITO,
        address: 'Тест',
        status: OrderStatus.DONE,
        masterId: masterAId,
        cityId: seed.cities.a.id,
        createdAt: new Date('2026-01-15T12:00:00.000Z'),
        payment: {
          create: {
            paid: 3000,
            workSum: 3000,
            masterSalary: 1500,
            toCompany: 1500,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createBody = {
    masterId: '',
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
  };

  async function createSettlementAsAdminA() {
    const res = await request(app.getHttpServer())
      .post('/api/settlements')
      .set(
        'Authorization',
        bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
      )
      .send({ ...createBody, masterId: masterAId })
      .expect(201);
    return res.body as { id: string; cityId: string; amount: string };
  }

  describe('POST /api/settlements', () => {
    it('adminA creates settlement with auto amount from toCompany', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/settlements')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ ...createBody, masterId: masterAId })
        .expect(201);

      expect(res.body).toMatchObject({
        masterId: masterAId,
        cityId: seed.cities.a.id,
      });
      expect(Number(res.body.amount)).toBe(1500);
    });
  });

  describe('GET /api/settlements', () => {
    it('adminA sees settlement, adminB does not (branch isolation)', async () => {
      const created = await createSettlementAsAdminA();

      const resA = await request(app.getHttpServer())
        .get('/api/settlements')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/api/settlements')
        .set(
          'Authorization',
          bearer(seed.users.adminB.id, Role.ADMIN, 'adminB'),
        )
        .expect(200);

      expect(resA.body.map((s: { id: string }) => s.id)).toContain(created.id);
      expect(resB.body.map((s: { id: string }) => s.id)).not.toContain(
        created.id,
      );
    });

    it('OWNER sees all settlements', async () => {
      const created = await createSettlementAsAdminA();

      const res = await request(app.getHttpServer())
        .get('/api/settlements')
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.map((s: { id: string }) => s.id)).toContain(created.id);
    });

    it('returns 403 for DISPATCHER (RBAC)', async () => {
      await request(app.getHttpServer())
        .get('/api/settlements')
        .set(
          'Authorization',
          bearer(
            seed.users.dispatcherA.id,
            Role.DISPATCHER,
            'dispatcherA',
          ),
        )
        .expect(403);
    });
  });

  describe('POST /api/settlements/:id/confirm', () => {
    it('first confirm sets confirmedOnce, second sets confirmedTwice (happy-path)', async () => {
      const created = await createSettlementAsAdminA();

      const first = await request(app.getHttpServer())
        .post(`/api/settlements/${created.id}/confirm`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(201);

      expect(first.body).toMatchObject({
        id: created.id,
        confirmedOnce: true,
        confirmedTwice: false,
      });

      const second = await request(app.getHttpServer())
        .post(`/api/settlements/${created.id}/confirm`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(201);

      expect(second.body).toMatchObject({
        id: created.id,
        confirmedOnce: true,
        confirmedTwice: true,
        confirmedById: seed.users.adminA.id,
      });
      expect(second.body.confirmedAt).toEqual(expect.any(String));
    });

    it('adminB gets 403 confirming foreign branch settlement (branch isolation)', async () => {
      const created = await createSettlementAsAdminA();

      const res = await request(app.getHttpServer())
        .post(`/api/settlements/${created.id}/confirm`)
        .set(
          'Authorization',
          bearer(seed.users.adminB.id, Role.ADMIN, 'adminB'),
        )
        .expect(403);

      expect(res.body.message).toContain('филиала');
    });
  });

  describe('POST /api/settlements/:id/pay', () => {
    it('OWNER can mark remaining amount as paid without cash tx', async () => {
      const created = await createSettlementAsAdminA();
      const cashBefore = await prisma.cashTx.count();

      const res = await request(app.getHttpServer())
        .post(`/api/settlements/${created.id}/pay`)
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .send({ amount: 1500 })
        .expect(201);

      expect(Number(res.body.paidAmount)).toBe(1500);
      expect(await prisma.cashTx.count()).toBe(cashBefore);
    });
  });
});
