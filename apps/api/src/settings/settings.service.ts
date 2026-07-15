import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Role, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { BranchScopeService } from '../common/branch/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

function payRange(from?: string, to?: string) {
  const now = new Date();
  const start =
    from != null
      ? new Date(from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
  let end: Date;
  if (to != null) {
    end =
      /^\d{4}-\d{2}-\d{2}$/.test(to) && !to.includes('T')
        ? new Date(`${to}T23:59:59.999`)
        : new Date(to);
  } else {
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }
  return { start, end };
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export const SETTING_KEYS = {
  botToken: 'bot.telegram.token',
  botEnabled: 'bot.telegram.enabled',
  botUsername: 'bot.telegram.username',
  botWebhookSecret: 'bot.telegram.webhookSecret',
} as const;

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branch: BranchScopeService,
  ) {}

  // ---- дженерик ключ-значение ----
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  set(key: string, value: string) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  // ---- Telegram-бот ----
  /** Реальный токен: сначала из БД (админка), потом из env как fallback. */
  async getBotToken(): Promise<string> {
    const fromDb = await this.get(SETTING_KEYS.botToken);
    return fromDb || process.env.TELEGRAM_BOT_TOKEN || '';
  }

  async getWebhookSecret(): Promise<string | null> {
    return this.get(SETTING_KEYS.botWebhookSecret);
  }

  /** Генерирует секрет webhook, если ещё нет; возвращает актуальный. */
  async ensureWebhookSecret(): Promise<string> {
    const existing = await this.getWebhookSecret();
    if (existing) return existing;
    const secret = randomBytes(24).toString('hex');
    await this.set(SETTING_KEYS.botWebhookSecret, secret);
    return secret;
  }

  async getBotConfig() {
    const dbToken = await this.get(SETTING_KEYS.botToken);
    const token = dbToken || process.env.TELEGRAM_BOT_TOKEN || '';
    const enabled = (await this.get(SETTING_KEYS.botEnabled)) === 'true';
    const username = await this.get(SETTING_KEYS.botUsername);
    const webhookSecret = await this.getWebhookSecret();
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    return {
      hasToken: Boolean(token),
      tokenMasked: maskToken(token),
      source: dbToken ? 'db' : process.env.TELEGRAM_BOT_TOKEN ? 'env' : 'none',
      enabled,
      username: username || null,
      hasWebhookSecret: Boolean(webhookSecret),
      webhookUrl: baseUrl && webhookSecret
        ? `${baseUrl}/api/bot/webhook/${webhookSecret}`
        : null,
      baseUrl: baseUrl || null,
    };
  }

  async setBotConfig(data: { token?: string; enabled?: boolean }) {
    if (data.token !== undefined) {
      await this.set(SETTING_KEYS.botToken, data.token.trim());
    }
    if (data.enabled !== undefined) {
      await this.set(SETTING_KEYS.botEnabled, data.enabled ? 'true' : 'false');
    }
    return this.getBotConfig();
  }

  /** Проверка токена через Telegram getMe. Сохраняет username при успехе. */
  async testBot() {
    const token = await this.getBotToken();
    if (!token) {
      return { ok: false, error: 'Токен не задан' };
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
        { method: 'GET' },
      );
      const json = (await res.json()) as {
        ok: boolean;
        result?: { username?: string; first_name?: string };
        description?: string;
      };
      if (!json.ok) {
        return { ok: false, error: json.description || 'Неверный токен' };
      }
      const username = json.result?.username ?? null;
      if (username) await this.set(SETTING_KEYS.botUsername, username);
      return {
        ok: true,
        username,
        name: json.result?.first_name ?? null,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Ошибка запроса к Telegram',
      };
    }
  }

  /**
   * Регистрирует webhook в Telegram: BASE_URL/api/bot/webhook/<secret>.
   * Генерирует secret при отсутствии.
   */
  async setWebhook() {
    const token = await this.getBotToken();
    if (!token) {
      return { ok: false, error: 'Токен не задан' };
    }
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
    if (!baseUrl) {
      return {
        ok: false,
        error: 'Не задан BASE_URL (публичный HTTPS-адрес API)',
      };
    }
    const secret = await this.ensureWebhookSecret();
    const url = `${baseUrl}/api/bot/webhook/${secret}`;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        },
      );
      const json = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: boolean;
      };
      if (!json.ok) {
        return {
          ok: false,
          error: json.description || 'Telegram отклонил setWebhook',
          url,
        };
      }
      return { ok: true, url, description: json.description ?? null };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Ошибка запроса к Telegram',
        url,
      };
    }
  }

  // ---- ЗП диспетчеров ----
  async getDispatcherPay(userId: string) {
    const row = await this.prisma.dispatcherPaySettings.findUnique({
      where: { userId },
    });
    return {
      userId,
      salaryBase: Number(row?.salaryBase ?? 0),
      dailyTurnoverPct: Number(row?.dailyTurnoverPct ?? 0),
      leafletBonus: Number(row?.leafletBonus ?? 0),
      closedOrdersBonusPct: Number(row?.closedOrdersBonusPct ?? 0),
    };
  }

  upsertDispatcherPay(
    userId: string,
    data: {
      salaryBase?: number;
      dailyTurnoverPct?: number;
      leafletBonus?: number;
      closedOrdersBonusPct?: number;
    },
  ) {
    return this.prisma.dispatcherPaySettings.upsert({
      where: { userId },
      create: {
        userId,
        salaryBase: data.salaryBase ?? 0,
        dailyTurnoverPct: data.dailyTurnoverPct ?? 0,
        leafletBonus: data.leafletBonus ?? 0,
        closedOrdersBonusPct: data.closedOrdersBonusPct ?? 0,
      },
      update: data,
    });
  }

  /** График смен на месяц в филиале: день → диспетчер (или пусто). */
  async getDispatcherSchedule(
    year: number,
    month: number,
    actorUserId: string,
    actorRole: Role,
    requestedCityId?: string,
  ) {
    if (!Number.isFinite(year) || month < 1 || month > 12) {
      throw new BadRequestException('Некорректный месяц');
    }
    const cityId = await this.resolveScheduleCityId(
      actorUserId,
      actorRole,
      requestedCityId,
    );
    const daysInMonth = new Date(year, month, 0).getDate();
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month - 1, daysInMonth));

    const shifts = await this.prisma.dispatcherShift.findMany({
      where: {
        cityId,
        workDate: { gte: start, lte: end },
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
    const byDate = new Map(
      shifts.map((s) => [
        s.workDate.toISOString().slice(0, 10),
        { userId: s.userId, fullName: s.user.fullName },
      ]),
    );

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const assigned = byDate.get(date) ?? null;
      days.push({
        date,
        day: d,
        userId: assigned?.userId ?? null,
        fullName: assigned?.fullName ?? null,
      });
    }
    return { year, month, cityId, days };
  }

  async setDispatcherShift(
    date: string,
    userId: string | null,
    actorUserId: string,
    actorRole: Role,
    requestedCityId?: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Некорректная дата');
    }
    const workDate = new Date(`${date}T00:00:00.000Z`);

    if (!userId) {
      const cityId = await this.resolveScheduleCityId(
        actorUserId,
        actorRole,
        requestedCityId,
      );
      await this.prisma.dispatcherShift.deleteMany({
        where: { workDate, cityId },
      });
      return { date, cityId, userId: null };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        fullName: true,
        cityId: true,
      },
    });
    if (
      !user ||
      user.role !== Role.DISPATCHER ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new NotFoundException('Диспетчер не найден');
    }
    if (!user.cityId) {
      throw new BadRequestException('У диспетчера не назначен филиал');
    }

    const cityId = await this.resolveScheduleCityId(
      actorUserId,
      actorRole,
      requestedCityId ?? user.cityId,
    );
    if (user.cityId !== cityId) {
      throw new ForbiddenException('Диспетчер другого филиала');
    }

    const row = await this.prisma.dispatcherShift.upsert({
      where: { workDate_cityId: { workDate, cityId } },
      create: { workDate, cityId, userId },
      update: { userId },
      include: { user: { select: { id: true, fullName: true } } },
    });
    return {
      date,
      cityId,
      userId: row.userId,
      fullName: row.user.fullName,
    };
  }

  private async resolveScheduleCityId(
    actorUserId: string,
    actorRole: Role,
    requestedCityId?: string,
  ): Promise<string> {
    const allowed = await this.branch.allowedCityIds(actorUserId, actorRole);
    const resolved = this.branch.resolveCityIds(allowed, requestedCityId);
    if (resolved === null) {
      // OWNER без cityId — нельзя: график всегда по филиалу
      if (!requestedCityId) {
        throw new BadRequestException('Укажите филиал');
      }
      return requestedCityId;
    }
    if (!resolved.length) {
      throw new ForbiddenException('Филиал вне доступа');
    }
    if (requestedCityId) {
      if (!resolved.includes(requestedCityId)) {
        throw new ForbiddenException('Филиал вне доступа');
      }
      return requestedCityId;
    }
    return resolved[0];
  }

  /**
   * Расчёт ЗП диспетчера за период:
   * оклад + % от оборота + бонус за листовки (ставка за каждые 100 шт.) + % от своих закрытых.
   */
  async calcDispatcherPay(userId: string, from?: string, to?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, role: true, cityId: true },
    });
    if (!user || user.role !== Role.DISPATCHER) {
      throw new NotFoundException('Диспетчер не найден');
    }
    return this.calcDispatcherPayForUser(user, from, to);
  }

  /** Сводка по всем активным диспетчерам. */
  async summaryDispatcherPay(from?: string, to?: string) {
    const dispatchers = await this.prisma.user.findMany({
      where: { role: Role.DISPATCHER, status: UserStatus.ACTIVE },
      select: { id: true, fullName: true, role: true, cityId: true },
      orderBy: { fullName: 'asc' },
    });
    const rows = [];
    for (const u of dispatchers) {
      rows.push(await this.calcDispatcherPayForUser(u, from, to));
    }
    return rows;
  }

  private async calcDispatcherPayForUser(
    user: { id: string; fullName: string; cityId?: string | null },
    from?: string,
    to?: string,
  ) {
    const { start, end } = payRange(from, to);
    const settings = await this.prisma.dispatcherPaySettings.findUnique({
      where: { userId: user.id },
    });

    const salaryBase = Number(settings?.salaryBase ?? 0);
    const dailyTurnoverPct = Number(settings?.dailyTurnoverPct ?? 0);
    const leafletBonusRate = Number(settings?.leafletBonus ?? 0);
    const closedOrdersBonusPct = Number(settings?.closedOrdersBonusPct ?? 0);

    const closedOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DONE,
        updatedAt: { gte: start, lte: end },
        ...(user.cityId != null ? { cityId: user.cityId } : {}),
      },
      include: { payment: true },
    });

    const turnover = closedOrders.reduce(
      (s, o) => s + Number(o.payment?.toCompany ?? 0),
      0,
    );

    const ownClosedNet = closedOrders
      .filter((o) => o.createdById === user.id)
      .reduce((s, o) => s + Number(o.payment?.toCompany ?? 0), 0);

    // Листовки за дни смен диспетчера; если графика нет — отчёты, которые он создал.
    const shifts = await this.prisma.dispatcherShift.findMany({
      where: {
        userId: user.id,
        workDate: { gte: start, lte: end },
      },
      select: { workDate: true },
    });
    const adReports =
      shifts.length > 0
        ? await this.prisma.adDailyReport.findMany({
            where: {
              reportDate: { in: shifts.map((s) => s.workDate) },
              ...(user.cityId != null ? { cityId: user.cityId } : {}),
            },
            select: { leafletsSpread: true },
          })
        : await this.prisma.adDailyReport.findMany({
            where: {
              createdById: user.id,
              reportDate: { gte: start, lte: end },
            },
            select: { leafletsSpread: true },
          });
    const leaflets = adReports.reduce((s, r) => s + r.leafletsSpread, 0);

    const dailyTurnoverPay = roundMoney(dailyTurnoverPct * turnover);
    // leafletBonus — ₽ за каждые 100 розданных листовок в смену
    const leafletsPay = roundMoney(leafletBonusRate * (leaflets / 100));
    const closedOrdersBonus = roundMoney(closedOrdersBonusPct * ownClosedNet);
    const salary = roundMoney(salaryBase);
    const total = roundMoney(
      salary + dailyTurnoverPay + leafletsPay + closedOrdersBonus,
    );

    return {
      userId: user.id,
      fullName: user.fullName,
      period: { from: start, to: end },
      salaryBase: salary,
      dailyTurnoverPay,
      leafletsPay,
      closedOrdersBonus,
      total,
      meta: {
        turnover: roundMoney(turnover),
        leaflets,
        ownClosedNet: roundMoney(ownClosedNet),
        settings: {
          salaryBase,
          dailyTurnoverPct,
          leafletBonus: leafletBonusRate,
          closedOrdersBonusPct,
        },
      },
    };
  }
}
