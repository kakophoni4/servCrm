import { Injectable, NotFoundException } from '@nestjs/common';
import { DocKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RECEIPT_KINDS: DocKind[] = [
  DocKind.RECEIPT_SERVICE,
  DocKind.RECEIPT_PARTS,
  DocKind.CONTRACT,
];

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(orderId: string) {
    return this.prisma.orderDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    orderId: string,
    input: {
      kind: DocKind;
      fileName: string;
      filePath: string;
      mimeType?: string;
      sizeBytes?: number;
      uploadedBy?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Заявка не найдена');
    return this.prisma.orderDocument.create({
      data: { orderId, ...input },
    });
  }

  async hasRequiredReceipts(orderId: string) {
    const docs = await this.prisma.orderDocument.findMany({
      where: { orderId, kind: { in: RECEIPT_KINDS } },
    });
    return docs.length > 0;
  }
}
