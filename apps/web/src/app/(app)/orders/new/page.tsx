'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AutoTextarea } from '@/components/AutoTextarea';
import { BranchSelect, type BranchCity } from '@/components/BranchSelect';
import { DateTimeField } from '@/components/DateTimeField';
import { api } from '@/lib/api';
import { digitsPhone, formatRuPhoneInput } from '@/lib/phone';

type Dict = { id: string; name?: string; label?: string };
type ClientHit = {
  id: string;
  name: string;
  phoneNormalized: string;
  _count?: { orders: number };
};

export default function NewOrderPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Dict[]>([]);
  const [ages, setAges] = useState<Dict[]>([]);
  const [cities, setCities] = useState<BranchCity[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientHint, setClientHint] = useState('');
  const phoneLookupSeq = useRef(0);

  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '+7 ',
    type: 'NEW',
    sourceKind: 'OUR',
    sourceOur: 'AVITO',
    partnerId: '',
    address: '',
    ageCategoryId: '',
    comment: '',
    isProfile: true,
    typeTech: '',
    cityId: '',
    scheduledAt: '',
  });

  useEffect(() => {
    Promise.all([
      api<Dict[]>('/partners'),
      api<Dict[]>('/cities/age-categories'),
      api<BranchCity[]>('/cities'),
    ])
      .then(([p, a, c]) => {
        setPartners(p);
        setAges(a);
        setCities(c);
        if (a[0]) setForm((f) => ({ ...f, ageCategoryId: a[0].id }));
        if (c[0]) setForm((f) => ({ ...f, cityId: c[0].id }));
        if (p[0]) setForm((f) => ({ ...f, partnerId: p[0].id }));
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Ошибка справочников'),
      );
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function lookupClientByPhone(phoneRaw: string) {
    const digits = digitsPhone(phoneRaw);
    if (digits.length < 11) {
      setClientHint('');
      return;
    }
    const seq = ++phoneLookupSeq.current;
    try {
      const hits = await api<ClientHit[]>(
        `/clients?phone=${encodeURIComponent(digits)}`,
      );
      if (seq !== phoneLookupSeq.current) return;
      const exact =
        hits.find((c) => c.phoneNormalized === digits) ?? hits[0] ?? null;
      if (!exact) {
        setClientHint('Новый клиент');
        return;
      }
      setForm((f) => ({
        ...f,
        clientName: exact.name,
        type: f.type === 'WARRANTY' ? 'WARRANTY' : 'REPEAT',
      }));
      const n = exact._count?.orders ?? 0;
      setClientHint(
        n > 0 ? `Клиент уже есть · ${n} заявок` : 'Клиент уже есть',
      );
    } catch {
      if (seq === phoneLookupSeq.current) setClientHint('');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const phoneDigits = digitsPhone(form.clientPhone);
    if (phoneDigits.length < 11) {
      setError('Укажите полный номер телефона');
      setLoading(false);
      return;
    }
    if (!form.scheduledAt) {
      setError('Укажите время по заказу');
      setLoading(false);
      return;
    }
    const scheduledIso = new Date(form.scheduledAt).toISOString();
    if (Number.isNaN(Date.parse(scheduledIso))) {
      setError('Некорректное время по заказу');
      setLoading(false);
      return;
    }
    try {
      const body = {
        clientName: form.clientName,
        clientPhone: phoneDigits,
        type: form.type,
        sourceKind: form.sourceKind,
        sourceOur: form.sourceKind === 'OUR' ? form.sourceOur : undefined,
        partnerId: form.sourceKind === 'PARTNER' ? form.partnerId : undefined,
        scheduledAt: scheduledIso,
        address: form.address,
        ageCategoryId: form.ageCategoryId || undefined,
        comment: form.comment || undefined,
        isProfile: form.isProfile,
        typeTech: form.typeTech || undefined,
        cityId: form.cityId || undefined,
      };
      const order = await api<{ id: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      router.replace(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="order-new-page">
      <h1 className="page-title">Новая заявка</h1>
      <form className="panel order-new-form" onSubmit={onSubmit}>
        <section className="order-new-section">
          <h2 className="order-new-section-title">Клиент</h2>
          <div className="order-new-grid">
            <div className="field">
              <label>Телефон</label>
              <input
                required
                inputMode="tel"
                autoComplete="tel"
                value={form.clientPhone}
                onChange={(e) => {
                  const next = formatRuPhoneInput(e.target.value);
                  set('clientPhone', next);
                  if (digitsPhone(next).length < 11) setClientHint('');
                }}
                onBlur={() => void lookupClientByPhone(form.clientPhone)}
                placeholder="+7 (999) 123-45-67"
              />
              {clientHint ? (
                <p className="muted order-new-phone-hint">{clientHint}</p>
              ) : null}
            </div>
            <div className="field">
              <label>Имя клиента</label>
              <input
                required
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                placeholder="Как обращаться"
              />
            </div>
          </div>
        </section>

        <section className="order-new-section">
          <h2 className="order-new-section-title">Заявка</h2>
          <div className="order-new-grid">
            <div className="field">
              <label>Тип</label>
              <select
                value={form.type === 'REPEAT' ? 'NEW' : form.type}
                onChange={(e) => set('type', e.target.value)}
              >
                <option value="NEW">Обычная</option>
                <option value="WARRANTY">Гарантия</option>
              </select>
            </div>
            <div className="field">
              <label>Источник</label>
              <select
                value={form.sourceKind}
                onChange={(e) => set('sourceKind', e.target.value)}
              >
                <option value="OUR">Наша заявка</option>
                <option value="PARTNER">Партнёрская</option>
              </select>
            </div>
            {form.sourceKind === 'OUR' ? (
              <div className="field">
                <label>Канал</label>
                <select
                  value={form.sourceOur}
                  onChange={(e) => set('sourceOur', e.target.value)}
                >
                  <option value="AVITO">Авито</option>
                  <option value="LEAFLET">Листовка</option>
                </select>
              </div>
            ) : (
              <div className="field">
                <label>Партнёр</label>
                <select
                  required
                  value={form.partnerId}
                  onChange={(e) => set('partnerId', e.target.value)}
                >
                  <option value="">— выберите партнёра —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Возраст</label>
              <select
                value={form.ageCategoryId}
                onChange={(e) => set('ageCategoryId', e.target.value)}
              >
                {ages.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <BranchSelect
              cities={cities}
              value={form.cityId}
              onChange={(cityId) => set('cityId', cityId)}
            />
            <div className="field">
              <label>Время по заказу</label>
              <DateTimeField
                required
                value={form.scheduledAt}
                onChange={(scheduledAt) => set('scheduledAt', scheduledAt)}
              />
            </div>
          </div>
        </section>

        <section className="order-new-section">
          <h2 className="order-new-section-title">Адрес и детали</h2>
          <div className="order-new-grid order-new-grid-details">
            <div className="field order-new-field-wide">
              <label>Адрес</label>
              <input
                required
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Улица, дом, квартира"
              />
            </div>
            <div className="field">
              <label>Тип техники</label>
              <input
                value={form.typeTech}
                onChange={(e) => set('typeTech', e.target.value)}
                placeholder="Холодильник, стиралка…"
              />
            </div>
            <div className="field order-new-field-wide">
              <label>Комментарий</label>
              <AutoTextarea
                value={form.comment}
                onChange={(e) => set('comment', e.target.value)}
                placeholder="Необязательно"
              />
            </div>
          </div>
        </section>

        <div className="order-new-footer">
          <label className="order-new-check">
            <input
              type="checkbox"
              checked={form.isProfile}
              onChange={(e) => set('isProfile', e.target.checked)}
            />
            Профильная заявка
          </label>
          {error ? <p className="error order-new-error">{error}</p> : null}
          <button
            className="btn order-new-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Сохраняем…' : 'Создать заявку'}
          </button>
        </div>
      </form>
    </div>
  );
}
