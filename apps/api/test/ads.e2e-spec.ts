import { INestApplication } from '@nestjs/common';
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

const REPORT_DATE = '2026-07-15';

describe('Ads (e2e)', () => {
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

  it('adminA creates a report and lists it (happy path)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        reportDate: REPORT_DATE,
        promotersCount: 2,
        leafletsSpread: 100,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      cityId: seed.cities.a.id,
      promotersCount: 2,
      leafletsSpread: 100,
      createdById: seed.users.adminA.id,
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .expect(200);

    expect(listRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createRes.body.id }),
      ]),
    );
  });

  it('adminA creates report with explicit cityId=A (happy path variant)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        reportDate: '2026-07-16',
        cityId: seed.cities.a.id,
        avitoAdsCount: 5,
      })
      .expect(201);

    expect(createRes.body.cityId).toBe(seed.cities.a.id);
  });

  it('directorA can list reports (RBAC allowed role)', async () => {
    await request(app.getHttpServer())
      .get('/api/ads')
      .set('Authorization', bearer(seed, 'directorA'))
      .expect(200);
  });

  it('dispatcherA gets 403 on GET /api/ads (RBAC forbidden role)', async () => {
    await request(app.getHttpServer())
      .get('/api/ads')
      .set('Authorization', bearer(seed, 'dispatcherA'))
      .expect(403);
  });

  it('adminA gets 403 when POST with cityId=B (branch isolation)', async () => {
    await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        reportDate: REPORT_DATE,
        cityId: seed.cities.b.id,
        promotersCount: 1,
      })
      .expect(403);
  });

  it('adminA GET /api/ads returns only city A reports (branch isolation)', async () => {
    await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ reportDate: REPORT_DATE, promotersCount: 3 })
      .expect(201);

    await prisma.adDailyReport.create({
      data: {
        reportDate: new Date('2026-07-14'),
        cityId: seed.cities.b.id,
        promotersCount: 7,
        createdById: seed.users.adminB.id,
      },
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .expect(200);

    expect(listRes.body.length).toBeGreaterThan(0);
    expect(
      listRes.body.every(
        (row: { cityId: string | null }) => row.cityId === seed.cities.a.id,
      ),
    ).toBe(true);
  });

  it('OWNER sees reports from all branches', async () => {
    const reportA = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ reportDate: REPORT_DATE, promotersCount: 1 })
      .expect(201);

    const reportB = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ reportDate: '2026-07-14', promotersCount: 2 })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/ads')
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    const ids = listRes.body.map((row: { id: string }) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([reportA.body.id, reportB.body.id]),
    );
  });

  it('OWNER filters reports with ?cityId=B', async () => {
    await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ reportDate: REPORT_DATE, promotersCount: 1 })
      .expect(201);

    const reportB = await request(app.getHttpServer())
      .post('/api/ads')
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ reportDate: '2026-07-14', promotersCount: 4 })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/ads')
      .query({ cityId: seed.cities.b.id })
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      id: reportB.body.id,
      cityId: seed.cities.b.id,
    });
  });
});
