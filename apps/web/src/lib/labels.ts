export const STATUS_LABELS: Record<string, string> = {
  NOT_SCHEDULED: 'Не назначена',
  WAITING: 'Ожидает',
  ON_THE_WAY: 'В пути',
  IN_PROGRESS: 'В работе',
  IN_PROGRESS_SD: 'В работе СД',
  DONE: 'Готов',
  REFUSAL: 'Отказ',
  CANCELLED_CC: 'Отмена КЦ',
};

export const TYPE_LABELS: Record<string, string> = {
  NEW: 'Новый клиент',
  WARRANTY: 'Гарантия',
  REPEAT: 'Повторный',
};

export const SOURCE_KIND_LABELS: Record<string, string> = {
  OUR: 'Наша',
  PARTNER: 'Партнёрская',
};

export const SOURCE_OUR_LABELS: Record<string, string> = {
  AVITO: 'Авито',
  LEAFLET: 'Листовка',
};

export const ROLE_LABELS: Record<string, string> = {
  DISPATCHER: 'Диспетчер',
  ADMIN: 'Администратор',
  DIRECTOR: 'Директор',
  OWNER: 'Владелец',
  MASTER: 'Мастер',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  FIRED: 'Уволен',
};

/** Типы, доступные для загрузки к заявке */
export const ORDER_UPLOAD_DOC_KINDS = [
  'CONTRACT',
  'RECEIPT_SERVICE',
  'RECEIPT_PARTS',
  'PARTS_PHOTO',
  'RECEIPT_SD',
] as const;

export const DOC_KIND_LABELS: Record<string, string> = {
  CONTRACT: 'Договор',
  RECEIPT_SERVICE: 'Чек за услугу',
  RECEIPT_PARTS: 'Чек за комплектующие / расходы',
  PARTS_PHOTO: 'Фото запчастей и комплектующих',
  RECEIPT_SD: 'Сохранная расписка',
  // legacy (только отображение старых записей)
  AD_SCREEN: 'Скрин рекламы',
  CASH_DOC: 'Кассовый документ',
  OTHER: 'Прочее',
};

export const CASH_DIRECTION_LABELS: Record<string, string> = {
  INCOME: 'Приход',
  EXPENSE: 'Расход',
  COLLECTION: 'Инкассация',
};

export const CASH_INCOME_BASIS_LABELS: Record<string, string> = {
  ORDER: 'По заявке',
  EXTRA_FUNDING: 'Доп. финансирование',
  FINE: 'Штраф',
  OTHER: 'Прочее',
};

export const CASH_EXPENSE_BASIS_LABELS: Record<string, string> = {
  RENT_APT: 'Аренда квартиры',
  RENT_OFFICE: 'Аренда офиса',
  CARDS: 'Карты',
  SALARY_DIR: 'ЗП директора',
  SALARY_DISP: 'ЗП диспетчера',
  SALARY_SENIOR_MASTER: 'ЗП ст. мастера',
  SALARY_PROMO: 'ЗП промоутера',
  TRIP: 'Командировка',
  COLLECTION_FEE: 'Инкассация (комиссия)',
  CONTEST: 'Конкурс',
  LEAFLETS: 'Листовки',
  SELF_EMPLOYED_TAX: 'Налог самозанятого',
  HIRE_ADS: 'Реклама найма',
  AVITO_ADS: 'Авито реклама',
  OFFICE: 'Офис',
  BONUS: 'Премия',
  OTHER_EXPENSE: 'Прочий расход',
  IP_EXPENSE: 'Расход ИП',
  OPERATING: 'Операционные',
};

export const ASSET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'В эксплуатации',
  WRITTEN_OFF: 'Списано',
};

export const CHAT_CHANNEL_LABELS: Record<string, string> = {
  TELEGRAM: 'Telegram',
  MAX: 'MAX',
  WEB: 'Веб',
};

export const CHAT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Открыт',
  CLOSED: 'Закрыт',
};

export function isAdminRole(role: string) {
  return role === 'ADMIN' || role === 'DIRECTOR' || role === 'OWNER';
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Диапазон календарного месяца (локальная дата, без сдвига UTC). month = 1..12 */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth() + 1);
}
