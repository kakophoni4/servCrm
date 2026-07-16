import { describe, it, expect } from 'vitest';
import {
  STATUS_LABELS,
  TYPE_LABELS,
  SOURCE_KIND_LABELS,
  SOURCE_OUR_LABELS,
  ROLE_LABELS,
  USER_STATUS_LABELS,
  DOC_KIND_LABELS,
  ORDER_UPLOAD_DOC_KINDS,
  requiredOrderDocKinds,
  CASH_DIRECTION_LABELS,
  CASH_INCOME_BASIS_LABELS,
  CASH_EXPENSE_BASIS_LABELS,
  ASSET_STATUS_LABELS,
  CHAT_CHANNEL_LABELS,
  CHAT_STATUS_LABELS,
  isAdminRole,
  currentMonthRange,
  monthRange,
} from './labels';

describe('STATUS_LABELS', () => {
  it('маппит известные статусы заявок', () => {
    expect(STATUS_LABELS.NOT_SCHEDULED).toBe('Не назначена');
    expect(STATUS_LABELS.WAITING).toBe('Ожидает');
    expect(STATUS_LABELS.IN_PROGRESS).toBe('В работе');
    expect(STATUS_LABELS.DONE).toBe('Готов');
    expect(STATUS_LABELS.REFUSAL).toBe('Отказ');
  });

  it('возвращает undefined для неизвестного ключа', () => {
    expect(STATUS_LABELS.UNKNOWN_STATUS).toBeUndefined();
  });
});

describe('TYPE_LABELS', () => {
  it('маппит типы клиентов', () => {
    expect(TYPE_LABELS.NEW).toBe('Новый клиент');
    expect(TYPE_LABELS.WARRANTY).toBe('Гарантия');
    expect(TYPE_LABELS.REPEAT).toBe('Повторный');
  });
});

describe('SOURCE_KIND_LABELS', () => {
  it('маппит виды источников', () => {
    expect(SOURCE_KIND_LABELS.OUR).toBe('Наша');
    expect(SOURCE_KIND_LABELS.PARTNER).toBe('Партнёрская');
  });
});

describe('SOURCE_OUR_LABELS', () => {
  it('маппит наши источники', () => {
    expect(SOURCE_OUR_LABELS.AVITO).toBe('Авито');
    expect(SOURCE_OUR_LABELS.LEAFLET).toBe('Листовка');
  });
});

describe('ROLE_LABELS', () => {
  it('маппит роли пользователей', () => {
    expect(ROLE_LABELS.DISPATCHER).toBe('Диспетчер');
    expect(ROLE_LABELS.ADMIN).toBe('Администратор');
    expect(ROLE_LABELS.DIRECTOR).toBe('Директор');
    expect(ROLE_LABELS.OWNER).toBe('Владелец');
    expect(ROLE_LABELS.MASTER).toBe('Мастер');
  });
});

describe('USER_STATUS_LABELS', () => {
  it('маппит статусы пользователей', () => {
    expect(USER_STATUS_LABELS.ACTIVE).toBe('Активен');
    expect(USER_STATUS_LABELS.FIRED).toBe('Уволен');
  });
});

describe('DOC_KIND_LABELS', () => {
  it('маппит виды документов', () => {
    expect(DOC_KIND_LABELS.RECEIPT_SERVICE).toBe('Чек за услугу');
    expect(DOC_KIND_LABELS.CONTRACT).toBe('Договор');
    expect(DOC_KIND_LABELS.RECEIPT_PARTS).toBe('Чек за комплектующие / расходы');
    expect(DOC_KIND_LABELS.PARTS_PHOTO).toBe('Фото запчастей и комплектующих');
    expect(DOC_KIND_LABELS.RECEIPT_SD).toBe('Сохранная расписка');
    expect(DOC_KIND_LABELS.OTHER).toBe('Прочее');
  });

  it('ORDER_UPLOAD_DOC_KINDS без сохранной и без устаревших типов', () => {
    expect(ORDER_UPLOAD_DOC_KINDS).toEqual([
      'CONTRACT',
      'RECEIPT_SERVICE',
      'RECEIPT_PARTS',
      'PARTS_PHOTO',
    ]);
    expect(ORDER_UPLOAD_DOC_KINDS).not.toContain('RECEIPT_SD');
    expect(ORDER_UPLOAD_DOC_KINDS).not.toContain('AD_SCREEN');
    expect(ORDER_UPLOAD_DOC_KINDS).not.toContain('CASH_DOC');
  });

  it('requiredOrderDocKinds зависит от суммы комплектующих, без сохранной', () => {
    expect(requiredOrderDocKinds(0)).toEqual([
      'CONTRACT',
      'RECEIPT_SERVICE',
    ]);
    expect(requiredOrderDocKinds(50)).toEqual(
      expect.arrayContaining(['RECEIPT_PARTS', 'PARTS_PHOTO']),
    );
    expect(requiredOrderDocKinds(50)).not.toContain('RECEIPT_SD');
  });
});

describe('CASH_DIRECTION_LABELS', () => {
  it('маппит направления кассовых операций', () => {
    expect(CASH_DIRECTION_LABELS.INCOME).toBe('Приход');
    expect(CASH_DIRECTION_LABELS.EXPENSE).toBe('Расход');
    expect(CASH_DIRECTION_LABELS.COLLECTION).toBe('Инкассация');
  });
});

describe('CASH_INCOME_BASIS_LABELS', () => {
  it('маппит основания прихода', () => {
    expect(CASH_INCOME_BASIS_LABELS.ORDER).toBe('По заявке');
    expect(CASH_INCOME_BASIS_LABELS.FINE).toBe('Штраф');
  });
});

describe('CASH_EXPENSE_BASIS_LABELS', () => {
  it('маппит основания расхода', () => {
    expect(CASH_EXPENSE_BASIS_LABELS.SALARY_DISP).toBe('ЗП диспетчера');
    expect(CASH_EXPENSE_BASIS_LABELS.AVITO_ADS).toBe('Авито реклама');
    expect(CASH_EXPENSE_BASIS_LABELS.OTHER_EXPENSE).toBe('Прочий расход');
  });
});

describe('ASSET_STATUS_LABELS', () => {
  it('маппит статусы имущества', () => {
    expect(ASSET_STATUS_LABELS.ACTIVE).toBe('В эксплуатации');
    expect(ASSET_STATUS_LABELS.WRITTEN_OFF).toBe('Списано');
  });
});

describe('CHAT_CHANNEL_LABELS', () => {
  it('маппит каналы чата', () => {
    expect(CHAT_CHANNEL_LABELS.TELEGRAM).toBe('Telegram');
    expect(CHAT_CHANNEL_LABELS.WEB).toBe('Веб');
  });
});

describe('CHAT_STATUS_LABELS', () => {
  it('маппит статусы чата', () => {
    expect(CHAT_STATUS_LABELS.OPEN).toBe('Открыт');
    expect(CHAT_STATUS_LABELS.CLOSED).toBe('Закрыт');
  });
});

describe('isAdminRole', () => {
  it('возвращает true для ADMIN, DIRECTOR, OWNER', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('DIRECTOR')).toBe(true);
    expect(isAdminRole('OWNER')).toBe(true);
  });

  it('возвращает false для остальных ролей', () => {
    expect(isAdminRole('DISPATCHER')).toBe(false);
    expect(isAdminRole('MASTER')).toBe(false);
    expect(isAdminRole('UNKNOWN')).toBe(false);
  });
});

describe('monthRange', () => {
  it('возвращает полный календарный месяц', () => {
    expect(monthRange(2026, 7)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(monthRange(2026, 2)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });
});

describe('currentMonthRange', () => {
  it('возвращает from/to в формате YYYY-MM-DD за текущий месяц', () => {
    const now = new Date();
    const { from, to } = currentMonthRange();
    const expected = monthRange(now.getFullYear(), now.getMonth() + 1);

    expect(from).toBe(expected.from);
    expect(to).toBe(expected.to);
    expect(from.slice(0, 7)).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    );
  });
});
