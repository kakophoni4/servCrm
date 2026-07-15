'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Dict = { id: string; name?: string; label?: string };

export default function NewOrderPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Dict[]>([]);
  const [ages, setAges] = useState<Dict[]>([]);
  const [cities, setCities] = useState<Dict[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '',
    type: 'NEW',
    sourceKind: 'OUR',
    sourceOur: 'AVITO',
    partnerId: '',
    scheduledAt: '',
    address: '',
    ageCategoryId: '',
    comment: '',
    isClaim: false,
    isProfile: true,
    typeTech: '',
    cityId: '',
    branchComment: '',
  });

  useEffect(() => {
    Promise.all([
      api<Dict[]>('/partners'),
      api<Dict[]>('/cities/age-categories'),
      api<Dict[]>('/cities'),
    ])
      .then(([p, a, c]) => {
        setPartners(p);
        setAges(a);
        setCities(c);
        if (a[0]) setForm((f) => ({ ...f, ageCategoryId: a[0].id }));
        if (c[0]) setForm((f) => ({ ...f, cityId: c[0].id }));
        if (p[0]) setForm((f) => ({ ...f, partnerId: p[0].id }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка справочников'));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body = {
        clientName: form.clientName,
        clientPhone: form.clientPhone,
        type: form.type,
        sourceKind: form.sourceKind,
        sourceOur: form.sourceKind === 'OUR' ? form.sourceOur : undefined,
        partnerId: form.sourceKind === 'PARTNER' ? form.partnerId : undefined,
        scheduledAt: form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : undefined,
        address: form.address,
        ageCategoryId: form.ageCategoryId || undefined,
        comment: form.comment || undefined,
        isClaim: form.isClaim,
        isProfile: form.isProfile,
        typeTech: form.typeTech || undefined,
        cityId: form.cityId || undefined,
        branchComment: form.branchComment || undefined,
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
    <div>
      <h1 className="page-title">Новая заявка</h1>
      <form className="panel" onSubmit={onSubmit}>
        <div className="grid-2">
          <div className="field">
            <label>Имя клиента</label>
            <input
              required
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Телефон</label>
            <input
              required
              value={form.clientPhone}
              onChange={(e) => set('clientPhone', e.target.value)}
              placeholder="+7…"
            />
          </div>
          <div className="field">
            <label>Тип</label>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="NEW">Новый клиент</option>
              <option value="WARRANTY">Гарантия</option>
              <option value="REPEAT">Повторный заказ</option>
            </select>
          </div>
          <div className="field">
            <label>Дата/время выполнения</label>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => set('scheduledAt', e.target.value)}
            />
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
                value={form.partnerId}
                onChange={(e) => set('partnerId', e.target.value)}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Возрастная категория</label>
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
          <div className="field">
            <label>Город</label>
            <select
              value={form.cityId}
              onChange={(e) => set('cityId', e.target.value)}
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Адрес</label>
          <input
            required
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Тип техники</label>
          <input
            value={form.typeTech}
            onChange={(e) => set('typeTech', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Комментарий по заявке</label>
          <textarea
            rows={3}
            value={form.comment}
            onChange={(e) => set('comment', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Комментарий филиала (карточка клиента)</label>
          <textarea
            rows={2}
            value={form.branchComment}
            onChange={(e) => set('branchComment', e.target.value)}
          />
        </div>
        <div className="grid-2">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.isClaim}
              onChange={(e) => set('isClaim', e.target.checked)}
            />
            Претензионная заявка
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.isProfile}
              onChange={(e) => set('isProfile', e.target.checked)}
            />
            Профильная заявка
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Сохраняем…' : 'Создать заявку'}
          </button>
        </div>
      </form>
    </div>
  );
}
