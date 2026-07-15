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

  const txMock = {
    order: { update: jest.fn() },
    cashTx: { findFirst: jest.fn(), create: jest.fn() },
  };

  const prisma = {
    user: { findFirst: jest.fn() },
    order: { findUnique: jest.fn() },
    orderDocument: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  const masterUser = {
    id: 'user-1',
    masterProfile: { id: 'master-1' },
  };

  const telegramId = 'tg-111';
  const orderId = 'order-1';

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    svc = new BotService(prisma, chat as any, settings as any);
    prisma.$transaction.mockImplementation((cb: (tx: typeof txMock) => unknown) =>
      cb(txMock),
    );
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
    }> = {},
  ) {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      masterId: overrides.masterId ?? 'master-1',
      cityId: 'city-1',
      payment: {
        paid: overrides.paid ?? 1500,
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

    it('throws BadRequestException for DONE without CONTRACT/RECEIPT_SERVICE', async () => {
      mockMaster();
      mockOrder();
      prisma.orderDocument.findMany.mockResolvedValue([]);

      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/договор/);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/чек услуги/);
    });

    it('throws BadRequestException for DONE with partsYesNo without RECEIPT_PARTS/PARTS_PHOTO', async () => {
      mockMaster();
      mockOrder({ partsYesNo: true });
      prisma.orderDocument.findMany.mockResolvedValue([
        { kind: DocKind.CONTRACT },
        { kind: DocKind.RECEIPT_SERVICE },
      ]);

      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/чек комплектующих/);
      await expect(
        svc.setStatus(telegramId, orderId, OrderStatus.DONE, true),
      ).rejects.toThrow(/фото комплектующих/);
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
      ).rejects.toThrow('Для статуса «В работе СД» нужна сохранённая расписка СД');
    });

    it('creates ORDER cash income on successful DONE', async () => {
      mockMaster();
      mockOrder({ paid: 2000 });
      prisma.orderDocument.findMany.mockResolvedValue([
        { kind: DocKind.CONTRACT },
        { kind: DocKind.RECEIPT_SERVICE },
      ]);
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
        data: { status: OrderStatus.DONE },
      });
      expect(txMock.cashTx.findFirst).toHaveBeenCalledWith({
        where: { orderId, incomeBasis: CashIncomeBasis.ORDER },
        select: { id: true },
      });
      expect(txMock.cashTx.create).toHaveBeenCalledWith({
        data: {
          direction: CashDirection.INCOME,
          incomeBasis: CashIncomeBasis.ORDER,
          amount: 2000,
          orderId,
          cityId: 'city-1',
          createdById: 'user-1',
          description: 'Приход по заявке',
        },
      });
    });

    it('does not create cash income when ORDER income already exists', async () => {
      mockMaster();
      mockOrder();
      prisma.orderDocument.findMany.mockResolvedValue([
        { kind: DocKind.CONTRACT },
        { kind: DocKind.RECEIPT_SERVICE },
      ]);
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

    it('calls setStatus for c:orderId:STATUS', async () => {
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
  });
});
