export type PermissionDef = {
  key: string;
  group: string;
  label: string;
};

/** Должен совпадать с apps/api/src/common/permissions/permissions.ts */
export const PERMISSIONS: PermissionDef[] = [
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
  { key: 'clients.read', group: 'Клиенты', label: 'Просмотр клиентов' },
  { key: 'clients.comment', group: 'Клиенты', label: 'Комментарий филиала' },
  { key: 'claims.read', group: 'Претензии', label: 'Просмотр претензий' },
  { key: 'claims.write', group: 'Претензии', label: 'Создание и закрытие претензий' },
  { key: 'masters.read', group: 'Мастера', label: 'Просмотр мастеров' },
  { key: 'masters.write', group: 'Мастера', label: 'Создание / снятие мастеров' },
  { key: 'masters.restore', group: 'Мастера', label: 'Восстановление мастеров' },
  { key: 'partners.read', group: 'Партнёры', label: 'Просмотр партнёров' },
  { key: 'partners.write', group: 'Партнёры', label: 'Создание партнёров' },
  { key: 'cash.read', group: 'Касса', label: 'Просмотр кассы' },
  { key: 'cash.income', group: 'Касса', label: 'Приход' },
  { key: 'cash.expense', group: 'Касса', label: 'Расход' },
  { key: 'cash.expense_full', group: 'Касса', label: 'Все виды расхода' },
  { key: 'cash.collection', group: 'Касса', label: 'Инкассация' },
  { key: 'settlements.read', group: 'Расчёт', label: 'Просмотр расчётов' },
  { key: 'settlements.write', group: 'Расчёт', label: 'Создание и подтверждение' },
  { key: 'settlements.pay', group: 'Расчёт', label: 'Приём сдачи в кассу' },
  { key: 'reports.read', group: 'Отчёты', label: 'Отчёты' },
  { key: 'ads.read', group: 'Реклама', label: 'Просмотр рекламы' },
  { key: 'ads.write', group: 'Реклама', label: 'Ввод рекламы' },
  { key: 'assets.read', group: 'Имущество', label: 'Просмотр имущества' },
  { key: 'assets.write', group: 'Имущество', label: 'Выдача / списание' },
  { key: 'chat.read', group: 'Чаты', label: 'Просмотр чатов' },
  { key: 'chat.write', group: 'Чаты', label: 'Сообщения в чатах' },
  { key: 'users.read', group: 'Управление CRM', label: 'Просмотр сотрудников' },
  { key: 'users.create', group: 'Управление CRM', label: 'Создание сотрудников' },
  { key: 'users.fire', group: 'Управление CRM', label: 'Увольнение' },
  { key: 'users.restore', group: 'Управление CRM', label: 'Восстановление' },
  { key: 'users.passport', group: 'Управление CRM', label: 'Паспорт / фото' },
  { key: 'users.branches', group: 'Управление CRM', label: 'Филиалы директора' },
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

/** Как на API: пустой permissions[] у ADMIN/DIRECTOR = полный доступ (legacy). */
export function roleDefaultPermissions(role: string): string[] {
  if (role === 'OWNER') return [...ALL_PERMISSION_KEYS];
  if (role === 'ADMIN' || role === 'DIRECTOR') return [...ALL_PERMISSION_KEYS];
  return [];
}

export function effectivePermissions(
  role: string,
  stored: string[] | null | undefined,
): string[] {
  if (role === 'OWNER') return [...ALL_PERMISSION_KEYS];
  if (role === 'MASTER' || role === 'DISPATCHER') return [...ALL_PERMISSION_KEYS];
  const list = stored ?? [];
  if (list.length === 0) return roleDefaultPermissions(role);
  return [...new Set(list.filter((k) => ALL_PERMISSION_KEYS.includes(k)))];
}

export function hasPermission(
  role: string,
  stored: string[] | null | undefined,
  required: string | string[],
): boolean {
  const keys = Array.isArray(required) ? required : [required];
  if (!keys.length) return true;
  if (role === 'OWNER' || role === 'MASTER' || role === 'DISPATCHER') {
    return true;
  }
  const eff = new Set(effectivePermissions(role, stored));
  return keys.some((k) => eff.has(k));
}

/** Проверка по текущему пользователю из localStorage. */
export function userHasPermission(required: string | string[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('crm_user');
    if (!raw) return false;
    const user = JSON.parse(raw) as {
      role?: string;
      permissions?: string[];
    };
    return hasPermission(user.role ?? '', user.permissions, required);
  } catch {
    return false;
  }
}

export function groupPermissions(list: PermissionDef[] = PERMISSIONS) {
  const map = new Map<string, PermissionDef[]>();
  for (const p of list) {
    const cur = map.get(p.group) ?? [];
    cur.push(p);
    map.set(p.group, cur);
  }
  return [...map.entries()];
}
