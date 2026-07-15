import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join, normalize, resolve, sep } from 'path';
import { randomBytes } from 'crypto';

/** Минимальное описание файла из multer (memoryStorage). */
export interface UploadedMemoryFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_EXT = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
]);

@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR || '/data/uploads');

  /** Сохраняет буфер в подпапку. Возвращает относительный путь для хранения в БД. */
  save(subdir: string, file: UploadedMemoryFile): { relPath: string } {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Пустой файл');
    }
    const cleanSub = normalize(subdir).replace(/^(\.\.(\/|\\|$))+/, '');
    const ext = extname(file.originalname).toLowerCase().slice(0, 12);
    if (ext && !ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(`Недопустимый тип файла: ${ext}`);
    }
    const dir = join(this.root, cleanSub);
    mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
    const abs = join(dir, name);
    writeFileSync(abs, file.buffer);
    return { relPath: join(cleanSub, name).split(sep).join('/') };
  }

  /** Абсолютный путь с защитой от path traversal. */
  absolute(relPath: string): string {
    const abs = resolve(this.root, normalize(relPath));
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new BadRequestException('Некорректный путь файла');
    }
    return abs;
  }

  stream(relPath: string) {
    const abs = this.absolute(relPath);
    if (!existsSync(abs)) throw new NotFoundException('Файл не найден');
    return createReadStream(abs);
  }
}
