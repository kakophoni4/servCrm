import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TRUNCATE_TABLES = [
  'chat_messages',
  'chat_threads',
  'order_documents',
  'order_payments',
  'cash_tx',
  'claims',
  'master_settlements',
  'ad_daily_reports',
  'assets',
  'orders',
  'masters',
  'clients',
  'branch_directors',
  'dispatcher_pay_settings',
  'users',
  'cities',
  'partners',
  'age_categories',
  'salary_categories',
  'app_settings',
] as const;

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  const originRaw = process.env.CORS_ORIGIN ?? '*';
  const origin =
    originRaw === '*'
      ? true
      : originRaw.split(',').map((s) => s.trim()).filter(Boolean);

  app.enableCors({ origin, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  const tableList = TRUNCATE_TABLES.map((table) => `"${table}"`).join(', ');
  const sql = `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`;

  // Фоновые fire-and-forget запросы приложения (напр. bot.notifyAdminsNewOrder)
  // могут держать AccessShareLock и конфликтовать с AccessExclusiveLock от TRUNCATE,
  // вызывая deadlock (40P01). Такие запросы короткие — ретраим с backoff.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDeadlock =
        message.includes('deadlock detected') || message.includes('40P01');
      if (!isDeadlock || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}
