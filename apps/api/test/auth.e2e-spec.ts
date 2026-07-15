import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  SeedBaseDataResult,
  seedBaseData,
} from './helpers/auth';
import { createTestApp, resetDb } from './setup-e2e';

function makeExpiredToken(
  userId: string,
  role: Role,
  login: string,
): string {
  const jwtService = new JwtService({
    secret: process.env.JWT_SECRET ?? 'dev-change-me',
  });
  return jwtService.sign(
    { sub: userId, login, role },
    { expiresIn: '-1s' },
  );
}

describe('Auth (e2e)', () => {
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

  describe('POST /api/auth/login', () => {
    it.each([
      { key: 'owner', login: 'owner', role: Role.OWNER },
      { key: 'adminA', login: 'admina', role: Role.ADMIN },
      { key: 'dispatcherA', login: 'dispatchera', role: Role.DISPATCHER },
    ] as const)(
      'returns 200 with accessToken and user for $role',
      async ({ key, login, role }) => {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ login, password: seed.password })
          .expect(200);

        expect(res.body.accessToken).toEqual(expect.any(String));
        expect(res.body.user).toMatchObject({
          id: seed.users[key].id,
          login,
          role,
        });
      },
    );

    it('returns 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: 'owner', password: 'wrong-password' })
        .expect(401);
    });

    it('returns 401 for MASTER (no web cabinet)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: 'mastera', password: seed.password })
        .expect(401);

      expect(res.body.message).toContain('веб-кабинета');
    });

    it('returns 401 for FIRED user', async () => {
      await prisma.user.update({
        where: { id: seed.users.adminA.id },
        data: { status: UserStatus.FIRED },
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: 'admina', password: seed.password })
        .expect(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 200 with user data for valid Bearer token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: 'owner', password: seed.password })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: seed.users.owner.id,
        login: 'owner',
        fullName: 'Owner',
        role: Role.OWNER,
      });
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });

    it('returns 401 for invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt')
        .expect(401);
    });

    it('returns 401 for expired token', async () => {
      const expiredToken = makeExpiredToken(
        seed.users.owner.id,
        Role.OWNER,
        'owner',
      );

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });
});
