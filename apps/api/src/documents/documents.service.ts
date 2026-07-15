import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocKind, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';

/** Обязательные типы документов для статуса «Готов». */
export const REQUIRED_ORDER_DOC_KINDS: DocKind[] = [
  DocKind.CONTRACT,
  DocKind.RECEIPT_SERVICE,
  DocKind.RECEIPT_PARTS,
  DocKind.PARTS_PHOTO,
  DocKind.RECEIPT_SD,
];

const UPLOAD_ALLOWED_KINDS = new Set<DocKind>(REQUIRED_ORDER_DOC_KINDS);

export const DOC_KIND_RU: Record<DocKind, string> = {
  [DocKind.CONTRACT]: 'договор',
  [DocKind.RECEIPT_SERVICE]: 'чек за услугу',
  [DocKind.RECEIPT_PARTS]: 'чек за комплектующие / расходы',
  [DocKind.PARTS_PHOTO]: 'фото запчастей и комплектующих',
  [DocKind.RECEIPT_SD]: 'сохранная расписка',
  [DocKind.AD_SCREEN]: 'скрин рекламы',
  [DocKind.CASH_DOC]: 'кассовый документ',
  [DocKind.OTHER]: 'прочее',
};

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
    if (!UPLOAD_ALLOWED_KINDS.has(kind)) {
      throw new BadRequestException('Недопустимый тип документа для заявки');
    }
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
    await this.autoFillScheduledAtIfComplete(orderId);
    return created;
  }

  /**
   * Если дата выполнения ещё не задана и загружены все обязательные документы —
   * проставить текущее время (админ может изменить вручную).
   */
  private async autoFillScheduledAtIfComplete(orderId: string) {
    const missing = await this.missingRequiredKinds(orderId);
    if (missing.length) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { scheduledAt: true, status: true },
    });
    if (!order || order.scheduledAt) return;

    const now = new Date();
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        scheduledAt: now,
        ...(order.status === OrderStatus.NOT_SCHEDULED
          ? { status: OrderStatus.WAITING }
          : {}),
      },
    });
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

  async missingRequiredKinds(orderId: string): Promise<DocKind[]> {
    const docs = await this.prisma.orderDocument.findMany({
      where: { orderId, kind: { in: REQUIRED_ORDER_DOC_KINDS } },
      select: { kind: true },
    });
    const present = new Set(docs.map((d) => d.kind));
    return REQUIRED_ORDER_DOC_KINDS.filter((k) => !present.has(k));
  }

  async hasRequiredOrderDocs(orderId: string) {
    const missing = await this.missingRequiredKinds(orderId);
    return missing.length === 0;
  }

  /** @deprecated alias — используйте hasRequiredOrderDocs */
  async hasRequiredReceipts(orderId: string) {
    return this.hasRequiredOrderDocs(orderId);
  }
}
