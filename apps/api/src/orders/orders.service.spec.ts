import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CashIncomeBasis,
  OrderStatus,
  OrderType,
  Role,
  SourceKind,
  SourceOur,
} from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    $transaction: jest.Mock;
    order: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    master: { findUnique: jest.Mock };
    orderPayment: { findUnique: jest.Mock };
  };
  let txMock: {
    client: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    order: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    orderPayment: { upsert: jest.Mock };
    master: { findUnique: jest.Mock };
    cashTx: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let salary: { percentFor: jest.Mock };
  let documents: {
    hasRequiredReceipts: jest.Mock;
    missingRequiredKinds: jest.Mock;
    missingKindsForStatus: jest.Mock;
    hasRequiredOrderDocs: jest.Mock;
  };
  let bot: {
    notifyAdminsNewOrder: jest.Mock;
    notifyMasterOrder: jest.Mock;
    notifyMasterStatusChanged: jest.Mock;
    ackOrderNotify: jest.Mock;
  };
  let branch: { allowedCityIds: jest.Mock };
  let settlements: {
    syncForCompletedOrder: jest.Mock;
    syncMasterMonth: jest.Mock;
  };

  const userId = 'user-1';
  const orderId = 'order-1';

  const baseCreateDto = (): CreateOrderDto => ({
    clientName: 'Иван',
    clientPhone: '79001234567',
    type: OrderType.NEW,
    sourceKind: SourceKind.OUR,
    sourceOur: SourceOur.AVITO,
    address: 'ул. Тестовая 1',
    scheduledAt: '2026-07-20T10:00:00.000Z',
  });

  const orderIncludeShape = {
    client: {},
    partner: null,
    ageCategory: null,
    master: null,
    city: null,
    payment: {},
    claims: [],
    documents: [],
  };

  function setupCreateTransaction(overrides?: {
    createdOrder?: Record<string, unknown>;
  }) {
    const createdOrder = {
      id: orderId,
      status: OrderStatus.NOT_SCHEDULED,
      ...orderIncludeShape,
      ...(overrides?.createdOrder ?? {}),
    };

    txMock.client.findUnique.mockResolvedValue(null);
    txMock.client.create.mockResolvedValue({
      id: 'client-1',
      branchComment: null,
    });
    txMock.order.findFirst.mockResolvedValue(null);
    txMock.order.create.mockResolvedValue(createdOrder);

    prisma.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) =>
      cb(txMock),
    );
  }

  function setupUpdateTransaction(overrides?: {
    resultOrder?: Record<string, unknown>;
  }) {
    const resultOrder = {
      id: orderId,
      status: OrderStatus.WAITING,
      ...orderIncludeShape,
      ...(overrides?.resultOrder ?? {}),
    };

    txMock.order.update.mockResolvedValue({});
    txMock.orderPayment.upsert.mockResolvedValue({});
    txMock.master.findUnique.mockResolvedValue({ cityId: 'A' });
    txMock.cashTx.findFirst.mockResolvedValue(null);
    txMock.cashTx.create.mockResolvedValue({ id: 'cash-1' });
    txMock.cashTx.update.mockResolvedValue({ id: 'cash-1' });
    txMock.order.findUniqueOrThrow.mockResolvedValue(resultOrder);

    prisma.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) =>
      cb(txMock),
    );
  }

  function mockExistingOrder(overrides?: Record<string, unknown>) {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      cityId: 'A',
      masterId: null,
      status: OrderStatus.WAITING,
      ...overrides,
    });
  }

  beforeEach(() => {
    txMock = {
      client: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      orderPayment: { upsert: jest.fn() },
      master: { findUnique: jest.fn() },
      cashTx: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(),
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      master: { findUnique: jest.fn() },
      orderPayment: {
        findUnique: jest.fn().mockResolvedValue({ paid: 0, partsCost: 0 }),
      },
    };

    salary = { percentFor: jest.fn().mockResolvedValue(0.5) };
    documents = {
      hasRequiredReceipts: jest.fn().mockResolvedValue(true),
      hasRequiredOrderDocs: jest.fn().mockResolvedValue(true),
      missingRequiredKinds: jest.fn().mockResolvedValue([]),
      missingKindsForStatus: jest.fn().mockResolvedValue([]),
    };
    bot = {
      notifyAdminsNewOrder: jest.fn().mockResolvedValue(undefined),
      notifyMasterOrder: jest.fn().mockResolvedValue(undefined),
      notifyMasterStatusChanged: jest.fn().mockResolvedValue(undefined),
      ackOrderNotify: jest.fn().mockResolvedValue(undefined),
    };
    branch = { allowedCityIds: jest.fn().mockResolvedValue(['A']) };
    settlements = {
      syncForCompletedOrder: jest.fn().mockResolvedValue(null),
      syncMasterMonth: jest.fn().mockResolvedValue(null),
    };

    service = new OrdersService(
      prisma as never,
      salary as never,
      documents as never,
      bot as never,
      branch as never,
      settlements as never,
    );
  });

  describe('create', () => {
    it('throws BadRequestException when sourceKind OUR without sourceOur', async () => {
      const dto = { ...baseCreateDto(), sourceOur: undefined };

      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Укажите Авито или листовку');
    });

    it('throws BadRequestException when sourceKind PARTNER without partnerId', async () => {
      const dto = {
        ...baseCreateDto(),
        sourceKind: SourceKind.PARTNER,
        sourceOur: undefined,
        partnerId: undefined,
      };

      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Укажите партнёра');
    });

    it('throws BadRequestException when phone normalizes to fewer than 10 digits', async () => {
      const dto = { ...baseCreateDto(), clientPhone: '123' };

      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Некорректный телефон');
    });

    it('throws BadRequestException when scheduledAt is absent', async () => {
      const dto = { ...baseCreateDto(), scheduledAt: undefined as unknown as string };

      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Укажите время по заказу');
    });

    it('sets status WAITING when scheduledAt is provided by OWNER', async () => {
      setupCreateTransaction();
      const scheduledAt = '2026-07-20T10:00:00.000Z';
      const dto = { ...baseCreateDto(), scheduledAt };

      await service.create(dto, userId, Role.OWNER);

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.WAITING,
            scheduledAt: new Date(scheduledAt),
          }),
        }),
      );
    });

    it('accepts scheduledAt from DISPATCHER on create', async () => {
      setupCreateTransaction();
      const scheduledAt = '2026-07-20T10:00:00.000Z';
      const dto = { ...baseCreateDto(), scheduledAt };

      await service.create(dto, userId, Role.DISPATCHER);

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.WAITING,
            scheduledAt: new Date(scheduledAt),
          }),
        }),
      );
    });

    it('forces cityId from allowedCityIds for non-OWNER when dto.cityId is outside allowed', async () => {
      branch.allowedCityIds.mockResolvedValue(['A']);
      setupCreateTransaction();
      const dto = { ...baseCreateDto(), cityId: 'Z' };

      await service.create(dto, userId, Role.DISPATCHER);

      expect(branch.allowedCityIds).toHaveBeenCalledWith(userId, Role.DISPATCHER);
      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cityId: 'A' }),
        }),
      );
      expect(txMock.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cityId: 'A' }),
        }),
      );
    });

    it('uses dto.cityId when it is within allowedCityIds for non-OWNER', async () => {
      branch.allowedCityIds.mockResolvedValue(['A', 'B']);
      setupCreateTransaction();
      const dto = { ...baseCreateDto(), cityId: 'B' };

      await service.create(dto, userId, Role.DISPATCHER);

      expect(txMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cityId: 'B' }),
        }),
      );
    });

    it('calls bot.notifyAdminsNewOrder after successful create', async () => {
      setupCreateTransaction();

      await service.create(baseCreateDto(), userId, Role.OWNER);

      expect(bot.notifyAdminsNewOrder).toHaveBeenCalledWith(orderId);
    });

    it('does not throw when bot.notifyAdminsNewOrder rejects', async () => {
      setupCreateTransaction();
      bot.notifyAdminsNewOrder.mockRejectedValue(new Error('telegram down'));

      await expect(
        service.create(baseCreateDto(), userId, Role.OWNER),
      ).resolves.toMatchObject({ id: orderId });
      expect(bot.notifyAdminsNewOrder).toHaveBeenCalledWith(orderId);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mockExistingOrder();
      setupUpdateTransaction();
    });

    it('throws ForbiddenException when dispatcher sets execution status IN_PROGRESS', async () => {
      const dto: UpdateOrderDto = { status: OrderStatus.IN_PROGRESS };

      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Диспетчер не может ставить статусы исполнения');
    });

    it.each([
      OrderStatus.WAITING,
      OrderStatus.NOT_SCHEDULED,
      OrderStatus.CANCELLED_CC,
    ])('allows dispatcher to set status %s', async (status) => {
      const dto: UpdateOrderDto = { status };

      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it.each([
      ['paid', { paid: 1000 }],
      ['prepay', { prepay: 500 }],
      ['partsCost', { partsCost: 200 }],
      ['partsYesNo', { partsYesNo: true }],
    ] as const)(
      'throws ForbiddenException when non-admin passes %s',
      async (_field, dto) => {
        await expect(
          service.update(orderId, dto, userId, Role.DISPATCHER),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.update(orderId, dto, userId, Role.DISPATCHER),
        ).rejects.toThrow('Оплаты редактирует администратор');
      },
    );

    it('throws ForbiddenException when non-admin passes masterId', async () => {
      const dto: UpdateOrderDto = { masterId: 'master-1' };

      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Назначать мастера может только админ');
    });

    it('throws ForbiddenException when masterId belongs to another branch (role != OWNER)', async () => {
      prisma.master.findUnique.mockResolvedValue({ cityId: 'B' });
      branch.allowedCityIds.mockResolvedValue(['A']);
      const dto: UpdateOrderDto = { masterId: 'master-other' };

      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow('Мастер из другого филиала');
    });

    it('throws ForbiddenException when non-admin passes cancelFault', async () => {
      const dto: UpdateOrderDto = { cancelFault: 'master' };

      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(orderId, dto, userId, Role.DISPATCHER),
      ).rejects.toThrow('Виновника отмены указывает администратор');
    });

    it('throws BadRequestException when DONE without master', async () => {
      mockExistingOrder({ masterId: null });
      const dto: UpdateOrderDto = { status: OrderStatus.DONE, paid: 100 };

      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow('Для статуса «Готов» назначьте мастера');
    });

    it('throws BadRequestException when DONE with paid>500 and missing required receipts', async () => {
      mockExistingOrder({ masterId: 'm-1' });
      documents.missingRequiredKinds.mockResolvedValue(['CONTRACT' as any]);
      documents.hasRequiredReceipts.mockResolvedValue(false);
      const dto: UpdateOrderDto = {
        status: OrderStatus.DONE,
        paid: 600,
      };

      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update(orderId, dto, userId, Role.ADMIN),
      ).rejects.toThrow('При оплате >500 ₽ нельзя поставить Готов');
      expect(documents.missingRequiredKinds).toHaveBeenCalledWith(orderId);
    });

    it('passes when DONE with paid>500 and required receipts exist', async () => {
      mockExistingOrder({ masterId: 'm-1' });
      documents.missingRequiredKinds.mockResolvedValue([]);
      documents.hasRequiredReceipts.mockResolvedValue(true);
      setupUpdateTransaction({
        resultOrder: { status: OrderStatus.DONE, masterId: 'm-1' },
      });
      const dto: UpdateOrderDto = {
        status: OrderStatus.DONE,
        paid: 600,
      };

      const result = await service.update(orderId, dto, userId, Role.ADMIN);

      expect(documents.missingRequiredKinds).toHaveBeenCalledWith(orderId);
      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(settlements.syncForCompletedOrder).toHaveBeenCalledWith(orderId);
    });

    it('updates existing ORDER cashTx amount to toCompany on DONE', async () => {
      mockExistingOrder({ masterId: 'm-1' });
      setupUpdateTransaction({
        resultOrder: { status: OrderStatus.DONE, masterId: 'm-1' },
      });
      txMock.cashTx.findFirst.mockResolvedValue({ id: 'existing-cash' });
      // percentFor = 0.5 → toCompany = paid - parts - masterSalary = 1000 - 0 - 500
      const dto: UpdateOrderDto = {
        status: OrderStatus.DONE,
        paid: 1000,
      };

      await service.update(orderId, dto, userId, Role.ADMIN);

      expect(txMock.cashTx.create).not.toHaveBeenCalled();
      expect(txMock.cashTx.update).toHaveBeenCalledWith({
        where: { id: 'existing-cash' },
        data: expect.objectContaining({
          amount: 500,
          description: 'Приход по заявке (чистыми)',
        }),
      });
    });

    it('creates cashTx with toCompany when DONE and no existing ORDER income', async () => {
      mockExistingOrder({ masterId: 'm-1' });
      setupUpdateTransaction({
        resultOrder: { status: OrderStatus.DONE, masterId: 'm-1' },
      });
      txMock.cashTx.findFirst.mockResolvedValue(null);
      const dto: UpdateOrderDto = {
        status: OrderStatus.DONE,
        paid: 1000,
        partsCost: 200,
      };

      await service.update(orderId, dto, userId, Role.ADMIN);

      // workSum=800, master=400, toCompany=400
      expect(txMock.cashTx.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId,
            incomeBasis: CashIncomeBasis.ORDER,
            amount: 400,
            cityId: 'A',
          }),
        }),
      );
    });
  });

  describe('createRepeat', () => {
    it('calls create with REPEAT type and data from source order', async () => {
      const sourceOrder = {
        id: orderId,
        publicId: '072610001',
        client: { name: 'Пётр', phoneNormalized: '79007654321' },
        sourceKind: SourceKind.PARTNER,
        sourceOur: null,
        partnerId: 'partner-1',
        address: 'ул. Повторная 2',
        ageCategoryId: 'age-1',
        isProfile: false,
        typeTech: 'холодильник',
        cityId: 'A',
        branchComment: 'коммент',
        partner: null,
        ageCategory: null,
        master: null,
        city: null,
        payment: {},
        claims: [],
        documents: [],
      };

      prisma.order.findUnique.mockResolvedValue(sourceOrder);
      setupCreateTransaction();

      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ id: 'repeat-order' } as never);

      await service.createRepeat(orderId, userId, Role.DISPATCHER);

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: orderId } }),
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'Пётр',
          clientPhone: '79007654321',
          type: OrderType.REPEAT,
          sourceKind: SourceKind.PARTNER,
          partnerId: 'partner-1',
          address: 'ул. Повторная 2',
          ageCategoryId: 'age-1',
          isProfile: false,
          typeTech: 'холодильник',
          cityId: 'A',
          branchComment: 'коммент',
          comment: expect.stringContaining('072610001'),
        }),
        userId,
        Role.DISPATCHER,
      );

      createSpy.mockRestore();
    });
  });

  describe('markWarranty', () => {
    it('updates order type to WARRANTY and sets isWarranty', async () => {
      const updated = { id: orderId, type: OrderType.WARRANTY, isWarranty: true };
      prisma.order.update.mockResolvedValue(updated);

      const result = await service.markWarranty(orderId);

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: orderId },
          data: { type: OrderType.WARRANTY, isWarranty: true },
        }),
      );
      expect(result).toEqual(updated);
    });
  });
});
