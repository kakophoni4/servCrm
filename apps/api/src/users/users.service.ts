import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
  ) {}

  list(status?: UserStatus) {
    return this.prisma.user
      .findMany({
        where: {
          role: { not: Role.MASTER },
          ...(status ? { status } : {}),
        },
        select: userSelect,
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((u) => this.toPublic(u)));
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
    },
    files?: CreateUserFiles,
  ) {
    if (input.role === Role.MASTER) {
      throw new BadRequestException('Мастеров создавайте через /masters');
    }
    const login = input.login.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new ConflictException('Логин занят');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const hiredAt = input.hiredAt ? new Date(input.hiredAt) : new Date();
    if (Number.isNaN(hiredAt.getTime())) {
      throw new BadRequestException('Некорректная дата начала работы');
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

    const user = await this.prisma.user.create({
      data: {
        login,
        passwordHash,
        fullName: input.fullName.trim(),
        role: input.role,
        phone: input.phone?.trim() || null,
        cityId: input.cityId?.trim() || null,
        telegramId: input.telegramId?.trim() || null,
        hiredAt,
        status: UserStatus.ACTIVE,
        passportEnc,
        contractPhotoPath,
        employeePhotoPath,
      },
      select: userSelect,
    });
    return this.toPublic(user);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return this.toPublic(user);
  }

  async fire(
    id: string,
    input: { reason: string; recommendedHire: boolean },
  ) {
    if (!input.reason?.trim()) {
      throw new BadRequestException('Укажите причину увольнения');
    }
    await this.getRaw(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.FIRED,
        firedAt: new Date(),
        fireReason: input.reason,
        recommendedHire: input.recommendedHire,
      },
      select: userSelect,
    });
    return this.toPublic(user);
  }

  async restore(id: string) {
    await this.getRaw(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        firedAt: null,
        fireReason: null,
        recommendedHire: null,
      },
      select: userSelect,
    });
    return this.toPublic(user);
  }

  /** Расшифровка фото паспорта на лету (OWNER/DIRECTOR). */
  async getPassportPhoto(id: string): Promise<{
    buffer: Buffer;
    mime: string;
    fileName: string;
  }> {
    const user = await this.getRaw(id);
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

  async getEmployeePhoto(id: string): Promise<{
    buffer: Buffer;
    mime: string;
    fileName: string;
    streamPath: string;
  }> {
    const user = await this.getRaw(id);
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
    },
  >(user: T) {
    const { passportEnc, ...rest } = user;
    const meta = this.parsePassportEnc(passportEnc);
    return {
      ...rest,
      hasPassport: Boolean(meta?.photoPath || meta?.number),
      hasPassportPhoto: Boolean(meta?.photoPath),
      hasPassportNumber: Boolean(meta?.number),
      hasContractPhoto: Boolean(user.contractPhotoPath),
      hasEmployeePhoto: Boolean(user.employeePhotoPath),
    };
  }
}
