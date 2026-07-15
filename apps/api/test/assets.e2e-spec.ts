import { INestApplication } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
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

describe('Assets (e2e)', () => {
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

  it('OWNER creates an asset and lists it (happy path)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Ноутбук',
        name: 'Lenovo ThinkPad',
        condition: 'Хорошее',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    expect(createRes.body).toMatchObject({
      title: 'Ноутбук',
      name: 'Lenovo ThinkPad',
      cityId: seed.cities.a.id,
      status: AssetStatus.ACTIVE,
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    expect(listRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createRes.body.id }),
      ]),
    );
  });

  it('adminA can list assets (RBAC allowed role)', async () => {
    await request(app.getHttpServer())
      .get('/api/assets')
      .set('Authorization', bearer(seed, 'adminA'))
      .expect(200);
  });

  it('adminA gets 403 on POST /api/assets (RBAC — only OWNER)', async () => {
    await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'adminA'))
      .send({
        title: 'Принтер',
        name: 'HP LaserJet',
        cityId: seed.cities.a.id,
      })
      .expect(403);
  });

  it('adminA GET /api/assets returns only city A assets (branch isolation)', async () => {
    await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Стол',
        name: 'Офисный стол A',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    await prisma.asset.create({
      data: {
        title: 'Стул',
        name: 'Офисный стул B',
        cityId: seed.cities.b.id,
      },
    });

    const listRes = await request(app.getHttpServer())
      .get('/api/assets')
      .set('Authorization', bearer(seed, 'adminA'))
      .expect(200);

    expect(listRes.body.length).toBeGreaterThan(0);
    expect(
      listRes.body.every(
        (row: { cityId: string | null }) => row.cityId === seed.cities.a.id,
      ),
    ).toBe(true);
  });

  it('adminB gets 403 on write-off of city A asset (branch isolation)', async () => {
    const assetA = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Монитор',
        name: 'Dell 24"',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/assets/${assetA.body.id}/write-off`)
      .set('Authorization', bearer(seed, 'adminB'))
      .send({ note: 'Списание' })
      .expect(403);
  });

  it('adminA gets 403 on write-off (RBAC — only OWNER)', async () => {
    const assetA = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Клавиатура',
        name: 'Logitech K120',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/assets/${assetA.body.id}/write-off`)
      .set('Authorization', bearer(seed, 'adminA'))
      .send({ note: 'Списание' })
      .expect(403);
  });

  it('OWNER sees assets from all branches', async () => {
    const assetA = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Телефон A',
        name: 'iPhone',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    const assetB = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Телефон B',
        name: 'Samsung',
        cityId: seed.cities.b.id,
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    const ids = listRes.body.map((row: { id: string }) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([assetA.body.id, assetB.body.id]),
    );
  });

  it('OWNER filters assets with ?cityId=B', async () => {
    await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Проектор A',
        name: 'Epson A',
        cityId: seed.cities.a.id,
      })
      .expect(201);

    const assetB = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Проектор B',
        name: 'Epson B',
        cityId: seed.cities.b.id,
      })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/assets')
      .query({ cityId: seed.cities.b.id })
      .set('Authorization', bearer(seed, 'owner'))
      .expect(200);

    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({
      id: assetB.body.id,
      cityId: seed.cities.b.id,
    });
  });

  it('OWNER can write off asset in any branch', async () => {
    const assetB = await request(app.getHttpServer())
      .post('/api/assets')
      .set('Authorization', bearer(seed, 'owner'))
      .send({
        title: 'Сейф',
        name: 'Металлический',
        cityId: seed.cities.b.id,
      })
      .expect(201);

    const writeOffRes = await request(app.getHttpServer())
      .post(`/api/assets/${assetB.body.id}/write-off`)
      .set('Authorization', bearer(seed, 'owner'))
      .send({ note: 'Устарел' })
      .expect(201);

    expect(writeOffRes.body).toMatchObject({
      id: assetB.body.id,
      status: AssetStatus.WRITTEN_OFF,
      writeOffNote: 'Устарел',
    });
    expect(writeOffRes.body.writtenOffAt).toBeTruthy();
  });
});
