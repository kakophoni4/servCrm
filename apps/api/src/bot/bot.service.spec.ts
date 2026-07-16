import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CashDirection,
  CashIncomeBasis,
  ChatChannel,
  DocKind,
  OrderStatus,
} from '@prisma/client';
import { BotService } from './bot.service';

describe('BotService', () => {
  let svc: BotService;
  let originalFetch: typeof fetch;

  const chat = { ingest: jest.fn() };
  const settings = {
    getBotToken: jest.fn(),
    getWebhookSecret: jest.fn(),
  };
  const documents = {
    missingRequiredKinds: jest.fn(),
    missingKindsForStatus: jest.fn(),
    uploadMany: jest.fn(),
  };
  const settlements = {
    syncForCompletedOrder: jest.fn().mockResolvedValue(null),
    syncMasterMonth: jest.fn().mockResolvedValue(null),
  };

  const txMock = {
    order: { update: jest.fn() },
    cashTx: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  const prisma = {
    user: { findFirst: jest.fn(), findMany: jest.fn() },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    claim: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    orderDocument: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const masterUser = {
    id: 'user-1',
    masterProfile: { id: 'master-1' },
  };

  const telegramId = 'tg-111';
  const orderId = 'order-1';

  const allDocs = [
    DocKind.CONTRACT,
    DocKind.RECEIPT_SERVICE,
    DocKind.RECEIPT_PARTS,
    DocKind.PARTS_PHOTO,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    svc = new BotService(
      prisma,
      chat as any,
      settings as any,
      documents as any,
      settlements as any,
    );
    prisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => unknown) =>
      cb(txMock),
    );
    documents.missingRequiredKinds.mockResolvedValue([]);
    documents.missingKindsForStatus.mockImplementation(
      async (orderId: string, status: OrderStatus) => {
        if (status === OrderStatus.DONE) {
          return documents.missingRequiredKinds(orderId);
        }
        if (status === OrderStatus.IN_PROGRESS_SD) {
          const n = await prisma.orderDocument.count({
            where: { orderId, kind: DocKind.RECEIPT_SD },
          });
          return n > 0 ? [] : [DocKind.RECEIPT_SD];
        }
        return [];
      },
    );
    prisma.orderDocument.count.mockResolvedValue(1);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockMaster() {
    prisma.user.findFirst.mockResolvedValue(masterUser);
  }

  function mockOrder(
    overrides: Partial<{
      masterId: string;
      partsYesNo: boolean;
      paid: number;
      partsCost: number;
      masterSalary: number;
      toCompany: number;
    }> = {},
  ) {
    const paid = overrides.paid ?? 1500;
    const partsCost = overrides.partsCost ?? 0;
    const masterSalary = overrides.masterSalary ?? 0;
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      masterId: overrides.masterId ?? 'master-1',
      cityId: 'city-1',
      payment: {
        paid,
        partsCost,
        masterSalary,
        toCompany:
          overrides.toCompany ?? Math.max(0, paid - partsCost - masterSalary),
        partsYesNo: overrides.partsYesNo ?? false,
      },
    });
  }

  describe('setStatus', () => {
    it('throws BadRequestException when confirm=false', async () => {
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, false),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, false),
      ).rejects.toThrow('Нужно подтверждение смены статуса');
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order belongs to another master', async () => {
      mockMaster();
      mockOrder({ masterId: 'other-master' });

      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.IN_PROGRESS, true),
      ).rejects.toThrow(NotFoundException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.IN_PROGRESS, true),
      ).rejects.toThrow('Заявка не найдена у мастера');
    });

    it('throws BadRequestException for DONE without required docs', async () => {
      mockMaster();
      mockOrder();
      documents.missingRequiredKinds.mockResolvedValue([
        DocKind.CONTRACT,
        DocKind.RECEIPT_SERVICE,
      ]);

      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/договор/);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/чек за услугу/);
    });

    it('throws BadRequestException for IN_PROGRESS_SD without RECEIPT_SD', async () => {
      mockMaster();
      mockOrder();
      prisma.orderDocument.count.mockResolvedValue(0);

      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.IN_PROGRESS_SD, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.IN_PROGRESS_SD, true),
      ).rejects.toThrow(/сохранная расписка/);
    });

    it('creates ORDER cash income on successful DONE as toCompany', async () => {
      mockMaster();
      mockOrder({ paid: 2000, partsCost: 200, masterSalary: 720, toCompany: 1080 });
      documents.missingRequiredKinds.mockResolvedValue([]);
      txMock.order.update.mockResolvedValue({
        id: orderId,
        status: OrderStatus.DONE,
      });
      txMock.cashTx.findFirst.mockResolvedValue(null);
      txMock.cashTx.create.mockResolvedValue({ id: 'cash-tx-1' });

      await svc.setStatus(telegramId, orderId, OrderStatus.DONE, true);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(txMock.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({
          status: OrderStatus.DONE,
          docsViaAdmin: false,
          completedAt: expect.any(Date),
        }),
      });
      expect(txMock.cashTx.findFirst).toHaveBeenCalledWith({
        where: { orderId, incomeBasis: CashIncomeBasis.ORDER },
        select: { id: true },
      });
      expect(txMock.cashTx.create).toHaveBeenCalledWith({
        data: {
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.ORDER,
          amount: 1080,
          orderId,
          cityId: 'city-1',
          createdById: 'user-1',
          description: 'Приход по заявке (чистыми)',
        },
      });
      expect(settlements.syncForCompletedOrder).toHaveBeenCalledWith(orderId);
    });

    it('does not create cash income when ORDER income already exists', async () => {
      mockMaster();
      mockOrder();
      documents.missingRequiredKinds.mockResolvedValue([]);
      txMock.order.update.mockResolvedValue({
        id: orderId,
        status: OrderStatus.DONE,
      });
      txMock.cashTx.findFirst.mockResolvedValue({ id: 'existing-tx' });

      await svc.setStatus(telegramId, orderId, OrderStatus.DONE, true);

      expect(txMock.cashTx.create).not.toHaveBeenCalled();
    });
  });

  describe('masterByTelegram', () => {
    it('throws NotFoundException when master is not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(svc.masterByTelegram(telegramId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.masterByTelegram(telegramId)).rejects.toThrow(
        'Мастер не найден по telegram id',
      );
    });
  });

  describe('handleWebhook', () => {
    it('throws UnauthorizedException when webhook secret is wrong', async () => {
      settings.getWebhookSecret.mockResolvedValue('expected-secret');

      await expect(svc.handleWebhook('wrong-secret', {})).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(svc.handleWebhook('wrong-secret', {})).rejects.toThrow(
        'Неверный webhook secret',
      );
    });

    it('handles callback_query update', async () => {
      settings.getWebhookSecret.mockResolvedValue('secret');
      const handleCallbackQuerySpy = jest
        .spyOn(svc as any, 'handleCallbackQuery')
        .mockResolvedValue(undefined);

      const update = {
        callback_query: { id: 'cq-1', data: 'n', from: { id: 111 } },
      };

      const result = await svc.handleWebhook('secret', update);

      expect(handleCallbackQuerySpy).toHaveBeenCalledWith(update.callback_query);
      expect(result).toEqual({ ok: true });
    });

    it('calls chat.ingest for message with text and chat.id', async () => {
      settings.getWebhookSecret.mockResolvedValue('secret');
      chat.ingest.mockResolvedValue({ id: 'msg-1' });

      await svc.handleWebhook('secret', {
        message: {
          text: 'Привет',
          chat: { id: 12345 },
          from: { username: 'tester' },
        },
      });

      expect(chat.ingest).toHaveBeenCalledWith({
        channel: ChatChannel.TELEGRAM,
        externalId: '12345',
        title: 'tester',
        body: 'Привет',
      });
    });

    it('on /start sends connection ID and does not ingest chat', async () => {
      settings.getWebhookSecret.mockResolvedValue('secret');
      const sendSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await svc.handleWebhook('secret', {
        message: {
          text: '/start',
          chat: { id: 999 },
          from: { id: 999, username: 'newbie' },
        },
      });

      expect(chat.ingest).not.toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalledWith(
        '999',
        expect.stringContaining('Ваш ID для подключения: 999'),
      );
      expect(sendSpy).toHaveBeenCalledWith(
        '999',
        expect.stringContaining(
          'Передайте этот ID администратору для подключения к чату и уведомлениям',
        ),
      );
    });
  });

  describe('telegram', () => {
    it('returns null and skips fetch when bot token is empty', async () => {
      settings.getBotToken.mockResolvedValue('');

      const result = await svc.telegram('sendMessage', { chat_id: '1' });

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('calls fetch and parses JSON when bot token is set', async () => {
      settings.getBotToken.mockResolvedValue('bot-token-xyz');
      const apiResponse = { ok: true, result: { message_id: 42 } };
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue(apiResponse),
      });

      const result = await svc.telegram('sendMessage', {
        chat_id: '99',
        text: 'hello',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token-xyz/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: '99', text: 'hello' }),
        }),
      );
      expect(result).toEqual(apiResponse);
    });
  });

  describe('handleCallbackQuery', () => {
    beforeEach(() => {
      settings.getBotToken.mockResolvedValue('token');
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({ ok: true }),
      });
    });

    it('sends "Отменено" for data "n"', async () => {
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-1',
        data: 'n',
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(sendMessageSpy).toHaveBeenCalledWith('222', 'Отменено');
    });

    it('sends confirmation message for s:orderId:STATUS', async () => {
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-2',
        data: `s:${orderId}:${OrderStatus.DONE}`,
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(sendMessageSpy).toHaveBeenCalledWith(
        '222',
        'Подтвердите смену статуса на «Готов»?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Подтвердить',
                  callback_data: `c:${orderId}:${OrderStatus.DONE}`,
                },
                { text: 'Отмена', callback_data: 'n' },
              ],
            ],
          },
        },
      );
    });

    it('requests missing docs instead of setStatus for DONE', async () => {
      documents.missingRequiredKinds.mockResolvedValue([DocKind.CONTRACT]);
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);
      const setStatusSpy = jest.spyOn(svc, 'setStatus');

      await (svc as any).handleCallbackQuery({
        id: 'cq-docs',
        data: `c:${orderId}:${OrderStatus.DONE}`,
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(setStatusSpy).not.toHaveBeenCalled();
      expect(sendMessageSpy).toHaveBeenCalled();
      expect(
        sendMessageSpy.mock.calls.some((c) =>
          String(c[1]).includes('автоматически'),
        ),
      ).toBe(true);
    });

    it('auto-applies DONE via dn: when all docs present', async () => {
      documents.missingKindsForStatus.mockResolvedValue([]);
      const setStatusSpy = jest
        .spyOn(svc, 'setStatus')
        .mockResolvedValue({ id: orderId, status: OrderStatus.DONE } as any);
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      (svc as any).docSessions.set('111', {
        orderId,
        expectedKind: DocKind.CONTRACT,
        targetStatus: OrderStatus.DONE,
      });

      await (svc as any).handleCallbackQuery({
        id: 'cq-dn-done',
        data: `dn:${orderId}:${DocKind.CONTRACT}`,
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(setStatusSpy).toHaveBeenCalledWith(
        '111',
        orderId,
        OrderStatus.DONE,
        true,
      );
      expect(sendMessageSpy).toHaveBeenCalledWith(
        '222',
        expect.stringContaining('Статус обновлён'),
      );
    });

    it('sets docsViaAdmin on ad:orderId', async () => {
      mockMaster();
      prisma.order.update.mockResolvedValue({ id: orderId });
      jest.spyOn(svc, 'notifyAdminsDocsViaAdmin').mockResolvedValue(null);
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-ad',
        data: `ad:${orderId}`,
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { docsViaAdmin: true },
      });
      expect(sendMessageSpy).toHaveBeenCalledWith(
        '222',
        expect.stringContaining('администратор'),
      );
    });

    it('calls setStatus for c:orderId:STATUS when docs present', async () => {
      documents.missingRequiredKinds.mockResolvedValue([]);
      const setStatusSpy = jest
        .spyOn(svc, 'setStatus')
        .mockResolvedValue({ id: orderId, status: OrderStatus.DONE } as any);
      jest.spyOn(svc, 'sendMessage').mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-3',
        data: `c:${orderId}:${OrderStatus.DONE}`,
        from: { id: 111 },
        message: { chat: { id: 222 } },
      });

      expect(setStatusSpy).toHaveBeenCalledWith(
        '111',
        orderId,
        OrderStatus.DONE,
        true,
      );
    });

    it('acks order notify for ack:o:orderId', async () => {
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-ack-o',
        data: `ack:o:${orderId}`,
        from: { id: 111 },
        message: { chat: { id: 222 }, message_id: 99 },
      });

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, notifyAckedAt: null },
        data: { notifyAckedAt: expect.any(Date) },
      });
      expect(sendMessageSpy).toHaveBeenCalledWith(
        '222',
        'Ознакомление зафиксировано.',
      );
    });

    it('acks claim notify for ack:c:claimId', async () => {
      prisma.claim.updateMany.mockResolvedValue({ count: 1 });
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await (svc as any).handleCallbackQuery({
        id: 'cq-ack-c',
        data: 'ack:c:claim-1',
        from: { id: 111 },
        message: { chat: { id: 222 }, message_id: 100 },
      });

      expect(prisma.claim.updateMany).toHaveBeenCalledWith({
        where: { id: 'claim-1', notifyAckedAt: null },
        data: { notifyAckedAt: expect.any(Date) },
      });
      expect(sendMessageSpy).toHaveBeenCalledWith(
        '222',
        'Ознакомление зафиксировано.',
      );
    });
  });

  describe('notifyAdminsNewOrder', () => {
    it('sends only to ADMIN with ack button', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: orderId,
        publicId: 'MSK-1',
        address: 'ул. Тест',
        typeTech: null,
        scheduledAt: null,
        cityId: 'city-1',
        client: { name: 'Иван', phoneNormalized: '+7999' },
        city: { name: 'Москва' },
      });
      prisma.user.findMany.mockResolvedValue([{ telegramId: 'tg-admin' }]);
      const sendMessageSpy = jest
        .spyOn(svc, 'sendMessage')
        .mockResolvedValue(null);

      await svc.notifyAdminsNewOrder(orderId);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            telegramId: { not: null },
          }),
        }),
      );
      expect(sendMessageSpy).toHaveBeenCalledWith(
        'tg-admin',
        expect.stringContaining('Новая заявка MSK-1'),
        expect.objectContaining({
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Ознакомился', callback_data: `ack:o:${orderId}` }],
            ],
          },
        }),
      );
    });
  });

  it('exposes all required doc kinds constant coverage', () => {
    expect(allDocs).toHaveLength(4);
  });
});
