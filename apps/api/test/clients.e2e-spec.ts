import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
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

describe('Clients (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seed: SeedBaseDataResult;
  let clientAId: string;
  let clientBId: string;
  const sharedPhone = '79005551234';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    seed = await seedBaseData(prisma);

    const clientA = await prisma.client.create({
      data: {
        phoneNormalized: sharedPhone,
        name: 'Клиент A',
        cityId: seed.cities.a.id,
      },
    });
    const clientB = await prisma.client.create({
      data: {
        phoneNormalized: sharedPhone,
        name: 'Клиент B',
        cityId: seed.cities.b.id,
      },
    });
    clientAId = clientA.id;
    clientBId = clientB.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/clients', () => {
    it('adminA list returns only city-A clients (branch isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clients')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(clientAId);
      expect(ids).not.toContain(clientBId);
    });

    it('OWNER sees clients from all branches', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clients')
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).toEqual(expect.arrayContaining([clientAId, clientBId]));
    });

    it('OWNER ?cityId filters to one branch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clients')
        .query({ cityId: seed.cities.b.id })
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(clientBId);
      expect(ids).not.toContain(clientAId);
    });

    it('?phone= search is global and returns clients from both branches', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/clients')
        .query({ phone: '+7 (900) 555-12-34' })
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const ids = res.body.map((c: { id: string }) => c.id);
      expect(ids).toEqual(expect.arrayContaining([clientAId, clientBId]));
    });

    it('returns 403 for MASTER (RBAC)', async () => {
      await request(app.getHttpServer())
        .get('/api/clients')
        .set(
          'Authorization',
          bearer(seed.users.masterA.id, Role.MASTER, 'masterA'),
        )
        .expect(403);
    });
  });

  describe('GET /api/clients/:id', () => {
    it('adminA can read city-A client (happy-path)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/clients/${clientAId}`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      expect(res.body).toMatchObject({
        id: clientAId,
        name: 'Клиент A',
        cityId: seed.cities.a.id,
      });
    });

    it('adminA gets 403 reading city-B client (branch isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/clients/${clientBId}`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(403);

      expect(res.body.message).toContain('филиала');
    });

    it('OWNER can read city-B client', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/clients/${clientBId}`)
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body).toMatchObject({
        id: clientBId,
        cityId: seed.cities.b.id,
      });
    });
  });
});
