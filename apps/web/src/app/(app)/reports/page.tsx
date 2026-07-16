'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  CASH_DIRECTION_LABELS,
  CASH_EXPENSE_BASIS_LABELS,
  monthRange,
} from '@/lib/labels';

const MONTH_LABELS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

type ReportTab =
  | 'closed'
  | 'cancels'
  | 'cash'
  | 'masters'
  | 'partners'
  | 'claims'
  | 'ads';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'closed', label: 'Закрытые заявки' },
  { id: 'cancels', label: 'Отмены' },
  { id: 'cash', label: 'Касса' },
  { id: 'masters', label: 'Мастера' },
  { id: 'partners', label: 'Партнёры' },
  { id: 'claims', label: 'Претензии' },
  { id: 'ads', label: 'Реклама' },
];

const FIELD_LABELS: Record<string, string> = {
  period: 'Период',
  closed: 'Закрыто',
  ours: 'Наши',
  partner: 'Партнёрские',
  ourNetSum: 'Чистыми наши',
  partnerNetSum: 'Чистыми партнёры',
  claimsPercent: '% претензий',
  netSum: 'Чистая сумма',
  partnerName: 'Партнёр',
  paid: 'Оплачено клиентом',
  avgCheckHandover: 'Ср. чек сдачи',
  avgCheckSalary: 'Ср. чек ЗП',
  avgCheckTotal: 'Ср. чек общий',
  avgWorkSum: 'Ср. сумма работы',
  forecastTurnover: 'Прогноз оборота',
  orderPrice: 'Цена заявки',
  adsExpenseSum: 'Расход на рекламу',
  ordersInPeriod: 'Заявок за период',
  total: 'Всего',
  refusal: 'Отказ',
  cancelledCc: 'Отмена КЦ',
  byMasterFault: 'По вине мастера',
  byAdminFault: 'По вине администратора',
  faultUnset: 'Вина не указана',
  our: 'Наши',
  leafletsStock: 'Остаток листовок',
  cardsStock: 'Остаток визиток',
  avitoAds: 'Объявлений Авито',
  promoters: 'Промоутеров',
  leafletOrders: 'Заявок с листовок',
  avitoOrders: 'Заявок с Авито',
  kpiLeaflets: 'KPI листовки',
  kpiAvito: 'KPI Авито',
  master: 'Мастер',
  turnover: 'Оборот',
  salary: 'Зарплата',
  net: 'Чистыми',
  work: 'Работы',
  parts: 'Запчасти',
  count: 'Заявок',
  micro: 'Микра (<4к)',
  pct4: '4% от оборота',
  openSd: 'Открытых СД',
  avgNet: 'Ср. чистый чек',
  avgWork: 'Ср. чек работы',
  id: 'ID',
  publicId: 'Номер',
  createdAt: 'Дата',
  status: 'Статус',
  cityId: 'ID филиала',
  cityName: 'Филиал',
  incomeTotal: 'Приход общий',
  incomeOrders: 'Приход с заявок',
  incomeOther: 'Прочий приход',
  expensePromo: 'Расход промоутеров',
  expenseCollection: 'Расход инкасс',
  masterSalary: 'ЗП мастерам',
  partsCost: 'Запчасти',
  expenseAds: 'Расход по объявлениям',
  expenseTotal: 'Общий расход',
  balance: 'Остаток',
  date: 'Дата',
  direction: 'Тип',
  expenseBasis: 'Статья',
  amount: 'Сумма',
  description: 'Комментарий',
  orderPublicId: 'Заявка',
  createdBy: 'Кто',
  documentPath: 'Документ',
  name: 'Название',
  phone: 'Телефон',
  client: 'Клиент',
  city: 'Филиал',
  order: 'Заявка',
  reason: 'Причина',
  reportDate: 'Дата отчёта',
  promotersCount: 'Промоутеров',
  leafletsIssued: 'Листовок выдано',
  leafletsSpread: 'Листовок разнесено',
  cardsIssued: 'Визиток выдано',
  cardsSpread: 'Визиток разнесено',
  stickersIssued: 'Стикеров выдано',
  stickersSpread: 'Стикеров разнесено',
  avitoAdsCount: 'Объявлений Авито',
};

const CASH_CITY_COLUMNS: { key: string; label: string }[] = [
  { key: 'cityName', label: 'Филиал' },
  { key: 'incomeTotal', label: 'Приход общий' },
  { key: 'incomeOrders', label: 'Приход с заявок' },
  { key: 'incomeOther', label: 'Прочий приход' },
  { key: 'expensePromo', label: 'Расход промоутеров' },
  { key: 'expenseCollection', label: 'Расход инкасс' },
  { key: 'masterSalary', label: 'ЗП мастерам' },
  { key: 'partsCost', label: 'Запчасти' },
  { key: 'expenseAds', label: 'Расход по объявлениям' },
  { key: 'expenseTotal', label: 'Общий расход' },
  { key: 'balance', label: 'Остаток' },
];

const CANCEL_CITY_COLUMNS: { key: string; label: string }[] = [
  { key: 'cityName', label: 'Филиал' },
  { key: 'total', label: 'Всего' },
  { key: 'partner', label: 'Партнёрские' },
  { key: 'our', label: 'Наши' },
  { key: 'refusal', label: 'Отказ' },
  { key: 'cancelledCc', label: 'Отмена КЦ' },
  { key: 'byMasterFault', label: 'По вине мастера' },
  { key: 'byAdminFault', label: 'По вине администратора' },
];

const CLAIM_TYPE_LABELS: Record<string, string> = {
  POLICE: 'Полиция',
  MASTER_BROKE: 'Мастер сломал технику',
  PRICE_DISSATISFIED: 'Недоволен ценой',
};

const CLAIM_COLUMNS: { key: string; label: string }[] = [
  { key: 'date', label: 'Дата' },
  { key: 'orderPublicId', label: 'Заявка' },
  { key: 'clientName', label: 'Клиент' },
  { key: 'type', label: 'Тип' },
  { key: 'cityName', label: 'Филиал' },
  { key: 'refundSum', label: 'Возврат' },
  { key: 'orderSum', label: 'Сумма заявки' },
  { key: 'status', label: 'Статус' },
];

const PARTNER_COLUMNS: { key: string; label: string }[] = [
  { key: 'partnerName', label: 'Партнёр' },
  { key: 'count', label: 'Заявок' },
  { key: 'paid', label: 'Оплачено' },
  { key: 'work', label: 'Работы' },
  { key: 'salary', label: 'ЗП мастерам' },
  { key: 'net', label: 'Чистыми' },
  { key: 'avgNet', label: 'Ср. чистый чек' },
];

function labelOf(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '—');
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function ReportsPage() {
  const now = new Date();
  const [tab, setTab] = useState<ReportTab>('closed');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { from, to } = monthRange(year, month);
      let path = '';
      if (tab === 'closed') path = `/reports/closed?from=${from}&to=${to}`;
      else if (tab === 'cancels') path = `/reports/cancels?from=${from}&to=${to}`;
      else if (tab === 'cash') path = `/reports/cash?from=${from}&to=${to}`;
      else if (tab === 'masters') path = `/reports/masters?from=${from}&to=${to}`;
      else if (tab === 'partners')
        path = `/reports/partners?from=${from}&to=${to}`;
      else if (tab === 'claims') path = `/reports/claims?from=${from}&to=${to}`;
      else path = `/reports/ads?from=${from}&to=${to}`;

      setData(await api(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, year, month]);

  function formatCell(v: unknown, key?: string): string {
    if (v == null) return '—';
    if (key === 'direction') {
      return CASH_DIRECTION_LABELS[String(v)] ?? String(v);
    }
    if (key === 'expenseBasis') {
      return CASH_EXPENSE_BASIS_LABELS[String(v)] ?? String(v);
    }
    if (
      key &&
      (key.includes('Percent') ||
        key.startsWith('avg') ||
        key.includes('Sum') ||
        key.includes('Price') ||
        key.includes('income') ||
        key.includes('expense') ||
        key.includes('balance') ||
        key.includes('Salary') ||
        key === 'amount' ||
        key === 'turnover' ||
        key === 'salary' ||
        key === 'net' ||
        key === 'work' ||
        key === 'parts' ||
        key === 'paid' ||
        key === 'pct4' ||
        key === 'forecastTurnover' ||
        key === 'ourNetSum' ||
        key === 'partnerNetSum' ||
        key === 'kpiLeaflets' ||
        key === 'kpiAvito')
    ) {
      return formatMoney(v);
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      return new Date(v).toLocaleString('ru-RU');
    }
    if (typeof v === 'object') {
      if (
        v &&
        typeof v === 'object' &&
        'from' in v &&
        'to' in v &&
        (v as { from: unknown }).from &&
        (v as { to: unknown }).to
      ) {
        const p = v as { from: string; to: string };
        return `${new Date(p.from).toLocaleDateString('ru-RU')} — ${new Date(p.to).toLocaleDateString('ru-RU')}`;
      }
      if (v && typeof v === 'object' && 'name' in v) {
        return String((v as { name: unknown }).name);
      }
      if (v && typeof v === 'object' && 'publicId' in v) {
        return String((v as { publicId: unknown }).publicId);
      }
      if (v && typeof v === 'object' && 'fullName' in v) {
        return String((v as { fullName: unknown }).fullName);
      }
      return JSON.stringify(v);
    }
    return String(v);
  }

  function renderTable(rows: Record<string, unknown>[], skipKeys: string[] = []) {
    if (!rows.length) return <p className="muted">Нет данных за период.</p>;
    const hidden = new Set(['masterId', 'partnerId', 'cityId', ...skipKeys]);
    const keys = Object.keys(rows[0]).filter((k) => !hidden.has(k));
    return (
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{labelOf(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {keys.map((k) => (
                  <td key={k}>{formatCell(row[k], k)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /**
   * Сводка отчёта: одна главная цифра + группы строк (без плиток).
   */
  function renderMetrics(
    obj: Record<string, unknown>,
    skipKeys: string[] = [],
  ) {
    const period = obj.period;
    const entries = Object.entries(obj).filter(
      ([k]) => k !== 'period' && !skipKeys.includes(k),
    );
    if (!entries.length && !period) {
      return <p className="muted">Нет данных за период.</p>;
    }

    const byKey = new Map(entries);
    const used = new Set<string>();

    const groups: { title: string; keys: string[] }[] = [
      {
        title: 'Объём',
        keys: [
          'closed',
          'ours',
          'partner',
          'our',
          'ordersInPeriod',
          'total',
          'refusal',
          'cancelledCc',
          'byMasterFault',
          'byAdminFault',
          'faultUnset',
          'promoters',
          'leafletOrders',
          'avitoOrders',
          'avitoAds',
        ],
      },
      {
        title: 'Деньги',
        keys: [
          'netSum',
          'ourNetSum',
          'partnerNetSum',
          'paid',
          'turnover',
          'salary',
          'net',
          'work',
          'parts',
          'adsExpenseSum',
          'orderPrice',
          'forecastTurnover',
        ],
      },
      {
        title: 'Средние и KPI',
        keys: [
          'avgCheckHandover',
          'avgCheckSalary',
          'avgCheckTotal',
          'avgWorkSum',
          'avgNet',
          'avgWork',
          'claimsPercent',
          'kpiLeaflets',
          'kpiAvito',
          'pct4',
          'micro',
          'openSd',
          'count',
        ],
      },
      {
        title: 'Остатки',
        keys: ['leafletsStock', 'cardsStock'],
      },
    ];

    const primaryKey =
      (
        [
          'netSum',
          'closed',
          'total',
          'balance',
          'turnover',
        ] as const
      ).find((k) => byKey.has(k)) ?? entries[0]?.[0];

    const renderedGroups = groups
      .map((g) => {
        const rows = g.keys
          .filter((k) => byKey.has(k) && k !== primaryKey)
          .map((k) => {
            used.add(k);
            return { key: k, value: byKey.get(k) };
          });
        return { title: g.title, rows };
      })
      .filter((g) => g.rows.length > 0);

    const rest = entries
      .filter(([k]) => k !== primaryKey && !used.has(k))
      .map(([k, v]) => ({ key: k, value: v }));
    if (rest.length) {
      renderedGroups.push({ title: 'Прочее', rows: rest });
    }

    return (
      <div className="report-summary">
        {period ? (
          <p className="muted report-period">
            {formatCell(period, 'period')}
          </p>
        ) : null}

        {primaryKey ? (
          <div className="report-summary-hero">
            <div className="report-summary-hero-label">
              {labelOf(primaryKey)}
            </div>
            <div className="report-summary-hero-value">
              {formatCell(byKey.get(primaryKey), primaryKey)}
            </div>
          </div>
        ) : null}

        <div className="report-summary-groups">
          {renderedGroups.map((g) => (
            <section key={g.title} className="report-summary-group">
              <h3 className="report-summary-group-title">{g.title}</h3>
              <dl className="report-kv-list">
                {g.rows.map((row) => (
                  <div key={row.key} className="report-kv">
                    <dt>{labelOf(row.key)}</dt>
                    <dd>{formatCell(row.value, row.key)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    );
  }

  function renderCash(obj: Record<string, unknown>) {
    const byCity = Array.isArray(obj.byCity)
      ? (obj.byCity as Record<string, unknown>[])
      : [];
    const totals = (obj.totals as Record<string, unknown>) ?? null;
    const notes = Array.isArray(obj.expenseNotes)
      ? (obj.expenseNotes as Record<string, unknown>[])
      : [];
    const rows = totals ? [...byCity, totals] : byCity;

    return (
      <div className="report-city-block">
        {obj.period ? (
          <p className="muted report-period">
            {formatCell(obj.period, 'period')}
          </p>
        ) : null}
        <h3 className="report-section-title">По филиалам</h3>
        {!rows.length ? (
          <p className="muted">Нет данных за период.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact report-city-table">
              <thead>
                <tr>
                  {CASH_CITY_COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      row.cityName === 'Итого' ? 'report-row-total' : undefined
                    }
                  >
                    {CASH_CITY_COLUMNS.map((c) => (
                      <td key={c.key}>
                        {c.key === 'cityName'
                          ? String(row[c.key] ?? '—')
                          : formatMoney(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="report-section-title">Пояснения по расходам</h3>
        {renderTable(notes, ['documentPath'])}
      </div>
    );
  }

  function renderCancels(obj: Record<string, unknown>) {
    const byCity = Array.isArray(obj.byCity)
      ? (obj.byCity as Record<string, unknown>[])
      : [];
    const totals = (obj.totals as Record<string, unknown>) ?? null;
    const rows = totals ? [...byCity, totals] : byCity;

    return (
      <div className="report-city-block">
        {obj.period ? (
          <p className="muted report-period">
            {formatCell(obj.period, 'period')}
          </p>
        ) : null}
        <h3 className="report-section-title">По филиалам</h3>
        {!rows.length ? (
          <p className="muted">Нет данных за период.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact report-city-table">
              <thead>
                <tr>
                  {CANCEL_CITY_COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      row.cityName === 'Итого' ? 'report-row-total' : undefined
                    }
                  >
                    {CANCEL_CITY_COLUMNS.map((c) => (
                      <td key={c.key}>
                        {c.key === 'cityName'
                          ? String(row[c.key] ?? '—')
                          : String(row[c.key] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function formatClaimCell(row: Record<string, unknown>, key: string): string {
    const v = row[key];
    if (key === 'date' && typeof v === 'string') {
      return new Date(v).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
    if (key === 'type') {
      return CLAIM_TYPE_LABELS[String(v)] ?? String(v ?? '—');
    }
    if (key === 'status') {
      return v === 'closed' ? 'Закрыта' : 'Открыта';
    }
    if (key === 'refundSum' || key === 'orderSum') {
      return formatMoney(v);
    }
    return v == null || v === '' ? '—' : String(v);
  }

  function renderClaims(obj: Record<string, unknown>) {
    const rows = Array.isArray(obj.rows)
      ? (obj.rows as Record<string, unknown>[])
      : [];

    return (
      <div className="report-city-block">
        {obj.period ? (
          <p className="muted report-period">
            {formatCell(obj.period, 'period')}
          </p>
        ) : null}
        <h3 className="report-section-title">Претензии за период</h3>
        {!rows.length ? (
          <p className="muted">Нет данных за период.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact report-city-table">
              <thead>
                <tr>
                  {CLAIM_COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {CLAIM_COLUMNS.map((c) => (
                      <td key={c.key}>{formatClaimCell(row, c.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderPartners(rows: Record<string, unknown>[]) {
    return (
      <div className="report-city-block">
        <h3 className="report-section-title">Партнёры за период</h3>
        {!rows.length ? (
          <p className="muted">Нет данных за период.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-compact report-city-table">
              <thead>
                <tr>
                  {PARTNER_COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {PARTNER_COLUMNS.map((c) => (
                      <td key={c.key}>
                        {c.key === 'partnerName' || c.key === 'count'
                          ? String(row[c.key] ?? '—')
                          : formatMoney(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderData() {
    if (loading) return <p className="muted">Загрузка…</p>;
    if (data == null) return null;

    if (tab === 'cash' && typeof data === 'object' && !Array.isArray(data)) {
      return renderCash(data as Record<string, unknown>);
    }

    if (tab === 'cancels' && typeof data === 'object' && !Array.isArray(data)) {
      return renderCancels(data as Record<string, unknown>);
    }

    if (tab === 'claims' && typeof data === 'object' && !Array.isArray(data)) {
      return renderClaims(data as Record<string, unknown>);
    }

    if (tab === 'partners' && Array.isArray(data)) {
      return renderPartners(data as Record<string, unknown>[]);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return <p className="muted">Нет данных за период.</p>;
      if (typeof data[0] === 'object' && data[0] !== null) {
        return renderTable(data as Record<string, unknown>[]);
      }
      return <pre style={{ overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>;
    }

    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return renderTable(obj.items as Record<string, unknown>[]);
      }
      if (Array.isArray(obj.rows) && tab === 'ads') {
        return (
          <div>
            {renderMetrics(obj, ['rows'])}
            <h3 className="report-section-title">Детализация</h3>
            {renderTable(obj.rows as Record<string, unknown>[])}
          </div>
        );
      }
      return renderMetrics(obj, ['rows', 'byCity', 'totals', 'expenseNotes']);
    }

    return <pre>{String(data)}</pre>;
  }

  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? 'Отчёт';

  return (
    <div className="reports-page">
      <h1 className="page-title settings-page-title">Отчёты</h1>

      <div className="reports-tabs" role="tablist" aria-label="Тип отчёта">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'btn' : 'btn secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-period-head">
          <h2 className="panel-period-title">{tabLabel}</h2>
          <div className="period-filters">
            <div className="field">
              <label>Месяц</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTH_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Год</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {renderData()}
      </div>
    </div>
  );
}
