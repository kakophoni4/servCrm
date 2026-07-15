import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { hasPermission } from '../permissions/permissions';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as
      | { userId: string; role: Role | string }
      | undefined;
    if (!user?.userId) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const role = user.role;
    if (role === Role.OWNER || role === Role.MASTER || role === Role.DISPATCHER) {
      return true;
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { permissions: true, role: true, status: true },
    });
    if (!row || row.status === 'FIRED') {
      throw new ForbiddenException('Недостаточно прав');
    }

    if (!hasPermission(row.role, row.permissions, required)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return true;
  }
}
