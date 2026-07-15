import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  OrderStatus,
  OrderType,
  Role,
  SourceKind,
  SourceOur,
  UserStatus,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildOrderPrefix, buildPublicId } from '../src/common/utils/order-id';
import {
  makeToken,
  SeedBaseDataResult,
  seedBaseData,
} from './helpers/auth';
import { createTestApp, resetDb } from './setup-e2e';

type UserKey = keyof SeedBaseDataResult['users'];

function validOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    clientName: 'Иван Тестов',
    clientPhone: '79001234567',
    type: OrderType.NEW,
    sourceKind: SourceKind.OUR,
    sourceOur: SourceOur.AVITO,
    address: 'ул. Тестовая, 1',
    ...overrides,
  };
}

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeedBaseDataResult;

  function bearer(userKey: UserKey): string {
    const user = seed.users[userKey];
    return `Bearer ${makeToken(user.id, user.role, user.login)}`;
  }

  async function createOrderAs(
    userKey: UserKey,
    body: Record<string, unknown> = validOrderBody(),
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', bearer(userKey))
      .send(body);

    expect([200, 201]).toContain(res.status);
    return res.body as {
      id: string;
      publicId: string;
      clientId: string;
      cityId: string | null;
      client: { id: string; phoneNormalized: string; name: string };
    };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedBaseData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/orders', () => {
    it('creates a valid order as dispatcher with publicId and client', async () => {
      const body = validOrderBody();
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .send(body);

      expect([200, 201]).toContain(res.status);
      expect(res.body.publicId).toMatch(/^\d{9}$/);

      const prefix = buildOrderPrefix(new Date());
      expect(res.body.publicId).toBe(buildPublicId(prefix, 1));

      expect(res.body.client).toMatchObject({
        name: body.clientName,
        phoneNormalized: '79001234567',
      });
      expect(res.body.cityId).toBe(seed.cities.a.id);

      const clientCount = await prisma.client.count({
        where: { phoneNormalized: '79001234567' },
      });
      expect(clientCount).toBe(1);
    });

    it('reuses an existing client for the same phone and name', async () => {
      const body = validOrderBody();
      const first = await createOrderAs('dispatcherA', body);
      const second = await createOrderAs('dispatcherA', {
        ...body,
        address: 'ул. Другая, 2',
      });

      expect(second.clientId).toBe(first.clientId);
      expect(await prisma.client.count()).toBe(1);
      expect(await prisma.order.count()).toBe(2);
    });

    it('returns 400 when sourceKind OUR is sent without sourceOur', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .send(validOrderBody({ sourceOur: undefined }));

      expect(res.status).toBe(400);
    });

    it('returns 400 when sourceKind PARTNER is sent without partnerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .send(
          validOrderBody({
            sourceKind: SourceKind.PARTNER,
            sourceOur: undefined,
          }),
        );

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid phone', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .send(validOrderBody({ clientPhone: '123' }));

      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-whitelisted field', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .send(validOrderBody({ extraField: 'forbidden' }));

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/orders', () => {
    it('returns created orders in the list', async () => {
      const created = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearer('dispatcherA'))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.id,
            publicId: created.publicId,
          }),
        ]),
      );
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns a single order by id', async () => {
      const created = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .get(`/api/orders/${created.id}`)
        .set('Authorization', bearer('dispatcherA'))
        .expect(200);

      expect(res.body).toMatchObject({
        id: created.id,
        publicId: created.publicId,
        client: expect.objectContaining({
          id: created.client.id,
          name: 'Иван Тестов',
        }),
      });
    });
  });

  describe('PATCH /api/orders/:id', () => {
    it('returns 403 when dispatcher sets IN_PROGRESS', async () => {
      const created = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${created.id}`)
        .set('Authorization', bearer('dispatcherA'))
        .send({ status: OrderStatus.IN_PROGRESS });

      expect(res.status).toBe(403);
    });

    it('allows admin to set IN_PROGRESS', async () => {
      const created = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${created.id}`)
        .set('Authorization', bearer('adminA'))
        .send({ status: OrderStatus.IN_PROGRESS })
        .expect(200);

      expect(res.body.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('returns 400 for DONE when paid > 500 without required documents', async () => {
      const created = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .patch(`/api/orders/${created.id}`)
        .set('Authorization', bearer('adminA'))
        .send({ status: OrderStatus.DONE, paid: 600 });

      expect(res.status).toBe(400);
      expect(String(res.body.message)).toContain('>500');
    });
  });

  describe('POST /api/orders/:id/repeat', () => {
    it('creates a repeat order for the same client', async () => {
      const source = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .post(`/api/orders/${source.id}/repeat`)
        .set('Authorization', bearer('dispatcherA'))
        .expect((response) => {
          expect([200, 201]).toContain(response.status);
        });

      expect(res.body.id).not.toBe(source.id);
      expect(res.body.type).toBe(OrderType.REPEAT);
      expect(res.body.isRepeat).toBe(true);
      expect(res.body.clientId).toBe(source.clientId);
      expect(res.body.comment).toContain(source.publicId);
    });
  });

  describe('POST /api/orders/:id/warranty', () => {
    it('marks the order as warranty', async () => {
      const source = await createOrderAs('dispatcherA');

      const res = await request(app.getHttpServer())
        .post(`/api/orders/${source.id}/warranty`)
        .set('Authorization', bearer('adminA'))
        .expect((response) => {
          expect([200, 201]).toContain(response.status);
        });

      expect(res.body.id).toBe(source.id);
      expect(res.body.type).toBe(OrderType.WARRANTY);
      expect(res.body.isWarranty).toBe(true);
    });
  });

  describe('Branch isolation', () => {
    async function createMasterB() {
      const passwordHash = await bcrypt.hash(seed.password, 10);
      const user = await prisma.user.create({
        data: {
          login: 'masterB',
          passwordHash,
          fullName: 'Master B',
          role: Role.MASTER,
          status: UserStatus.ACTIVE,
          cityId: seed.cities.b.id,
          hiredAt: new Date(),
        },
      });
      const master = await prisma.master.create({
        data: {
          userId: user.id,
          cityId: seed.cities.b.id,
          status: UserStatus.ACTIVE,
        },
      });
      return master;
    }

    it('limits adminA to city A orders and blocks cross-branch master assignment', async () => {
      const orderA = await createOrderAs('adminA', validOrderBody({ clientPhone: '79001111111' }));
      const orderB = await createOrderAs('adminB', validOrderBody({ clientPhone: '79002222222' }));
      const masterB = await createMasterB();

      const listRes = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearer('adminA'))
        .expect(200);

      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(orderA.id);
      expect(listRes.body.some((o: { id: string }) => o.id === orderB.id)).toBe(false);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/orders/${orderB.id}`)
        .set('Authorization', bearer('adminA'))
        .send({ masterId: masterB.id });

      expect(patchRes.status).toBe(403);
    });

    it('lets owner see all branches and filter by cityId', async () => {
      const orderA = await createOrderAs('adminA', validOrderBody({ clientPhone: '79003333333' }));
      const orderB = await createOrderAs('adminB', validOrderBody({ clientPhone: '79004444444' }));

      const allRes = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', bearer('owner'))
        .expect(200);

      expect(allRes.body).toHaveLength(2);
      expect(allRes.body.map((o: { id: string }) => o.id).sort()).toEqual(
        [orderA.id, orderB.id].sort(),
      );

      const cityBRes = await request(app.getHttpServer())
        .get('/api/orders')
        .query({ cityId: seed.cities.b.id })
        .set('Authorization', bearer('owner'))
        .expect(200);

      expect(cityBRes.body).toHaveLength(1);
      expect(cityBRes.body[0]).toMatchObject({
        id: orderB.id,
        cityId: seed.cities.b.id,
      });
    });
  });
});
