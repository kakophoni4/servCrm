import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ChatService } from '../chat/chat.service';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import {
  isOfficeRole,
  parsePermissionsInput,
  PERMISSIONS,
} from '../common/permissions/permissions';
import { CryptoService } from '../common/storage/crypto.service';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';

/** Метаданные шифрования паспорта в колонке passportEnc (JSON). */
export type PassportEncMeta = {
  v: 1;
  photoPath?: string;
  photoMime?: string;
  photoName?: string;
  number?: { ct: string; iv: string; tag: string };
};

const userSelect = {
  id: true,
  login: true,
  fullName: true,
  role: true,
  status: true,
  permissions: true,
  phone: true,
  telegramId: true,
  cityId: true,
  hiredAt: true,
  firedAt: true,
  fireReason: true,
  recommendedHire: true,
  contractPhotoPath: true,
  employeePhotoPath: true,
  createdAt: true,
  city: true,
  passportEnc: true,
  managedBranches: { select: { cityId: true } },
} as const;

export type CreateUserFiles = {
  passportPhoto?: UploadedMemoryFile[];
  contractPhoto?: UploadedMemoryFile[];
  employeePhoto?: UploadedMemoryFile[];
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly branch: BranchScopeService,
    private readonly chat: ChatService,
  ) {}

  async list(
    userId: string,
    role: Role,
    requestedCityId?: string,
    status?: UserStatus,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    const cityIds = this.branch.resolveCityIds(allowed, requestedCityId);
    const rows = await this.prisma.user.findMany({
      where: {
        ...(status ? { status } : {}),
        cityId: this.branch.cityWhere(cityIds),
      },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((u) => this.toPublic(u));
  }

  permissionCatalog() {
    return PERMISSIONS;
  }

  async create(
    input: {
      login: string;
      password: string;
      fullName: string;
      role: Role;
      phone?: string;
      cityId?: string;
      telegramId?: string;
      hiredAt?: string;
      passportNumber?: string;
      managedCityIds?: string;
      permissions?: string;
    },
    files?: CreateUserFiles,
  ) {
    const login = input.login.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new ConflictException('Логин занят');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const hiredAt = input.hiredAt ? new Date(input.hiredAt) : new Date();
    if (Number.isNaN(hiredAt.getTime())) {
      throw new BadRequestException('Некорректная дата начала работы');
    }

    const office = isOfficeRole(input.role);
    let permissions: string[] = [];
    if (office) {
      permissions = parsePermissionsInput(input.permissions);
      if (permissions.length === 0) {
        throw new BadRequestException(
          'Укажите хотя бы одно разрешение для сотрудника',
        );
      }
    }

    const passportPhoto = files?.passportPhoto?.[0];
    const contractPhoto = files?.contractPhoto?.[0];
    const employeePhoto = files?.employeePhoto?.[0];

    let passportEnc: string | null = null;
    if (passportPhoto || input.passportNumber?.trim()) {
      passportEnc = this.buildPassportEnc(
        passportPhoto,
        input.passportNumber?.trim(),
      );
    }

    let contractPhotoPath: string | undefined;
    if (contractPhoto) {
      contractPhotoPath = this.storage.save('users/contracts', contractPhoto)
        .relPath;
    }

    let employeePhotoPath: string | undefined;
    if (employeePhoto) {
      employeePhotoPath = this.storage.save('users/photos', employeePhoto)
        .relPath;
    }

    const managedCityIds =
      input.role === Role.DIRECTOR
        ? this.parseCityIds(input.managedCityIds)
        : [];
    const cityId = input.cityId?.trim() || null;

    if (
      (input.role === Role.ADMIN || input.role === Role.DISPATCHER) &&
      !cityId
    ) {
      throw new BadRequestException(
        'Для администратора и диспетчера укажите филиал назначения',
      );
    }
    if (
      input.role === Role.DIRECTOR &&
      !cityId &&
      managedCityIds.length === 0
    ) {
      throw new BadRequestException(
        'Для директора укажите филиал или филиалы под управлением',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          login,
          passwordHash,
          fullName: input.fullName.trim(),
          role: input.role,
          permissions,
          phone: input.phone?.trim() || null,
          cityId,
          telegramId: input.telegramId?.trim() || null,
          hiredAt,
          status: UserStatus.ACTIVE,
          passportEnc,
          contractPhotoPath,
          employeePhotoPath,
        },
        select: userSelect,
      });
      if (input.role === Role.MASTER) {
        await tx.master.create({
          data: {
            userId: created.id,
            cityId,
            status: UserStatus.ACTIVE,
          },
        });
      }
      if (managedCityIds.length) {
        await tx.branchDirector.createMany({
          data: managedCityIds.map((cid) => ({
            cityId: cid,
            userId: created.id,
          })),
          skipDuplicates: true,
        });
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          select: userSelect,
        });
      }
      return created;
    });

    // Telegram ID мастера — тред в разделе «Чаты».
    if (input.role === Role.MASTER && user.telegramId) {
      await this.chat
        .ensureTelegramThread({
          telegramId: user.telegramId,
          title: user.fullName,
          cityId: user.cityId,
        })
        .catch(() => undefined);
    }

    return this.toPublic(user);
  }

  /** Заменить набор филиалов, которыми управляет директор. */
  async setBranches(id: string, cityIds: string[]) {
    await this.getRaw(id);
    const ids = [...new Set(cityIds.map((c) => c.trim()).filter(Boolean))];
    await this.prisma.$transaction(async (tx) => {
      await tx.branchDirector.deleteMany({ where: { userId: id } });
      if (ids.length) {
        await tx.branchDirector.createMany({
          data: ids.map((cityId) => ({ cityId, userId: id })),
          skipDuplicates: true,
        });
      }
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: userSelect,
    });
    return this.toPublic(user);
  }

  async updatePermissions(
    id: string,
    raw: string[],
    actorUserId: string,
    actorRole: Role,
  ) {
    const target = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(target.cityId, actorUserId, actorRole);
    if (!isOfficeRole(target.role)) {
      throw new BadRequestException(
        'Разрешения задаются только для офисных ролей',
      );
    }
    if (target.role === Role.OWNER && actorRole !== Role.OWNER) {
      throw new ForbiddenException('Нельзя менять права владельца');
    }
    const permissions = parsePermissionsInput(raw);
    if (permissions.length === 0) {
      throw new BadRequestException('Укажите хотя бы одно разрешение');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { permissions },
      select: userSelect,
    });
    return this.toPublic(user);
  }

  /** Привязать / сменить Telegram ID у существующего сотрудника. */
  async updateTelegramId(
    id: string,
    telegramIdRaw: string | undefined,
    actorUserId: string,
    actorRole: Role,
  ) {
    const target = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(target.cityId, actorUserId, actorRole);
    const telegramId = telegramIdRaw?.trim() || null;

    if (telegramId) {
      const taken = await this.prisma.user.findFirst({
        where: { telegramId, NOT: { id } },
        select: { id: true, fullName: true },
      });
      if (taken) {
        throw new ConflictException(
          `Этот Telegram ID уже у ${taken.fullName}`,
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { telegramId },
      select: userSelect,
    });

    if (user.role === Role.MASTER && user.telegramId) {
      await this.chat
        .ensureTelegramThread({
          telegramId: user.telegramId,
          title: user.fullName,
          cityId: user.cityId,
        })
        .catch(() => undefined);
    }

    return this.toPublic(user);
  }

  private parseCityIds(csv?: string): string[] {
    if (!csv) return [];
    return [...new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))];
  }

  async get(id: string, userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    await this.assertEmployeeBranchAccess(user.cityId, userId, role);
    return this.toPublic(user);
  }

  async fire(
    id: string,
    input: { reason: string; recommendedHire: boolean },
    userId: string,
    role: Role,
  ) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('Укажите причину увольнения');
    }
    const target = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(target.cityId, userId, role);
    const user = await this.prisma.$transaction(async (tx) => {
      if (target.role === Role.MASTER) {
        const master = await tx.master.findUnique({
          where: { userId: id },
        });
        if (master) {
          await tx.order.updateMany({
            where: {
              masterId: master.id,
              status: {
                notIn: ['DONE', 'REFUSAL', 'CANCELLED_CC'],
              },
            },
            data: { masterId: null },
          });
          await tx.master.update({
            where: { id: master.id },
            data: { status: UserStatus.FIRED },
          });
        }
      }
      return tx.user.update({
        where: { id },
        data: {
          status: UserStatus.FIRED,
          firedAt: new Date(),
          fireReason: input.reason,
          recommendedHire: input.recommendedHire,
        },
        select: userSelect,
      });
    });
    return this.toPublic(user);
  }

  async restore(id: string, userId: string, role: Role) {
    const target = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(target.cityId, userId, role);
    const user = await this.prisma.$transaction(async (tx) => {
      if (target.role === Role.MASTER) {
        await tx.master.updateMany({
          where: { userId: id },
          data: { status: UserStatus.ACTIVE },
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          status: UserStatus.ACTIVE,
          firedAt: null,
          fireReason: null,
          recommendedHire: null,
        },
        select: userSelect,
      });
    });
    return this.toPublic(user);
  }

  /** Расшифровка фото паспорта на лету (OWNER/DIRECTOR). */
  async getPassportPhoto(
    id: string,
    userId: string,
    role: Role,
  ): Promise<{
    buffer: Buffer;
    mime: string;
    fileName: string;
  }> {
    const user = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(user.cityId, userId, role);
    const meta = this.parsePassportEnc(user.passportEnc);
    if (!meta?.photoPath) {
      throw new NotFoundException('Фото паспорта не загружено');
    }
    const packed = this.storage.readBuffer(meta.photoPath);
    const buffer = this.crypto.decryptBuffer(packed);
    return {
      buffer,
      mime: meta.photoMime || 'application/octet-stream',
      fileName: meta.photoName || 'passport.bin',
    };
  }

  async getEmployeePhoto(
    id: string,
    userId: string,
    role: Role,
  ): Promise<{
    buffer: Buffer;
    mime: string;
    fileName: string;
    streamPath: string;
  }> {
    const user = await this.getRaw(id);
    await this.assertEmployeeBranchAccess(user.cityId, userId, role);
    if (!user.employeePhotoPath) {
      throw new NotFoundException('Фото сотрудника не загружено');
    }
    const ext = user.employeePhotoPath.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    return {
      buffer: this.storage.readBuffer(user.employeePhotoPath),
      mime,
      fileName: `employee-${id}.${ext || 'jpg'}`,
      streamPath: user.employeePhotoPath,
    };
  }

  private async assertEmployeeBranchAccess(
    targetCityId: string | null,
    userId: string,
    role: Role,
  ) {
    const allowed = await this.branch.allowedCityIds(userId, role);
    if (
      allowed !== null &&
      targetCityId &&
      !allowed.includes(targetCityId)
    ) {
      throw new ForbiddenException('Сотрудник вне вашего филиала');
    }
  }

  private async getRaw(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  private buildPassportEnc(
    photo: UploadedMemoryFile | undefined,
    passportNumber: string | undefined,
  ): string {
    const meta: PassportEncMeta = { v: 1 };
    if (photo) {
      const packed = this.crypto.encryptBuffer(photo.buffer);
      const { relPath } = this.storage.saveBuffer(
        'users/passport',
        packed,
        '.enc',
      );
      meta.photoPath = relPath;
      meta.photoMime = photo.mimetype || 'application/octet-stream';
      meta.photoName = photo.originalname || 'passport.bin';
    }
    if (passportNumber) {
      meta.number = this.crypto.encryptText(passportNumber);
    }
    return JSON.stringify(meta);
  }

  private parsePassportEnc(raw: string | null): PassportEncMeta | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PassportEncMeta;
    } catch {
      return null;
    }
  }

  private toPublic<
    T extends {
      passportEnc: string | null;
      contractPhotoPath: string | null;
      employeePhotoPath: string | null;
      managedBranches?: { cityId: string }[];
    },
  >(user: T) {
    const { passportEnc, managedBranches, ...rest } = user;
    const meta = this.parsePassportEnc(passportEnc);
    return {
      ...rest,
      managedCityIds: (managedBranches ?? []).map((b) => b.cityId),
      hasPassport: Boolean(meta?.photoPath || meta?.number),
      hasPassportPhoto: Boolean(meta?.photoPath),
      hasPassportNumber: Boolean(meta?.number),
      hasContractPhoto: Boolean(user.contractPhotoPath),
      hasEmployeePhoto: Boolean(user.employeePhotoPath),
    };
  }
}
