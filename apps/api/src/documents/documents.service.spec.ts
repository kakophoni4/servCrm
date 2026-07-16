import { BadRequestException } from '@nestjs/common';
import { DocKind, OrderStatus } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  const prisma = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    orderDocument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    orderPayment: { findUnique: jest.fn() },
  } as any;

  const storage = {
    save: jest.fn().mockReturnValue({ relPath: 'orders/o1/f.jpg' }),
    remove: jest.fn(),
  } as any;

  let svc: DocumentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new DocumentsService(prisma, storage);
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      status: OrderStatus.IN_PROGRESS,
      scheduledAt: null,
    });
    prisma.orderPayment.findUnique.mockResolvedValue({ partsCost: 0 });
  });

  it('uploadMany marks pendingReview when requested', async () => {
    prisma.orderDocument.findFirst.mockResolvedValue(null);
    prisma.orderDocument.create.mockResolvedValue({
      id: 'd1',
      orderId: 'o1',
      kind: DocKind.OTHER,
      forStatus: null,
      pendingReview: true,
      contentHash: 'h',
      fileName: 'a.jpg',
      filePath: 'orders/o1/f.jpg',
    });

    const result = await svc.uploadMany(
      'o1',
      DocKind.OTHER,
      [
        {
          originalname: 'a.jpg',
          mimetype: 'image/jpeg',
          size: 3,
          buffer: Buffer.from('abc'),
        },
      ],
      'user-1',
      null,
      { pendingReview: true },
    );

    expect(result.created).toHaveLength(1);
    expect(prisma.orderDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: DocKind.OTHER,
        pendingReview: true,
        forStatus: null,
      }),
    });
  });

  it('updateKind clears pendingReview', async () => {
    prisma.orderDocument.findUnique.mockResolvedValue({
      id: 'd1',
      orderId: 'o1',
      kind: DocKind.OTHER,
      pendingReview: true,
    });
    prisma.orderDocument.update.mockResolvedValue({
      id: 'd1',
      kind: DocKind.CONTRACT,
      pendingReview: false,
    });
    prisma.orderDocument.findMany.mockResolvedValue([
      { kind: DocKind.CONTRACT },
      { kind: DocKind.RECEIPT_SERVICE },
    ]);

    const updated = await svc.updateKind('o1', 'd1', DocKind.CONTRACT);
    expect(updated.kind).toBe(DocKind.CONTRACT);
    expect(prisma.orderDocument.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { kind: DocKind.CONTRACT, pendingReview: false },
    });
  });

  it('updateKind rejects invalid kind', async () => {
    await expect(
      svc.updateKind('o1', 'd1', DocKind.AD_SCREEN),
    ).rejects.toThrow(BadRequestException);
  });

  it('missingRequiredKinds ignores pendingReview docs', async () => {
    prisma.orderDocument.findMany.mockResolvedValue([]);
    const missing = await svc.missingRequiredKinds('o1');
    expect(prisma.orderDocument.findMany).toHaveBeenCalledWith({
      where: {
        orderId: 'o1',
        kind: { in: expect.any(Array) },
        pendingReview: false,
      },
      select: { kind: true },
    });
    expect(missing).toEqual([DocKind.RECEIPT_SERVICE, DocKind.CONTRACT]);
  });
});
