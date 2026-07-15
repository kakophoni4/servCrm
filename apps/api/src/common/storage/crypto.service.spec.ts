import { InternalServerErrorException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CryptoService, EncryptedText } from './crypto.service';

const IV_LEN = 12;
const TAG_LEN = 16;
const MIN_PACKED_LEN = IV_LEN + TAG_LEN + 1;

/** 64 hex-символа → 32 байта ключа AES-256 */
const HEX_KEY = 'ab'.repeat(32);

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    process.env.APP_ENC_KEY = HEX_KEY;
    service = new CryptoService();
  });

  afterEach(() => {
    delete process.env.APP_ENC_KEY;
  });

  describe('encryptText / decryptText', () => {
    it('round-trip: кириллица', () => {
      const plain = 'Привет, мир! Тест шифрования 🔐';
      const encrypted = service.encryptText(plain);
      expect(service.decryptText(encrypted)).toBe(plain);
    });

    it('round-trip: пустая строка', () => {
      const encrypted = service.encryptText('');
      expect(service.decryptText(encrypted)).toBe('');
    });

    it('round-trip: длинный текст', () => {
      const plain = 'А'.repeat(10_000);
      const encrypted = service.encryptText(plain);
      expect(service.decryptText(encrypted)).toBe(plain);
    });
  });

  describe('encryptBuffer / decryptBuffer', () => {
    it('round-trip: Buffer со случайными байтами', () => {
      const plain = randomBytes(256);
      const packed = service.encryptBuffer(plain);
      expect(service.decryptBuffer(packed).equals(plain)).toBe(true);
    });
  });

  describe('APP_ENC_KEY — форматы ключа', () => {
    it('hex (64 символа)', () => {
      process.env.APP_ENC_KEY = HEX_KEY;
      const svc = new CryptoService();
      const plain = 'hex-key-test';
      expect(svc.decryptText(svc.encryptText(plain))).toBe(plain);
    });

    it('base64 (32 байта)', () => {
      const b64Key = randomBytes(32).toString('base64');
      process.env.APP_ENC_KEY = b64Key;
      const svc = new CryptoService();
      const plain = Buffer.from('base64-key-test');
      const packed = svc.encryptBuffer(plain);
      expect(svc.decryptBuffer(packed).equals(plain)).toBe(true);
    });

    it('произвольная passphrase → sha256', () => {
      process.env.APP_ENC_KEY = 'my-secret-passphrase';
      const svc = new CryptoService();
      const plain = 'passphrase-key-test';
      expect(svc.decryptText(svc.encryptText(plain))).toBe(plain);
    });
  });

  describe('decryptBuffer — повреждённый/короткий пакет', () => {
    it('пакет короче IV+TAG+1 бросает InternalServerErrorException', () => {
      expect(() => service.decryptBuffer(Buffer.alloc(0))).toThrow(
        InternalServerErrorException,
      );
      expect(() =>
        service.decryptBuffer(Buffer.alloc(MIN_PACKED_LEN - 1)),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('decryptText — подменённый tag', () => {
    it('бросает ошибку при неверном authentication tag', () => {
      const encrypted = service.encryptText('секретные данные');
      const tampered: EncryptedText = {
        ...encrypted,
        tag: randomBytes(TAG_LEN).toString('base64'),
      };
      expect(() => service.decryptText(tampered)).toThrow();
    });
  });

  describe('без APP_ENC_KEY', () => {
    const dummyPayload: EncryptedText = {
      ct: Buffer.from('test').toString('base64'),
      iv: Buffer.alloc(IV_LEN).toString('base64'),
      tag: Buffer.alloc(TAG_LEN).toString('base64'),
    };
    const dummyPacked = Buffer.alloc(MIN_PACKED_LEN);

    beforeEach(() => {
      delete process.env.APP_ENC_KEY;
      service = new CryptoService();
    });

    it('encryptText бросает InternalServerErrorException', () => {
      expect(() => service.encryptText('test')).toThrow(
        InternalServerErrorException,
      );
    });

    it('decryptText бросает InternalServerErrorException', () => {
      expect(() => service.decryptText(dummyPayload)).toThrow(
        InternalServerErrorException,
      );
    });

    it('encryptBuffer бросает InternalServerErrorException', () => {
      expect(() => service.encryptBuffer(Buffer.from('test'))).toThrow(
        InternalServerErrorException,
      );
    });

    it('decryptBuffer бросает InternalServerErrorException', () => {
      expect(() => service.decryptBuffer(dummyPacked)).toThrow(
        InternalServerErrorException,
      );
    });
  });
});
