import { INestApplication } from '@nestjs/common';
import {
  ClaimType,
  OrderType,
  PrismaClient,
  Role,
  SourceKind,
  SourceOur,
} from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  makeToken,
  SeedBaseDataResult,
  seedBaseData,
} from './helpers/auth';
import { createTestApp, resetDb } from './setup-e2e';

function bearer(
  seed: SeedBaseDataResult,
  key: keyof SeedBaseDataResult['users'],
): string {
  const user = seed.users[key];
  return `Bearer ${makeToken(user.id, user.role, user.login)}`;
}

async function seedOrder(
  prisma: PrismaClient,
  cityId: string,
  tag: string,
) {
  const client = await prisma.client.create({
    data: {
      phoneNormalized: `7900${tag}`,
      name: `Client ${tag}`,
      cityId,
    },
  });

  return prisma.order.create({
    data: {
      publicId: `claim-order-${tag}`,
      seqPrefix: 'A',
      seq: 1,
      clientId: client.id,
      type: OrderType.NEW,
      sourceKind: SourceKind.OUR,
      sourceOur: SourceOur.AVITO,
      address: `Address ${tag}`,
      cityId,
    },
  });
}

describe('Claims (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeedBaseDataResult;

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

  it('adminA creates a claim and lists it (happy path)', async () => {
    const order = await seedOrder(prisma, seed.cities.a.id, 'a1');

    const createRes = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        orderId: order.id,
        type: ClaimType.POLICE,
        refundSum: 500,
        orderSum: 3000,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      orderId: order.id,
      type: ClaimType.POLICE,
      cityId: seed.cities.a.id,
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .expect(200);

    expect(listRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createRes.body.id }),
      ]),
    );
  });

  it('dispatcherA can list claims (RBAC allowed role)', async () => {
    await request(app.getHttpServer())
      .get('/api/claims')
      .set('Authorization', bearer(seed, 'dispatcherA'))
      .expect(200);
  });

  it('masterA gets 403 on POST /api/claims (RBAC forbidden role)', async () => {
    const order = await seedOrder(prisma, seed.cities.a.id, 'rbac');

    await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'masterA'))
      .send({
        orderId: order.id,
        type: ClaimType.MASTER_BROKE,
      })
      .expect(403);
  });

  it('adminB does not see city A claim in GET /api/claims (branch isolation)', async () => {
    const order = await seedOrder(prisma, seed.cities.a.id, 'iso-list');

    const createRes = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        orderId: order.id,
        type: ClaimType.PRICE_DISSATISFIED,
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/claims')
      .set('Authorization', bearer(seed, 'adminB'))
      .expect(200);

    expect(listRes.body).toEqual([]);
    expect(
      listRes.body.find((row: { id: string }) => row.id === createRes.body.id),
    ).toBeUndefined();
  });

  it('adminB gets 403 on PATCH /api/claims/:id (branch isolation)', async () => {
    const order = await seedOrder(prisma, seed.cities.a.id, 'iso-upd');

    const createRes = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        orderId: order.id,
        type: ClaimType.POLICE,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/claims/${createRes.body.id}`)
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ refundSum: 999 })
      .expect(403);
  });

  it('adminB gets 403 on PATCH /api/claims/:id/close (branch isolation)', async () => {
    const order = await seedOrder(prisma, seed.cities.a.id, 'iso-close');

    const createRes = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        orderId: order.id,
        type: ClaimType.MASTER_BROKE,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/claims/${createRes.body.id}/close`)
      .set('Authorization', bearer(seed, 'adminB'))
      .send({})
      .expect(403);
  });

  it('OWNER sees claims from all branches', async () => {
    const orderA = await seedOrder(prisma, seed.cities.a.id, 'own-a');
    const orderB = await seedOrder(prisma, seed.cities.b.id, 'own-b');

    const claimA = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ orderId: orderA.id, type: ClaimType.POLICE })
      .expect(201);

    const claimB = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ orderId: orderB.id, type: ClaimType.POLICE })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/claims')
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    const ids = listRes.body.map((row: { id: string }) => row.id);
    expect(ids).toEqual(expect.arrayContaining([claimA.body.id, claimB.body.id]));
  });

  it('OWNER filters claims with ?cityId=B', async () => {
    const orderA = await seedOrder(prisma, seed.cities.a.id, 'filt-a');
    const orderB = await seedOrder(prisma, seed.cities.b.id, 'filt-b');

    await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ orderId: orderA.id, type: ClaimType.POLICE })
      .expect(201);

    const claimB = await request(app.getHttpServer())
      .post('/api/claims')
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ orderId: orderB.id, type: ClaimType.POLICE })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/claims')
      .query({ cityId: seed.cities.b.id })
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      id: claimB.body.id,
      cityId: seed.cities.b.id,
    });
  });
});
