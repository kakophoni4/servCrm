import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SETTING_KEYS = {
  botToken: 'bot.telegram.token',
  botEnabled: 'bot.telegram.enabled',
  botUsername: 'bot.telegram.username',
} as const;

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getBotConfig() {
    const dbToken = await this.get(SETTING_KEYS.botToken);
    const token = dbToken || process.env.TELEGRAM_BOT_TOKEN || '';
    const enabled = (await this.get(SETTING_KEYS.botEnabled)) === 'true';
    const username = await this.get(SETTING_KEYS.botUsername);
    return {
      hasToken: Boolean(token),
      tokenMasked: maskToken(token),
      source: dbToken ? 'db' : process.env.TELEGRAM_BOT_TOKEN ? 'env' : 'none',
      enabled,
      username: username || null,
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

  // ---- ЗП диспетчеров ----
  getDispatcherPay(userId: string) {
    return this.prisma.dispatcherPaySettings.findUnique({ where: { userId } });
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
}
