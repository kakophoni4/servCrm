import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DocKind, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';

/** Типы для обычной загрузки / «Готов» (без сохранной расписки). */
export const REQUIRED_ORDER_DOC_KINDS: DocKind[] = [
  DocKind.RECEIPT_SERVICE,
  DocKind.CONTRACT,
  DocKind.RECEIPT_PARTS,
  DocKind.PARTS_PHOTO,
];

/** Всегда обязательны для «Готов». Порядок = порядок запроса в боте (чек → договор). */
const ALWAYS_REQUIRED_DOC_KINDS: DocKind[] = [
  DocKind.RECEIPT_SERVICE,
  DocKind.CONTRACT,
];

/** Нужны только если сумма комплектующих > 0. */
const PARTS_DEPENDENT_DOC_KINDS: DocKind[] = [
  DocKind.RECEIPT_PARTS,
  DocKind.PARTS_PHOTO,
];

/**
 * Обязательные документы для «Готов».
 * Сохранная расписка сюда не входит — только для статуса «В работе СД».
 * Чек/фото комплектующих — только при заполненной сумме комплектующих.
 */
export function requiredOrderDocKinds(partsCost: number): DocKind[] {
  if (Number(partsCost) > 0) {
    return [...ALWAYS_REQUIRED_DOC_KINDS, ...PARTS_DEPENDENT_DOC_KINDS];
  }
  return [...ALWAYS_REQUIRED_DOC_KINDS];
}

const UPLOAD_ALLOWED_KINDS = new Set<DocKind>([
  ...REQUIRED_ORDER_DOC_KINDS,
  DocKind.RECEIPT_SD,
  DocKind.OTHER,
]);

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

export type UploadManyResult = {
  created: Array<{
    id: string;
    orderId: string;
    kind: DocKind;
    forStatus: OrderStatus | null;
    pendingReview: boolean;
    contentHash: string | null;
    fileName: string;
    filePath: string;
  }>;
  skipped: number;
};

const CLASSIFY_ALLOWED_KINDS = new Set<DocKind>([
  ...REQUIRED_ORDER_DOC_KINDS,
  DocKind.RECEIPT_SD,
  DocKind.OTHER,
]);

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

  /**
   * Загрузка файлов одного типа.
   * Дубликаты по SHA-256 в рамках заявки пропускаются без записи и без ошибок.
   * forStatus: явная привязка к статусу; иначе — текущий статус заявки.
   * pendingReview: дамп «через администратора» — ждёт разметки в CRM.
   */
  async uploadMany(
    orderId: string,
    kind: DocKind,
    files: UploadedMemoryFile[],
    uploadedBy?: string,
    forStatus?: OrderStatus | null,
    options?: { pendingReview?: boolean },
  ): Promise<UploadManyResult> {
    const order = await this.ensureOrder(orderId);
    if (!UPLOAD_ALLOWED_KINDS.has(kind)) {
      throw new BadRequestException('Недопустимый тип документа для заявки');
    }
    if (!files?.length) throw new NotFoundException('Файлы не переданы');

    const pendingReview = Boolean(options?.pendingReview);
    const statusTag = forStatus === undefined ? order.status : forStatus;
    if (kind === DocKind.RECEIPT_SD && !pendingReview) {
      const sdOk =
        statusTag === OrderStatus.IN_PROGRESS_SD ||
        order.status === OrderStatus.IN_PROGRESS_SD ||
        forStatus === null;
      if (!sdOk) {
        throw new BadRequestException(
          'Сохранная расписка загружается только для статуса «В работе СД»',
        );
      }
    }
    const created: UploadManyResult['created'] = [];
    let skipped = 0;

    for (const file of files) {
      if (!file.buffer?.length) {
        skipped += 1;
        continue;
      }
      const contentHash = createHash('sha256')
        .update(file.buffer)
        .digest('hex');

      const dup = await this.prisma.orderDocument.findFirst({
        where: { orderId, contentHash },
        select: { id: true },
      });
      if (dup) {
        skipped += 1;
        continue;
      }

      const { relPath } = this.storage.save(`orders/${orderId}`, file);
      try {
        created.push(
          await this.prisma.orderDocument.create({
            data: {
              orderId,
              kind,
              forStatus: statusTag,
              pendingReview,
              contentHash,
              fileName: file.originalname,
              filePath: relPath,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              uploadedBy,
            },
          }),
        );
      } catch (e) {
        // Гонка уникального индекса — тихий skip
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          this.storage.remove(relPath);
          skipped += 1;
          continue;
        }
        throw e;
      }
    }

    if (created.length && !pendingReview) {
      await this.autoFillScheduledAtIfComplete(orderId);
    }
    return { created, skipped };
  }

  /** Назначить тип документу из входящих (дамп через админа). */
  async updateKind(orderId: string, docId: string, kind: DocKind) {
    if (!CLASSIFY_ALLOWED_KINDS.has(kind)) {
      throw new BadRequestException('Недопустимый тип документа');
    }
    const doc = await this.getDoc(orderId, docId);
    const updated = await this.prisma.orderDocument.update({
      where: { id: doc.id },
      data: {
        kind,
        pendingReview: false,
      },
    });
    await this.autoFillScheduledAtIfComplete(orderId);
    return updated;
  }

  listPendingReview(orderId: string) {
    return this.prisma.orderDocument.findMany({
      where: { orderId, pendingReview: true },
      orderBy: { createdAt: 'asc' },
    });
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
    const [docs, payment] = await Promise.all([
      this.prisma.orderDocument.findMany({
        where: {
          orderId,
          kind: { in: REQUIRED_ORDER_DOC_KINDS },
          pendingReview: false,
        },
        select: { kind: true },
      }),
      this.prisma.orderPayment.findUnique({
        where: { orderId },
        select: { partsCost: true },
      }),
    ]);
    const present = new Set(docs.map((d) => d.kind));
    const required = requiredOrderDocKinds(Number(payment?.partsCost ?? 0));
    return required.filter((k) => !present.has(k));
  }

  /** Недостающие документы для перехода в целевой статус. */
  async missingKindsForStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<DocKind[]> {
    if (status === OrderStatus.DONE) {
      return this.missingRequiredKinds(orderId);
    }
    if (status === OrderStatus.IN_PROGRESS_SD) {
      const n = await this.prisma.orderDocument.count({
        where: {
          orderId,
          kind: DocKind.RECEIPT_SD,
          pendingReview: false,
        },
      });
      return n > 0 ? [] : [DocKind.RECEIPT_SD];
    }
    return [];
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
