import { Injectable, NotFoundException } from '@nestjs/common';
import { DocKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';

const RECEIPT_KINDS: DocKind[] = [
  DocKind.RECEIPT_SERVICE,
  DocKind.RECEIPT_PARTS,
  DocKind.CONTRACT,
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(orderId: string) {
    return this.prisma.orderDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensureOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Заявка не найдена');
    return order;
  }

  /** Реальная загрузка одного или нескольких файлов одного типа. */
  async uploadMany(
    orderId: string,
    kind: DocKind,
    files: UploadedMemoryFile[],
    uploadedBy?: string,
  ) {
    await this.ensureOrder(orderId);
    if (!files?.length) throw new NotFoundException('Файлы не переданы');
    const created = [];
    for (const file of files) {
      const { relPath } = this.storage.save(`orders/${orderId}`, file);
      created.push(
        await this.prisma.orderDocument.create({
          data: {
            orderId,
            kind,
            fileName: file.originalname,
            filePath: relPath,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            uploadedBy,
          },
        }),
      );
    }
    return created;
  }

  async getDoc(orderId: string, docId: string) {
    const doc = await this.prisma.orderDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.orderId !== orderId) {
      throw new NotFoundException('Документ не найден');
    }
    return doc;
  }

  async remove(orderId: string, docId: string) {
    const doc = await this.getDoc(orderId, docId);
    await this.prisma.orderDocument.delete({ where: { id: doc.id } });
    return { ok: true };
  }

  async hasRequiredReceipts(orderId: string) {
    const docs = await this.prisma.orderDocument.findMany({
      where: { orderId, kind: { in: RECEIPT_KINDS } },
    });
    return docs.length > 0;
  }
}
