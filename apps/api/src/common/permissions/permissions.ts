/** Каталог разрешений CRM. Позже можно сократить. */
export type PermissionDef = {
  key: string;
  group: string;
  label: string;
};

export const PERMISSIONS: PermissionDef[] = [
  // Заявки
  { key: 'orders.read', group: 'Заявки', label: 'Просмотр заявок' },
  { key: 'orders.write', group: 'Заявки', label: 'Создание и изменение заявок' },
  { key: 'orders.assign_master', group: 'Заявки', label: 'Назначение мастера' },
  { key: 'orders.edit_payments', group: 'Заявки', label: 'Редактирование оплаты' },
  { key: 'orders.edit_schedule', group: 'Заявки', label: 'Назначение даты / статусы исполнения' },
  { key: 'orders.edit_admin_fields', group: 'Заявки', label: 'Админ-поля заявки' },
  { key: 'orders.recent', group: 'Заявки', label: 'Лента новых заявок' },
  { key: 'documents.read', group: 'Заявки', label: 'Просмотр документов' },
  { key: 'documents.write', group: 'Заявки', label: 'Загрузка документов' },
  { key: 'documents.delete', group: 'Заявки', label: 'Удаление документов' },

  // Клиенты и претензии
  { key: 'clients.read', group: 'Клиенты', label: 'Просмотр клиентов' },
  { key: 'clients.comment', group: 'Клиенты', label: 'Комментарий филиала' },
  { key: 'claims.read', group: 'Претензии', label: 'Просмотр претензий' },
  { key: 'claims.write', group: 'Претензии', label: 'Создание и закрытие претензий' },

  // Мастера / партнёры
  { key: 'masters.read', group: 'Мастера', label: 'Просмотр мастеров' },
  { key: 'masters.write', group: 'Мастера', label: 'Создание / снятие мастеров' },
  { key: 'masters.restore', group: 'Мастера', label: 'Восстановление мастеров' },
  { key: 'partners.read', group: 'Партнёры', label: 'Просмотр партнёров' },
  { key: 'partners.write', group: 'Партнёры', label: 'Создание партнёров' },

  // Касса
  { key: 'cash.read', group: 'Касса', label: 'Просмотр кассы' },
  { key: 'cash.income', group: 'Касса', label: 'Приход' },
  { key: 'cash.expense', group: 'Касса', label: 'Расход' },
  { key: 'cash.expense_full', group: 'Касса', label: 'Все виды расхода' },
  { key: 'cash.collection', group: 'Касса', label: 'Инкассация' },

  // Расчёты
  { key: 'settlements.read', group: 'Расчёт', label: 'Просмотр расчётов' },
  { key: 'settlements.write', group: 'Расчёт', label: 'Создание и подтверждение' },
  { key: 'settlements.pay', group: 'Расчёт', label: 'Приём сдачи в кассу' },

  // Отчёты / реклама / имущество / чат
  { key: 'reports.read', group: 'Отчёты', label: 'Отчёты' },
  { key: 'ads.read', group: 'Реклама', label: 'Просмотр рекламы' },
  { key: 'ads.write', group: 'Реклама', label: 'Ввод рекламы' },
  { key: 'assets.read', group: 'Имущество', label: 'Просмотр имущества' },
  { key: 'assets.write', group: 'Имущество', label: 'Выдача / списание' },
  { key: 'chat.read', group: 'Чаты', label: 'Просмотр чатов' },
  { key: 'chat.write', group: 'Чаты', label: 'Сообщения в чатах' },

  // Сотрудники
  { key: 'users.read', group: 'Управление CRM', label: 'Просмотр сотрудников' },
  { key: 'users.create', group: 'Управление CRM', label: 'Создание сотрудников' },
  { key: 'users.fire', group: 'Управление CRM', label: 'Увольнение' },
  { key: 'users.restore', group: 'Управление CRM', label: 'Восстановление' },
  { key: 'users.passport', group: 'Управление CRM', label: 'Паспорт / фото' },
  { key: 'users.branches', group: 'Управление CRM', label: 'Филиалы директора' },

  // Настройки
  { key: 'cities.read', group: 'Настройки', label: 'Просмотр филиалов' },
  { key: 'cities.manage', group: 'Настройки', label: 'Управление филиалами' },
  { key: 'salary.read', group: 'Настройки', label: 'Просмотр настроек ЗП' },
  { key: 'salary.write', group: 'Настройки', label: 'Изменение настроек ЗП' },
  { key: 'salary.delete', group: 'Настройки', label: 'Удаление категорий ЗП' },
  { key: 'settings.dispatcher_pay', group: 'Настройки', label: 'ЗП и график диспетчеров' },
  { key: 'settings.bot', group: 'Настройки', label: 'Бот Telegram' },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export function isOfficeRole(role: string): boolean {
  return role === 'ADMIN' || role === 'DIRECTOR' || role === 'OWNER';
}

/**
 * Временный fallback для ADMIN/DIRECTOR с пустым permissions[]
 * (старые записи до ввода каталога). После пересохранения прав — deny при [].
 */
export function roleDefaultPermissions(role: string): string[] {
  if (role === 'OWNER') return [...ALL_PERMISSION_KEYS];
  if (role === 'ADMIN' || role === 'DIRECTOR') return [...ALL_PERMISSION_KEYS];
  return [];
}

/** Эффективный набор ключей для проверки guard / UI. */
export function effectivePermissions(
  role: string,
  stored: string[] | null | undefined,
): string[] {
  if (role === 'OWNER') return [...ALL_PERMISSION_KEYS];
  // Диспетчер: доступ к офисным эндпоинтам через bypass в guard;
  // для единообразия UI считаем полный набор ключей.
  if (role === 'DISPATCHER') return [...ALL_PERMISSION_KEYS];
  if (role === 'MASTER') return [];
  const list = stored ?? [];
  if (list.length === 0) return roleDefaultPermissions(role);
  return [...new Set(list.filter((k) => ALL_PERMISSION_KEYS.includes(k)))];
}

export function hasPermission(
  role: string,
  stored: string[] | null | undefined,
  required: string[],
): boolean {
  if (!required.length) return true;
  if (role === 'OWNER') return true;
  if (role === 'MASTER' || role === 'DISPATCHER') return true;
  const eff = new Set(effectivePermissions(role, stored));
  return required.some((k) => eff.has(k));
}

export function parsePermissionsInput(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map(String);
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) list = parsed.map(String);
      else list = s.split(',').map((x) => x.trim());
    } catch {
      list = s.split(',').map((x) => x.trim());
    }
  }
  const allowed = new Set(ALL_PERMISSION_KEYS);
  return [...new Set(list.filter((k) => allowed.has(k)))];
}
