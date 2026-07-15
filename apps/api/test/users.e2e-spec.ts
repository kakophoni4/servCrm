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

describe('Users (e2e)', () => {
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

  describe('GET /api/users', () => {
    it('adminA sees only city-A employees and self, not MASTER (happy-path + isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const ids = res.body.map((u: { id: string }) => u.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          seed.users.adminA.id,
          seed.users.dispatcherA.id,
          seed.users.directorA.id,
        ]),
      );
      expect(ids).not.toContain(seed.users.adminB.id);
      expect(ids).not.toContain(seed.users.owner.id);
      expect(ids).not.toContain(seed.users.masterA.id);
    });

    it('OWNER sees all employees except MASTER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      const ids = res.body.map((u: { id: string }) => u.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          seed.users.owner.id,
          seed.users.adminA.id,
          seed.users.adminB.id,
          seed.users.dispatcherA.id,
          seed.users.directorA.id,
        ]),
      );
      expect(ids).not.toContain(seed.users.masterA.id);
    });

    it('returns 403 for MASTER (RBAC)', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set(
          'Authorization',
          bearer(seed.users.masterA.id, Role.MASTER, 'masterA'),
        )
        .expect(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('adminA can read self (happy-path)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/${seed.users.adminA.id}`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      expect(res.body).toMatchObject({
        id: seed.users.adminA.id,
        login: 'adminA',
        role: Role.ADMIN,
        cityId: seed.cities.a.id,
      });
    });

    it('adminA gets 403 reading adminB (branch isolation)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/${seed.users.adminB.id}`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(403);

      expect(res.body.message).toContain('филиала');
    });

    it('OWNER can read adminB from another branch', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/${seed.users.adminB.id}`)
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body).toMatchObject({
        id: seed.users.adminB.id,
        login: 'adminB',
        cityId: seed.cities.b.id,
      });
    });
  });
});
