'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, downloadFile, uploadFiles } from '@/lib/api';

type AdReport = {
  id: string;
  reportDate: string;
  promotersCount: number;
  leafletsIssued: number;
  leafletsSpread: number;
  cardsIssued: number;
  cardsSpread: number;
  stickersIssued: number;
  stickersSpread: number;
  avitoAdsCount: number;
  leafletsStock: number;
  cardsStock: number;
  documentPath?: string | null;
  createdAt: string;
  city?: { name: string } | null;
  createdBy?: { fullName: string } | null;
};

const emptyForm = {
  reportDate: new Date().toISOString().slice(0, 10),
  promotersCount: '0',
  leafletsIssued: '0',
  leafletsSpread: '0',
  cardsIssued: '0',
  cardsSpread: '0',
  stickersIssued: '0',
  stickersSpread: '0',
  avitoAdsCount: '0',
  leafletsStock: '0',
  cardsStock: '0',
};

export default function AdsPage() {
  const [reports, setReports] = useState<AdReport[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  async function load() {
    setReports(await api<AdReport[]>('/ads'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/ads', {
        method: 'POST',
        body: JSON.stringify({
          reportDate: form.reportDate,
          promotersCount: Number(form.promotersCount),
          leafletsIssued: Number(form.leafletsIssued),
          leafletsSpread: Number(form.leafletsSpread),
          cardsIssued: Number(form.cardsIssued),
          cardsSpread: Number(form.cardsSpread),
          stickersIssued: Number(form.stickersIssued),
          stickersSpread: Number(form.stickersSpread),
          avitoAdsCount: Number(form.avitoAdsCount),
          leafletsStock: Number(form.leafletsStock),
          cardsStock: Number(form.cardsStock),
        }),
      });
      setForm({ ...emptyForm, reportDate: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function uploadScreenshot(id: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      await uploadFiles(`/ads/${id}/screenshot`, fd);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }

  async function viewScreenshot(id: string) {
    try {
      await downloadFile(`/ads/${id}/screenshot`, `ad-${id}.jpg`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function numField(key: keyof typeof form, label: string) {
    return (
      <div className="field">
        <label>{label}</label>
        <input
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Реклама — ежедневный отчёт</h1>

      <form className="panel" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Дата отчёта</label>
            <input
              type="date"
              required
              value={form.reportDate}
              onChange={(e) => setForm({ ...form, reportDate: e.target.value })}
            />
          </div>
          {numField('promotersCount', 'Промоутеров')}
          {numField('leafletsIssued', 'Листовок выдано')}
          {numField('leafletsSpread', 'Листовок разнесено')}
          {numField('cardsIssued', 'Визиток выдано')}
          {numField('cardsSpread', 'Визиток разнесено')}
          {numField('stickersIssued', 'Наклеек выдано')}
          {numField('stickersSpread', 'Наклеек разнесено')}
          {numField('avitoAdsCount', 'Объявлений Авито')}
          {numField('leafletsStock', 'Остаток листовок')}
          {numField('cardsStock', 'Остаток визиток')}
        </div>
        <button className="btn" type="submit">
          Сохранить отчёт
        </button>
      </form>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Город</th>
              <th>Промоутеры</th>
              <th>Листовки</th>
              <th>Визитки</th>
              <th>Авито</th>
              <th>Кто</th>
              <th>Скрин</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.reportDate).toLocaleDateString('ru-RU')}</td>
                <td>{r.city?.name ?? '—'}</td>
                <td>{r.promotersCount}</td>
                <td>
                  {r.leafletsSpread}/{r.leafletsIssued} (ост. {r.leafletsStock})
                </td>
                <td>
                  {r.cardsSpread}/{r.cardsIssued} (ост. {r.cardsStock})
                </td>
                <td>{r.avitoAdsCount}</td>
                <td>{r.createdBy?.fullName ?? '—'}</td>
                <td>
                  {r.documentPath ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => viewScreenshot(r.id)}
                    >
                      Скачать
                    </button>
                  ) : (
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => uploadScreenshot(r.id, e.target.files)}
                    />
                  )}
                </td>
              </tr>
            ))}
            {reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  Отчётов пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
