'use client';

import { FormEvent, useEffect, useState } from 'react';
import { OpsShell } from '@/components/ops/OpsShell';
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

type FormState = {
  reportDate: string;
  promotersCount: string;
  leafletsIssued: string;
  leafletsSpread: string;
  cardsIssued: string;
  cardsSpread: string;
  stickersIssued: string;
  stickersSpread: string;
  avitoAdsCount: string;
  leafletsStock: string;
  cardsStock: string;
};

const emptyForm = (): FormState => ({
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
});

export default function AdsPage() {
  const [reports, setReports] = useState<AdReport[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');

  async function load() {
    setReports(await api<AdReport[]>('/ads'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  function setNum(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
      setForm(emptyForm());
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

  return (
    <OpsShell>
    <div>
      <form className="panel ads-form" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
        <div className="ads-form-meta">
          <div className="field">
            <label>Дата</label>
            <input
              type="date"
              required
              value={form.reportDate}
              onChange={(e) => setNum('reportDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Промоутеров</label>
            <input
              inputMode="numeric"
              value={form.promotersCount}
              onChange={(e) => setNum('promotersCount', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Авито</label>
            <input
              inputMode="numeric"
              value={form.avitoAdsCount}
              onChange={(e) => setNum('avitoAdsCount', e.target.value)}
            />
          </div>
        </div>

        <table className="ads-matrix">
          <thead>
            <tr>
              <th></th>
              <th>Выдано</th>
              <th>Разнесено</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Листовки</td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.leafletsIssued}
                  onChange={(e) => setNum('leafletsIssued', e.target.value)}
                />
              </td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.leafletsSpread}
                  onChange={(e) => setNum('leafletsSpread', e.target.value)}
                />
              </td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.leafletsStock}
                  onChange={(e) => setNum('leafletsStock', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td>Визитки</td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.cardsIssued}
                  onChange={(e) => setNum('cardsIssued', e.target.value)}
                />
              </td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.cardsSpread}
                  onChange={(e) => setNum('cardsSpread', e.target.value)}
                />
              </td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.cardsStock}
                  onChange={(e) => setNum('cardsStock', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td>Наклейки</td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.stickersIssued}
                  onChange={(e) => setNum('stickersIssued', e.target.value)}
                />
              </td>
              <td>
                <input
                  inputMode="numeric"
                  value={form.stickersSpread}
                  onChange={(e) => setNum('stickersSpread', e.target.value)}
                />
              </td>
              <td className="muted">—</td>
            </tr>
          </tbody>
        </table>

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
              <th>Филиал</th>
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
                    <label className="file-picker" style={{ padding: '0.35rem 0.55rem' }}>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => uploadScreenshot(r.id, e.target.files)}
                      />
                      <span className="file-picker-title" style={{ fontSize: '0.85rem' }}>
                        Загрузить
                      </span>
                    </label>
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
    </OpsShell>
  );
}
