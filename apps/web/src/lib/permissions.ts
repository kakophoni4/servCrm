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
  { key: 'users.read', group: 'Сотрудники', label: 'Просмотр сотрудников' },
  { key: 'users.create', group: 'Сотрудники', label: 'Создание сотрудников' },
  { key: 'users.fire', group: 'Сотрудники', label: 'Увольнение' },
  { key: 'users.restore', group: 'Сотрудники', label: 'Восстановление' },
  { key: 'users.passport', group: 'Сотрудники', label: 'Паспорт / фото' },
  { key: 'users.branches', group: 'Сотрудники', label: 'Филиалы директора' },
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

export function groupPermissions(list: PermissionDef[] = PERMISSIONS) {
  const map = new Map<string, PermissionDef[]>();
  for (const p of list) {
    const cur = map.get(p.group) ?? [];
    cur.push(p);
    map.set(p.group, cur);
  }
  return [...map.entries()];
}
