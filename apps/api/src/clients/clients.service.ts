import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils/phone';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.findMany({
      include: {
        ageCategory: true,
        city: true,
        _count: { select: { orders: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        ageCategory: true,
        city: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { payment: true, master: { include: { user: true } } },
        },
      },
    });
    if (!client) throw new NotFoundException('Клиент не найден');
    return client;
  }

  async search(phone: string) {
    const normalized = normalizePhone(phone);
    return this.prisma.client.findMany({
      where: { phoneNormalized: { contains: normalized } },
      take: 20,
      include: { _count: { select: { orders: true } } },
    });
  }

  async updateComment(id: string, branchComment: string) {
    return this.prisma.client.update({
      where: { id },
      data: { branchComment },
    });
  }
}
