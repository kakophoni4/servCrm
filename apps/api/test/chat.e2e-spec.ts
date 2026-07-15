import { INestApplication } from '@nestjs/common';
import {
  ChatChannel,
  ChatStatus,
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

describe('Chat (e2e)', () => {
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

  async function createUnlinkedThread() {
    return prisma.chatThread.create({
      data: {
        channel: ChatChannel.TELEGRAM,
        title: 'Непривязанный чат',
        status: ChatStatus.OPEN,
        cityId: null,
      },
    });
  }

  async function createOrderInCityA() {
    const client = await prisma.client.create({
      data: {
        phoneNormalized: '79001234567',
        name: 'Клиент для чата A',
        cityId: seed.cities.a.id,
      },
    });
    return prisma.order.create({
      data: {
        publicId: 'CHAT-ORD-A-1',
        seqPrefix: 'CA',
        seq: 1,
        clientId: client.id,
        type: OrderType.NEW,
        sourceKind: SourceKind.OUR,
        sourceOur: SourceOur.AVITO,
        address: 'ул. Тестовая, 1',
        cityId: seed.cities.a.id,
      },
    });
  }

  describe('GET /api/chat/threads', () => {
    it('adminA and adminB both see unlinked thread (cityId=null)', async () => {
      const thread = await createUnlinkedThread();

      const resA = await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.adminB.id, Role.ADMIN, 'adminB'),
        )
        .expect(200);

      expect(resA.body.map((t: { id: string }) => t.id)).toContain(thread.id);
      expect(resB.body.map((t: { id: string }) => t.id)).toContain(thread.id);
    });

    it('after link-order adminA sees thread, adminB does not', async () => {
      const thread = await createUnlinkedThread();
      const order = await createOrderInCityA();

      await request(app.getHttpServer())
        .post(`/api/chat/threads/${thread.id}/link-order`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ orderId: order.id })
        .expect(201);

      const resA = await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.adminB.id, Role.ADMIN, 'adminB'),
        )
        .expect(200);

      expect(resA.body.map((t: { id: string }) => t.id)).toContain(thread.id);
      expect(resB.body.map((t: { id: string }) => t.id)).not.toContain(
        thread.id,
      );
    });

    it('OWNER sees city-A thread after link-order', async () => {
      const thread = await createUnlinkedThread();
      const order = await createOrderInCityA();

      await request(app.getHttpServer())
        .post(`/api/chat/threads/${thread.id}/link-order`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ orderId: order.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);

      expect(res.body.map((t: { id: string }) => t.id)).toContain(thread.id);
    });

    it('returns 403 for MASTER (RBAC)', async () => {
      await request(app.getHttpServer())
        .get('/api/chat/threads')
        .set(
          'Authorization',
          bearer(seed.users.masterA.id, Role.MASTER, 'masterA'),
        )
        .expect(403);
    });
  });

  describe('POST /api/chat/threads/:id/link-order', () => {
    it('links order and sets cityId from order (happy-path)', async () => {
      const thread = await createUnlinkedThread();
      const order = await createOrderInCityA();

      const res = await request(app.getHttpServer())
        .post(`/api/chat/threads/${thread.id}/link-order`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ orderId: order.id })
        .expect(201);

      expect(res.body).toMatchObject({
        id: thread.id,
        cityId: seed.cities.a.id,
        linkedOrderId: order.id,
      });
    });
  });

  describe('GET /api/chat/threads/:id', () => {
    it('adminA and OWNER can read linked city-A thread', async () => {
      const thread = await createUnlinkedThread();
      const order = await createOrderInCityA();

      await request(app.getHttpServer())
        .post(`/api/chat/threads/${thread.id}/link-order`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ orderId: order.id })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/chat/threads/${thread.id}`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/chat/threads/${thread.id}`)
        .set(
          'Authorization',
          bearer(seed.users.owner.id, Role.OWNER, 'owner'),
        )
        .expect(200);
    });

    it('adminB gets 403 on linked city-A thread (branch isolation)', async () => {
      const thread = await createUnlinkedThread();
      const order = await createOrderInCityA();

      await request(app.getHttpServer())
        .post(`/api/chat/threads/${thread.id}/link-order`)
        .set(
          'Authorization',
          bearer(seed.users.adminA.id, Role.ADMIN, 'adminA'),
        )
        .send({ orderId: order.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/chat/threads/${thread.id}`)
        .set(
          'Authorization',
          bearer(seed.users.adminB.id, Role.ADMIN, 'adminB'),
        )
        .expect(403);

      expect(res.body.message).toContain('филиала');
    });
  });
});
