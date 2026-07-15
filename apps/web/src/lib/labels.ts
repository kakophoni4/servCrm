export const STATUS_LABELS: Record<string, string> = {
  NOT_SCHEDULED: 'Не оформлена',
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

export const DOC_KIND_LABELS: Record<string, string> = {
  RECEIPT_SERVICE: 'Чек за услугу',
  RECEIPT_PARTS: 'Чек за запчасти',
  CONTRACT: 'Договор',
  PARTS_PHOTO: 'Фото запчастей',
  RECEIPT_SD: 'Чек СД',
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

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
