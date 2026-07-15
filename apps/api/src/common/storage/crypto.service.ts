import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Пакет: [iv 12][tag 16][ciphertext …] */
export type EncryptedText = {
  ct: string;
  iv: string;
  tag: string;
};

@Injectable()
export class CryptoService {
  private key(): Buffer {
    const raw = process.env.APP_ENC_KEY?.trim();
    if (!raw) {
      throw new InternalServerErrorException(
        'APP_ENC_KEY не задан — шифрование недоступно',
      );
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    try {
      const b64 = Buffer.from(raw, 'base64');
      if (b64.length === 32) return b64;
    } catch {
      /* fall through */
    }
    return createHash('sha256').update(raw, 'utf8').digest();
  }

  /** Шифрует буфер; возвращает self-contained пакет iv+tag+ciphertext. */
  encryptBuffer(data: Buffer): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key(), iv);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  }

  decryptBuffer(packed: Buffer): Buffer {
    if (packed.length < IV_LEN + TAG_LEN + 1) {
      throw new InternalServerErrorException('Повреждённый шифротекст');
    }
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
  }

  encryptText(text: string): EncryptedText {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key(), iv);
    const enc = Buffer.concat([
      cipher.update(Buffer.from(text, 'utf8')),
      cipher.final(),
    ]);
    return {
      ct: enc.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decryptText(payload: EncryptedText): string {
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const enc = Buffer.from(payload.ct, 'base64');
    const decipher = createDecipheriv(ALGO, this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      'utf8',
    );
  }
}
